const { query, pool } = require('../../src/utils/db');

class ManagerApprovalService {
  async getMyQueue(managerId, companyId) {
    const res = await query(`
      SELECT 
        ar.id AS "approvalRequestId",
        e.id AS "expenseId",
        ar.step_number AS "stepNumber",
        (SELECT COUNT(*) FROM approval_requests ar2 WHERE ar2.expense_id = e.id) AS "totalSteps",
        (SELECT COUNT(*) FROM approval_requests ar3 WHERE ar3.expense_id = e.id AND ar3.status IN ('approved', 'rejected')) AS "approvedSoFar",
        s.id AS "submitterId", s.name AS "submitterName",
        e.description, e.category, e.expense_date AS "expenseDate",
        e.amount, e.currency AS "currencyCode",
        e.amount AS "amountInBase", -- Defaulting to existing schema since amount_in_base is not in expenses
        e.currency AS "baseCurrencyCode",
        1.0 AS "exchangeRate", e.receipt_url AS "receiptUrl",
        ar.created_at AS "createdAt"
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      JOIN users s ON s.id = e.employee_id
      WHERE ar.approver_id = $1 AND ar.status = 'pending' AND e.company_id = $2
      ORDER BY ar.created_at DESC
    `, [managerId, companyId]);

    return res.rows.map(row => ({
      approvalRequestId: row.approvalRequestId,
      expenseId: row.expenseId,
      stepNumber: row.stepNumber,
      totalSteps: Number(row.totalSteps || 1),
      approvedSoFar: Number(row.approvedSoFar || 0),
      submitter: {
        id: row.submitterId,
        name: row.submitterName,
        avatarInitials: row.submitterName ? row.submitterName.split(' ').map(n=>n[0]).join('').toUpperCase().substring(0,2) : '?'
      },
      expense: {
        id: row.expenseId,
        description: row.description,
        category: row.category,
        expenseDate: row.expenseDate,
        amount: Number(row.amount),
        currencyCode: row.currencyCode,
        amountInBase: Number(row.amountInBase),
        baseCurrencyCode: row.baseCurrencyCode,
        exchangeRate: Number(row.exchangeRate),
        receiptUrl: row.receiptUrl
      },
      rule: {
        name: row.ruleName || 'Standard Approval',
        isSequential: true,
        percentageThreshold: null,
        keyApproverId: null
      },
      appliedRuleName: row.ruleName || 'Standard Approval',
      createdAt: row.createdAt
    }));
  }

