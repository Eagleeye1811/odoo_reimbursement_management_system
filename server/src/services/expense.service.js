/**
 * Expense service – all database interactions for the Expense domain.
 * Uses raw PostgreSQL queries via the NeonDB pool in utils/db.js.
 */
const { query } = require('../utils/db');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the company's default currency for a given user.
 * @param {string} userId
 * @returns {Promise<string>} – e.g. "INR"
 */
async function getCompanyCurrency(userId) {
  const result = await query(
    `SELECT c.currency
     FROM users u
     JOIN companies c ON c.id = u.company_id
     WHERE u.id = $1`,
    [userId]
  );
  return result.rows[0]?.currency || process.env.DEFAULT_COMPANY_CURRENCY || 'INR';
}

// ─── Category Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve a category name string to a normalized category name.
 * Since the DB stores category as a plain string, we just normalize it.
 * @param {string} categoryInput – could be a name like "Meals" or "meals"
 * @returns {string} – normalized category name
 */
function resolveCategory(categoryInput) {
  if (!categoryInput) return 'Miscellaneous';

  // If it looks like a UUID (categoryId sent by mistake), return Miscellaneous
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(categoryInput)) return 'Miscellaneous';

  // Normalize known aliases
  const aliases = {
    meals: 'Meals & Dining',
    'meals & dining': 'Meals & Dining',
    food: 'Meals & Dining',
    dining: 'Meals & Dining',
    travel: 'Travel',
    transport: 'Transportation',
    transportation: 'Transportation',
    accommodation: 'Accommodation',
    hotel: 'Accommodation',
    'office supplies': 'Office Supplies',
    office: 'Office Supplies',
    software: 'Software & Subscriptions',
    subscriptions: 'Software & Subscriptions',
    communication: 'Communication',
    training: 'Training & Education',
    education: 'Training & Education',
    medical: 'Medical',
    health: 'Medical',
    entertainment: 'Entertainment',
    miscellaneous: 'Miscellaneous',
    misc: 'Miscellaneous',
    other: 'Miscellaneous',
  };

  return aliases[categoryInput.toLowerCase()] || categoryInput;
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new expense in DRAFT status.
 * Accepts category as a string name (not a UUID).
 * @param {object} data – { description, amount, currency, date, category, categoryId?, vendor?, receiptUrl? }
 * @param {object} user – { id, companyId }
 * @returns {Promise<object>} – the created Expense record
 */
async function createExpense(data, user) {
  // Look up the user's company_id if not provided
  let companyId = user.companyId;
  if (!companyId) {
    const userResult = await query('SELECT company_id FROM users WHERE id = $1', [user.id]);
    companyId = userResult.rows[0]?.company_id;
  }

  // Accept either category name or categoryId — normalize to a string name
  const categoryName = resolveCategory(data.category || data.categoryId);

  const result = await query(
    `INSERT INTO expenses
       (company_id, employee_id, amount, currency, category, description, expense_date, receipt_url, status, current_step_index, is_at_manager_stage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 0, false)
     RETURNING *`,
    [
      companyId,
      user.id,
      data.amount,
      (data.currency || 'INR').toUpperCase(),
      categoryName,
      data.description,
      data.date || data.expense_date || new Date(),
      data.receiptUrl || data.receipt_url || null,
    ]
  );
  return result.rows[0];
}

/**
 * List expenses belonging to a specific employee, with optional status filter
 * and pagination.
 * @param {string}  userId
 * @param {object}  opts – { status?, page?, limit? }
 * @returns {Promise<{ expenses: object[], total: number, page: number, limit: number }>}
 */
