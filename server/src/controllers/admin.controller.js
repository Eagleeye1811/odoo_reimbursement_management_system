const { query } = require('../utils/db');
const { v4: uuidv4 } = require('uuid');

// ── Analytics / Stats ────────────────────────────────────────────────
async function getStats(req, res) {
  try {
    const companyId = req.user.companyId;

    const expenseStats = await query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'draft') as draft,
        COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) as total_approved_amount,
        COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) as total_pending_amount
       FROM expenses
       WHERE company_id = $1`,
      [companyId]
    );

    const userStats = await query(
      `SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (WHERE role = 'manager') as managers,
        COUNT(*) FILTER (WHERE role = 'employee') as employees
       FROM users WHERE company_id = $1`,
      [companyId]
    );

    // Monthly expense trend (last 6 months)
    const trend = await query(
      `SELECT
        TO_CHAR(expense_date, 'Mon') as month,
        TO_CHAR(expense_date, 'YYYY-MM') as month_key,
        COUNT(*) as count,
        COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE company_id = $1
         AND expense_date >= NOW() - INTERVAL '6 months'
       GROUP BY month, month_key
       ORDER BY month_key ASC`,
      [companyId]
    );

    // Category breakdown
    const categoryBreakdown = await query(
      `SELECT category, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
       FROM expenses
       WHERE company_id = $1 AND status = 'approved'
       GROUP BY category
       ORDER BY total DESC
       LIMIT 6`,
      [companyId]
    );

    // Recent expenses
    const recentExpenses = await query(
      `SELECT e.id, e.amount, e.currency, e.category, e.status, e.expense_date, e.description,
              u.name as employee_name
       FROM expenses e
       JOIN users u ON u.id = e.employee_id
       WHERE e.company_id = $1
       ORDER BY e.created_at DESC
       LIMIT 10`,
      [companyId]
    );

    res.json({
      expenses: expenseStats.rows[0],
      users: userStats.rows[0],
      trend: trend.rows,
      categoryBreakdown: categoryBreakdown.rows,
      recentExpenses: recentExpenses.rows,
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
}

// ── Approval Chains (Rules) ──────────────────────────────────────────
async function listChains(req, res) {
  try {
    const companyId = req.user.companyId;
    const chains = await query(
      `SELECT ac.*, u.name as auto_approver_name
       FROM approval_chains ac
       LEFT JOIN users u ON u.id = ac.auto_approver_id
       WHERE ac.company_id = $1
       ORDER BY ac.created_at ASC`,
      [companyId]
    );

    const result = await Promise.all(
      chains.rows.map(async (chain) => {
        const steps = await query(
          `SELECT s.*, u.name as approver_name, u.email as approver_email
           FROM approval_steps s
           JOIN users u ON u.id = s.approver_id
           WHERE s.chain_id = $1
           ORDER BY s.step_order ASC`,
          [chain.id]
        );
        return { ...chain, steps: steps.rows };
      })
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch rules' });
  }
}

async function createChain(req, res) {
  try {
    const { name, conditionType, percentageThreshold, autoApproverId, steps } = req.body;
    const companyId = req.user.companyId;

    if (!name) return res.status(400).json({ message: 'Chain name is required' });

    const chainRes = await query(
      `INSERT INTO approval_chains (company_id, name, condition_type, percentage_threshold, auto_approver_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [companyId, name, conditionType || 'sequential', percentageThreshold || null, autoApproverId || null]
    );
    const chain = chainRes.rows[0];

    if (Array.isArray(steps) && steps.length > 0) {
      for (let i = 0; i < steps.length; i++) {
        await query(
          `INSERT INTO approval_steps (chain_id, step_order, approver_id, step_label)
           VALUES ($1, $2, $3, $4)`,
          [chain.id, i + 1, steps[i].approverId, steps[i].stepLabel || `Step ${i + 1}`]
        );
      }
    }

    res.status(201).json(chain);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create rule' });
  }
}

async function updateChain(req, res) {
  try {
    const { id } = req.params;
    const { name, conditionType, percentageThreshold, autoApproverId, isActive, steps } = req.body;
    const companyId = req.user.companyId;

    await query(
      `UPDATE approval_chains
       SET name = COALESCE($1, name),
           condition_type = COALESCE($2, condition_type),
           percentage_threshold = COALESCE($3, percentage_threshold),
           auto_approver_id = COALESCE($4, auto_approver_id),
           is_active = COALESCE($5, is_active)
       WHERE id = $6 AND company_id = $7`,
      [name, conditionType, percentageThreshold, autoApproverId, isActive, id, companyId]
    );

    if (Array.isArray(steps)) {
      await query('DELETE FROM approval_steps WHERE chain_id = $1', [id]);
      for (let i = 0; i < steps.length; i++) {
        await query(
          `INSERT INTO approval_steps (chain_id, step_order, approver_id, step_label)
           VALUES ($1, $2, $3, $4)`,
          [id, i + 1, steps[i].approverId, steps[i].stepLabel || `Step ${i + 1}`]
        );
      }
    }

    res.json({ message: 'Rule updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update rule' });
  }
}

async function deleteChain(req, res) {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;
    await query('DELETE FROM approval_chains WHERE id = $1 AND company_id = $2', [id, companyId]);
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete rule' });
  }
}

// ── All expenses (admin view) ─────────────────────────────────────────
async function getAllExpenses(req, res) {
  try {
    const companyId = req.user.companyId;
    const { status, category } = req.query;

    let sql = `SELECT e.*, u.name as employee_name, u.email as employee_email
               FROM expenses e
               JOIN users u ON u.id = e.employee_id
               WHERE e.company_id = $1`;
    const params = [companyId];

    if (status) { params.push(status); sql += ` AND e.status = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND e.category = $${params.length}`; }
    sql += ' ORDER BY e.created_at DESC';

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch expenses' });
  }
}

async function overrideExpense(req, res) {
  try {
    const { id } = req.params;
    const { action, comment } = req.body;
    const adminId = req.user.id;
    const companyId = req.user.companyId;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action.' });
    }

    const expenseRes = await query('SELECT * FROM expenses WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (expenseRes.rows.length === 0) return res.status(404).json({ message: 'Expense not found.' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    
    // Update the expense status directly
    await query('UPDATE expenses SET status = $1, updated_at = NOW() WHERE id = $2', [newStatus, id]);

    // Log the override action
    await query(
      `INSERT INTO expense_approval_log (expense_id, approver_id, action, comments)
       VALUES ($1, $2, $3, $4)`,
      [id, adminId, 'ADMIN_OVERRIDE_' + action.toUpperCase(), comment || 'Admin force override']
    );

    res.json({ message: `Expense force ${newStatus} successfully.` });
  } catch (err) {
    console.error('Failed to override expense:', err);
    res.status(500).json({ message: 'Internal server error during override.' });
  }
}

module.exports = { getStats, listChains, createChain, updateChain, deleteChain, getAllExpenses, overrideExpense };