  async getQueueStats(managerId, companyId) {
    const pendingRes = await query(`
      SELECT COUNT(ar.id) as count, COALESCE(SUM(e.amount), 0) as total_base
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      WHERE ar.approver_id = $1 AND ar.status = 'pending' AND e.company_id = $2
    `, [managerId, companyId]);

    const approvedTodayRes = await query(`
      SELECT COUNT(ar.id) as count, COALESCE(SUM(e.amount), 0) as total_base
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      WHERE ar.approver_id = $1 AND ar.status = 'approved' AND e.company_id = $2
      AND DATE(ar.decided_at) = CURRENT_DATE
    `, [managerId, companyId]);

    const avgRes = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (decided_at - created_at))/3600) as avg_hours,
      COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
      COUNT(id) as total_decided
      FROM approval_requests
      WHERE approver_id = $1 AND status IN ('approved', 'rejected')
      AND decided_at >= NOW() - INTERVAL '30 days'
    `, [managerId]);

    const pendingCount = Number(pendingRes.rows[0]?.count || 0);
    const pendingTotalBase = Number(pendingRes.rows[0]?.total_base || 0);
    const approvedTodayCount = Number(approvedTodayRes.rows[0]?.count || 0);
    const approvedTodayBase = Number(approvedTodayRes.rows[0]?.total_base || 0);
    const avgResponseHours = avgRes.rows[0] && avgRes.rows[0].avg_hours ? Number(avgRes.rows[0].avg_hours).toFixed(1) : 0;
    
    let approvalRatePercent = 0;
    const totalDecided = Number(avgRes.rows[0]?.total_decided || 0);
    const approvedCount = Number(avgRes.rows[0]?.approved_count || 0);
    if (totalDecided > 0) {
      approvalRatePercent = Math.round((approvedCount / totalDecided) * 100);
    }

    return {
      pendingCount,
      pendingTotalBase: Math.round(pendingTotalBase),
      approvedTodayCount,
      approvedTodayBase: Math.round(approvedTodayBase),
      avgResponseHours: Number(avgResponseHours),
      approvalRatePercent
    };
  }

  async getApprovalDetail(approvalRequestId, managerId) {
    const queueData = await query(`
      SELECT e.company_id, e.id as expense_id
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      WHERE ar.id = $1 AND (ar.approver_id = $2 OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))
    `, [approvalRequestId, managerId]);

    if (queueData.rows.length === 0) {
      throw { status: 403, message: 'Forbidden' };
    }

    const { expense_id, company_id } = queueData.rows[0];
    const items = await this.getMyQueue(managerId, company_id);
    const item = items.find(i => i.approvalRequestId === approvalRequestId) || {};

    const chainRes = await query(`
      SELECT ar.step_number AS "stepNumber", u.name AS "approverName", ar.status, ar.comment, ar.decided_at AS "decidedAt"
      FROM approval_requests ar
      JOIN users u ON u.id = ar.approver_id
      WHERE ar.expense_id = $1
      ORDER BY ar.step_number ASC
    `, [expense_id]);

    const expenseRes = await query(`SELECT * FROM expenses WHERE id = $1`, [expense_id]);

    return {
      ...item,
      fullChain: chainRes.rows,
      fullExpense: expenseRes.rows[0]
    };
  }

  async approveRequest(approvalRequestId, managerId, comment, ip) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reqRes = await client.query(`SELECT status, expense_id FROM approval_requests WHERE id = $1 AND approver_id = $2 FOR UPDATE`, [approvalRequestId, managerId]);
      if (reqRes.rows.length === 0) throw { status: 403, message: 'Forbidden' };
      if (reqRes.rows[0].status !== 'pending') throw { status: 409, message: 'Conflict' };
      
      const { expense_id } = reqRes.rows[0];
      await client.query(`UPDATE approval_requests SET status = 'approved', comment = $1, decided_at = NOW() WHERE id = $2`, [comment, approvalRequestId]);
      
      const expRes = await client.query(`SELECT * FROM expenses WHERE id = $1`, [expense_id]);
      const expense = expRes.rows[0];

      await client.query(`
        INSERT INTO audit_logs (company_id, user_id, action) 
        VALUES ($1, $2, 'APPROVAL_APPROVED - ' || $3)
      `, [expense.company_id, managerId, approvalRequestId]);

      await client.query('COMMIT');
      return { success: true, nextStatus: expense.status || 'approved' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectRequest(approvalRequestId, managerId, comment, ip) {
    if (!comment) throw { status: 400, message: 'Comment required' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const reqRes = await client.query(`SELECT status, expense_id FROM approval_requests WHERE id = $1 AND approver_id = $2 FOR UPDATE`, [approvalRequestId, managerId]);
      if (reqRes.rows.length === 0) throw { status: 403, message: 'Forbidden' };
      if (reqRes.rows[0].status !== 'pending') throw { status: 409, message: 'Conflict' };
      
      const { expense_id } = reqRes.rows[0];
      await client.query(`UPDATE approval_requests SET status = 'rejected', comment = $1, decided_at = NOW() WHERE id = $2`, [comment, approvalRequestId]);
      await client.query(`UPDATE expenses SET status = 'rejected' WHERE id = $1`, [expense_id]);

      const expRes = await client.query(`SELECT * FROM expenses WHERE id = $1`, [expense_id]);
      const expense = expRes.rows[0];

      await client.query(`
        INSERT INTO audit_logs (company_id, user_id, action) 
        VALUES ($1, $2, 'APPROVAL_REJECTED - ' || $3)
      `, [expense.company_id, managerId, approvalRequestId]);

      await client.query('COMMIT');
      return { success: true, nextStatus: 'rejected' };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getMyHistory(managerId, companyId, filters) {
    const { status, dateFrom, dateTo, page = 1, limit = 20 } = filters;
    let whereQuery = `ar.approver_id = $1 AND ar.status IN ('approved', 'rejected') AND e.company_id = $2`;
    const params = [managerId, companyId];
    let paramIndex = 3;

    if (status && status !== 'All') {
       whereQuery += ` AND ar.status = $${paramIndex++}`;
       params.push(status.toLowerCase());
    }
    if (dateFrom) {
       whereQuery += ` AND ar.decided_at >= $${paramIndex++}`;
       params.push(dateFrom);
    }
    if (dateTo) {
       whereQuery += ` AND ar.decided_at <= $${paramIndex++}`;
       params.push(dateTo);
    }

    const offset = (page - 1) * limit;

    const countRes = await query(`
      SELECT COUNT(ar.id)
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      WHERE ${whereQuery}
    `, params);

    const total = Number(countRes.rows[0].count);

    const dataRes = await query(`
      SELECT 
        ar.id, e.description as "Subject", u.name as "Owner", e.category as "Category",
        ar.status as "Decision", e.amount as "AmountINR", ar.decided_at as "DecidedAt", ar.comment as "Comment"
      FROM approval_requests ar
      JOIN expenses e ON e.id = ar.expense_id
      JOIN users u ON u.id = e.employee_id
      WHERE ${whereQuery}
      ORDER BY ar.decided_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, limit, offset]);

    return {
       data: dataRes.rows.map(r => ({...r, Subject: r.Subject || 'Expense'})),
       meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) || 1 }
    };
  }

  async getTeamExpenses(managerId, companyId, filters) {
    const { status, category, page = 1, limit = 20 } = filters;
    const offset = (page - 1) * limit;

    let whereQuery = `e.employee_id IN (SELECT id FROM users WHERE manager_id = $1 AND company_id = $2)`;
    const params = [managerId, companyId];
    let paramIndex = 3;

    if (status && status !== 'All') {
       whereQuery += ` AND e.status = $${paramIndex++}`;
       params.push(status.toLowerCase());
    }
    if (category && category !== 'All') {
       whereQuery += ` AND e.category = $${paramIndex++}`;
       params.push(category);
    }

    const countRes = await query(`SELECT COUNT(id) FROM expenses e WHERE ${whereQuery}`, params);
    const total = Number(countRes.rows[0].count);

    const dataRes = await query(`
      SELECT e.*, u.name as "Submitter"
      FROM expenses e 
      JOIN users u ON u.id = e.employee_id
      WHERE ${whereQuery}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}
    `, [...params, limit, offset]);

    return {
       data: dataRes.rows,
       meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) || 1 }
    };
  }
}

module.exports = new ManagerApprovalService();
