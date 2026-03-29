/**
 * Expense service – all database interactions for the Expense domain.
 * Controllers call these functions; they never touch Prisma directly.
 */
const { PrismaClient } = require('@prisma/client');
const currencyService = require('./currency.service');

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch the company's default currency for a given user.
 * @param {string} userId
 * @returns {Promise<string>} – e.g. "INR"
 */
async function getCompanyCurrency(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { company: { select: { defaultCurrency: true } } },
  });
  return user?.company?.defaultCurrency || process.env.DEFAULT_COMPANY_CURRENCY || 'INR';
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * Create a new expense in DRAFT status.
 * Automatically converts the amount to the company's base currency.
 * @param {object} data – { description, amount, currency, date, categoryId, vendor?, receiptUrl? }
 * @param {object} user – { id, companyId }
 * @returns {Promise<object>} – the created Expense record
 */
async function createExpense(data, user) {
  const baseCurrency = await getCompanyCurrency(user.id);
  const { convertedAmount, rate } = await currencyService.convert(
    data.currency,
    baseCurrency,
    data.amount,
  );

  return prisma.expense.create({
    data: {
      description: data.description,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      convertedAmount,
      conversionRate: rate,
      date: new Date(data.date),
      vendor: data.vendor || null,
      receiptUrl: data.receiptUrl || null,
      categoryId: data.categoryId,
      userId: user.id,
      status: 'DRAFT',
    },
    include: { category: true },
  });
}

/**
 * List expenses belonging to a specific employee, with optional status filter
 * and pagination.
 * @param {string}  userId
 * @param {object}  opts – { status?, page?, limit? }
 * @returns {Promise<{ expenses: object[], total: number, page: number, limit: number }>}
 */
async function listExpenses(userId, { status, page = 1, limit = 10 }) {
  const where = { userId };
  if (status) where.status = status.toUpperCase();

  const [expenses, total] = await Promise.all([
    prisma.expense.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.expense.count({ where }),
  ]);

  return { expenses, total, page, limit };
}

/**
 * Get a single expense by ID (must belong to the requesting user).
 * Includes the full approval trail.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getExpenseById(expenseId, userId) {
  return prisma.expense.findFirst({
    where: { id: expenseId, userId },
    include: {
      category: true,
      approvalSteps: {
        orderBy: { stepOrder: 'asc' },
        include: {
          approver: { select: { id: true, name: true, email: true, role: true } },
        },
      },
    },
  });
}

/**
 * Update a DRAFT expense. Only the owning employee may update.
 * Re-converts the amount when currency or amount changes.
 * @param {string} expenseId
 * @param {object} data – fields to update
 * @param {object} user – { id }
 * @returns {Promise<object>}
 */
async function updateExpense(expenseId, data, user) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, userId: user.id },
  });

  if (!existing) throw Object.assign(new Error('Expense not found'), { statusCode: 404 });
  if (existing.status !== 'DRAFT') {
    throw Object.assign(
      new Error('Only DRAFT expenses can be updated'),
      { statusCode: 403 },
    );
  }

  // Re-convert if amount or currency changed
  const newAmount = data.amount ?? existing.amount;
  const newCurrency = (data.currency ?? existing.currency).toUpperCase();
  const baseCurrency = await getCompanyCurrency(user.id);
  const { convertedAmount, rate } = await currencyService.convert(newCurrency, baseCurrency, newAmount);

  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      description: data.description ?? existing.description,
      amount: newAmount,
      currency: newCurrency,
      convertedAmount,
      conversionRate: rate,
      date: data.date ? new Date(data.date) : existing.date,
      vendor: data.vendor !== undefined ? data.vendor : existing.vendor,
      receiptUrl: data.receiptUrl !== undefined ? data.receiptUrl : existing.receiptUrl,
      categoryId: data.categoryId ?? existing.categoryId,
    },
    include: { category: true },
  });
}

/**
 * Delete a DRAFT expense.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function deleteExpense(expenseId, userId) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
  });

  if (!existing) throw Object.assign(new Error('Expense not found'), { statusCode: 404 });
  if (existing.status !== 'DRAFT') {
    throw Object.assign(
      new Error('Only DRAFT expenses can be deleted'),
      { statusCode: 403 },
    );
  }

  return prisma.expense.delete({ where: { id: expenseId } });
}

/**
 * Submit a DRAFT expense for approval.
 * Changes status to WAITING_APPROVAL and creates approval-step records
 * based on the company's configured approval rules.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function submitExpense(expenseId, userId) {
  const existing = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    include: { user: { include: { company: true } } },
  });

  if (!existing) throw Object.assign(new Error('Expense not found'), { statusCode: 404 });
  if (existing.status !== 'DRAFT') {
    throw Object.assign(
      new Error('Only DRAFT expenses can be submitted'),
      { statusCode: 403 },
    );
  }

  // Fetch the approval rules configured for this company
  const rules = await prisma.approvalRule.findMany({
    where: { companyId: existing.user.companyId },
    orderBy: { stepOrder: 'asc' },
  });

  // Build approval step creation data
  const stepsData = [];
  for (const rule of rules) {
    // Find any user in the company with the matching role to be the approver
    const approver = await prisma.user.findFirst({
      where: { companyId: existing.user.companyId, role: rule.approverRole },
    });

    stepsData.push({
      expenseId,
      stepOrder: rule.stepOrder,
      approverId: approver?.id || null,
      status: 'PENDING',
    });
  }

  // Run inside a transaction
  return prisma.$transaction(async (tx) => {
    if (stepsData.length > 0) {
      await tx.approvalStep.createMany({ data: stepsData });
    }

    return tx.expense.update({
      where: { id: expenseId },
      data: { status: 'WAITING_APPROVAL' },
      include: {
        category: true,
        approvalSteps: {
          orderBy: { stepOrder: 'asc' },
          include: {
            approver: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
  });
}

/**
 * Get the approval trail for an expense.
 * @param {string} expenseId
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
async function getApprovalTrail(expenseId, userId) {
  // Verify ownership
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    select: { id: true },
  });
  if (!expense) throw Object.assign(new Error('Expense not found'), { statusCode: 404 });

  return prisma.approvalStep.findMany({
    where: { expenseId },
    orderBy: { stepOrder: 'asc' },
    include: {
      approver: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

/**
 * List all active categories.
 * @returns {Promise<object[]>}
 */
async function listCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  });
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
};