async function listExpenses(userId, { status, page = 1, limit = 10 }) {
  const params = [userId];
  let whereClause = 'WHERE employee_id = $1';

  if (status) {
    params.push(status.toLowerCase());
    whereClause += ` AND status = $${params.length}`;
  }

  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const [expensesResult, countResult] = await Promise.all([
    query(
      `SELECT * FROM expenses ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(
      `SELECT COUNT(*)::int AS total FROM expenses ${whereClause}`,
      status ? [userId, status.toLowerCase()] : [userId]
    ),
  ]);

  // Normalize field names for frontend compatibility
  const expenses = expensesResult.rows.map(normalizeExpense);

  return {
    expenses,
    total: countResult.rows[0]?.total || 0,
    page,
    limit,
  };
}

/**
 * Get a single expense by ID (must belong to the requesting user).
 * Uses the v_expense_detail view for rich data.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getExpenseById(expenseId, userId) {
  const result = await query(
    `SELECT * FROM v_expense_detail WHERE id = $1 AND employee_id = $2`,
    [expenseId, userId]
  );
  if (result.rows.length === 0) return null;

  // Also fetch the approval log
  const logResult = await query(
    `SELECT eal.*, u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
     FROM expense_approval_log eal
     JOIN users u ON u.id = eal.actor_id
     WHERE eal.expense_id = $1
     ORDER BY eal.created_at ASC`,
    [expenseId]
  );

  return {
    ...normalizeExpense(result.rows[0]),
    approval_log: logResult.rows,
  };
}

/**
 * Update a DRAFT expense. Only the owning employee may update.
 * @param {string} expenseId
 * @param {object} data – fields to update
 * @param {object} user – { id }
 * @returns {Promise<object>}
 */
async function updateExpense(expenseId, data, user) {
  const existing = await query(
    'SELECT * FROM expenses WHERE id = $1 AND employee_id = $2',
    [expenseId, user.id]
  );

  if (existing.rows.length === 0)
    throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  const exp = existing.rows[0];
  if (exp.status !== 'draft') {
    throw Object.assign(new Error('Only DRAFT expenses can be updated'), { statusCode: 403 });
  }

  const newAmount      = data.amount ?? exp.amount;
  const newCurrency    = (data.currency ?? exp.currency).toUpperCase();
  const newCategory    = resolveCategory(data.category || data.categoryId) ?? exp.category;
  const newDescription = data.description ?? exp.description;
  const newDate        = data.date || data.expense_date || exp.expense_date;
  const newReceipt     =
    data.receiptUrl !== undefined
      ? data.receiptUrl
      : data.receipt_url !== undefined
      ? data.receipt_url
      : exp.receipt_url;

  const result = await query(
    `UPDATE expenses
     SET amount = $1, currency = $2, category = $3, description = $4,
         expense_date = $5, receipt_url = $6, updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [newAmount, newCurrency, newCategory, newDescription, newDate, newReceipt, expenseId]
  );

  return normalizeExpense(result.rows[0]);
}

/**
 * Delete a DRAFT expense.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function deleteExpense(expenseId, userId) {
  const existing = await query(
    'SELECT * FROM expenses WHERE id = $1 AND employee_id = $2',
    [expenseId, userId]
  );

  if (existing.rows.length === 0)
    throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  if (existing.rows[0].status !== 'draft') {
    throw Object.assign(new Error('Only DRAFT expenses can be deleted'), { statusCode: 403 });
  }

  const result = await query(
    'DELETE FROM expenses WHERE id = $1 RETURNING *',
    [expenseId]
  );
  return result.rows[0];
}

/**
 * Submit a DRAFT expense for approval.
 * Changes status to 'pending' and creates an initial log entry.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function submitExpense(expenseId, userId) {
  const existing = await query(
    'SELECT * FROM expenses WHERE id = $1 AND employee_id = $2',
    [expenseId, userId]
  );

  if (existing.rows.length === 0)
    throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  if (existing.rows[0].status !== 'draft') {
    throw Object.assign(new Error('Only DRAFT expenses can be submitted'), { statusCode: 403 });
  }

  const exp = existing.rows[0];

  // Find the active approval chain for the company
  const chainResult = await query(
    'SELECT * FROM approval_chains WHERE company_id = $1 AND is_active = true ORDER BY created_at ASC LIMIT 1',
    [exp.company_id]
  );

  let chainId = null;
  let currentApproverId = null;

  if (chainResult.rows.length > 0) {
    chainId = chainResult.rows[0].id;
    // Find the first approval step
    const firstStep = await query(
      'SELECT * FROM approval_steps WHERE chain_id = $1 ORDER BY step_order ASC LIMIT 1',
      [chainId]
    );
    if (firstStep.rows.length > 0) {
      currentApproverId = firstStep.rows[0].approver_id;
    }
  }

  // Update the expense status to pending
  const updated = await query(
    `UPDATE expenses
     SET status = 'pending', chain_id = $1, current_approver_id = $2,
         current_step_index = 0, updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [chainId, currentApproverId, expenseId]
  );

  // Log the submission
  await query(
    `INSERT INTO expense_approval_log (expense_id, actor_id, action, step_index, comment)
     VALUES ($1, $2, 'submitted', 0, 'Expense submitted for approval')`,
    [expenseId, userId]
  );

  return normalizeExpense(updated.rows[0]);
}

/**
 * Get the approval trail for an expense.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getApprovalTrail(expenseId, userId) {
  // Verify ownership
  const expense = await query(
    'SELECT id FROM expenses WHERE id = $1 AND employee_id = $2',
    [expenseId, userId]
  );
  if (expense.rows.length === 0)
    throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  const result = await query(
    `SELECT eal.*, u.name AS actor_name, u.email AS actor_email, u.role AS actor_role
     FROM expense_approval_log eal
     JOIN users u ON u.id = eal.actor_id
     WHERE eal.expense_id = $1
     ORDER BY eal.created_at ASC`,
    [expenseId]
  );
  return result.rows;
}

/**
 * List standard expense categories.
 * Returns hardcoded categories since the DB stores category as a plain string.
 * @returns {Promise<object[]>}
 */
async function listCategories() {
  return [
    { id: 'travel',          name: 'Travel',                    isActive: true },
    { id: 'meals',           name: 'Meals & Dining',            isActive: true },
    { id: 'accommodation',   name: 'Accommodation',             isActive: true },
    { id: 'transport',       name: 'Transportation',            isActive: true },
    { id: 'office_supplies', name: 'Office Supplies',           isActive: true },
    { id: 'software',        name: 'Software & Subscriptions',  isActive: true },
    { id: 'communication',   name: 'Communication',             isActive: true },
    { id: 'training',        name: 'Training & Education',      isActive: true },
    { id: 'medical',         name: 'Medical',                   isActive: true },
    { id: 'entertainment',   name: 'Entertainment',             isActive: true },
    { id: 'miscellaneous',   name: 'Miscellaneous',             isActive: true },
  ];
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

/**
 * Normalize a raw DB expense row to the shape the frontend expects.
 * Maps snake_case DB columns → camelCase frontend fields.
 * @param {object} row – raw DB row
 * @returns {object}
 */
function normalizeExpense(row) {
  if (!row) return null;
  return {
    id:               row.id,
    companyId:        row.company_id,
    employeeId:       row.employee_id,
    amount:           row.amount,
    currency:         row.currency,
    // Frontend reads convertedAmount — map from amount since no conversion column exists
    convertedAmount:  row.converted_amount ?? row.amount,
    companyCurrency:  row.company_currency ?? 'INR',
    category:         row.category,
    description:      row.description,
    // Frontend reads expense.date — map from expense_date
    date:             row.expense_date,
    receiptUrl:       row.receipt_url,
    vendor:           row.ocr_merchant ?? null,
    status:           row.status?.toUpperCase(),
    chainId:          row.chain_id,
    currentApproverId: row.current_approver_id,
    currentStepIndex: row.current_step_index,
    isAtManagerStage: row.is_at_manager_stage,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

module.exports = {
  createExpense,
  listExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
  submitExpense,
  getApprovalTrail,
  listCategories,
  getCompanyCurrency,
};