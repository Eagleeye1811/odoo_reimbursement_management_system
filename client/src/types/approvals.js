/**
 * @typedef {Object} ApprovalQueueItem
 * @property {string} approvalRequestId
 * @property {string} expenseId
 * @property {number} stepNumber
 * @property {number} totalSteps
 * @property {number} approvedSoFar
 * @property {Object} submitter
 * @property {string} submitter.id
 * @property {string} submitter.name
 * @property {string} submitter.avatarInitials
 * @property {Object} expense
 * @property {string} expense.id
 * @property {string} expense.description
 * @property {string} expense.category
 * @property {string} expense.expenseDate
 * @property {number} expense.amount
 * @property {string} expense.currencyCode
 * @property {number} expense.amountInBase
 * @property {string} expense.baseCurrencyCode
 * @property {number} expense.exchangeRate
 * @property {string|null} expense.receiptUrl
 * @property {Object|null} rule
 * @property {string} rule.name
 * @property {boolean} rule.isSequential
 * @property {number|null} rule.percentageThreshold
 * @property {string|null} rule.keyApproverId
 * @property {string|null} appliedRuleName
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ApprovalStats
 * @property {number} pendingCount
 * @property {number} pendingTotalBase
 * @property {number} approvedTodayCount
 * @property {number} approvedTodayBase
 * @property {number} avgResponseHours
 * @property {number} approvalRatePercent
 */

/**
 * @typedef {Object} ApprovalHistoryItem
 * @property {string} id
 * @property {string} Subject
 * @property {string} Owner
 * @property {string} Category
 * @property {string} Decision
 * @property {number} AmountINR
 * @property {string} DecidedAt
 * @property {string} Comment
 */

/**
 * @typedef {Object} TeamExpense
 * @property {string} id
 * @property {string} Submitter
 * @property {string} category
 * @property {string} status
 * @property {number} amount
 * @property {string} description
 * @property {string} expense_date
 * @property {string} created_at
 */

export const types = {};
