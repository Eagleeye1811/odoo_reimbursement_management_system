/**
 * Express-validator based validation middleware.
 * Import the individual rule-sets from here and attach them to routes.
 */
const { body, param, query, validationResult } = require('express-validator');
const { error } = require('../utils/apiResponse');

// ─── Generic runner ──────────────────────────────────────────────────────────

/**
 * Middleware that checks for validation errors produced by express-validator
 * chains and returns a 400 response with the first error message.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array({ onlyFirstError: true })[0];
    return error(res, firstError.msg, 400);
  }
  next();
};

// ─── Rule sets ───────────────────────────────────────────────────────────────

/** Rules for POST /api/expenses (create) & PUT /api/expenses/:id (update) */
const expenseBodyRules = [
  body('amount')
    .exists({ checkFalsy: true }).withMessage('amount is required')
    .isFloat({ gt: 0 }).withMessage('amount must be a positive number'),

  body('currency')
    .exists({ checkFalsy: true }).withMessage('currency is required')
    .isString().isLength({ min: 3, max: 3 }).withMessage('currency must be a valid 3-letter ISO code'),

  body('categoryId')
    .exists({ checkFalsy: true }).withMessage('categoryId is required')
    .isUUID().withMessage('categoryId must be a valid UUID'),

  body('description')
    .exists({ checkFalsy: true }).withMessage('description is required')
    .isLength({ min: 5 }).withMessage('description must be at least 5 characters')
    .isLength({ max: 500 }).withMessage('description must be at most 500 characters'),

  body('date')
    .exists({ checkFalsy: true }).withMessage('date is required')
    .isISO8601().withMessage('date must be a valid ISO 8601 date')
    .custom((value) => {
      if (new Date(value) > new Date()) {
        throw new Error('date cannot be in the future');
      }
      return true;
    }),

  body('receiptUrl')
    .optional()
    .isURL().withMessage('receiptUrl must be a valid URL'),

  body('vendor')
    .optional()
    .isString().withMessage('vendor must be a string'),

  handleValidationErrors,
];

/** Rules for currency conversion query */
const convertQueryRules = [
  query('from')
    .exists({ checkFalsy: true }).withMessage('from currency is required')
    .isString().isLength({ min: 3, max: 3 }).withMessage('from must be a 3-letter currency code'),

  query('to')
    .exists({ checkFalsy: true }).withMessage('to currency is required')
    .isString().isLength({ min: 3, max: 3 }).withMessage('to must be a 3-letter currency code'),

  query('amount')
    .exists({ checkFalsy: true }).withMessage('amount is required')
    .isFloat({ gt: 0 }).withMessage('amount must be a positive number'),

  handleValidationErrors,
];

/** Rules for :id param */
const idParamRule = [
  param('id').isUUID().withMessage('id must be a valid UUID'),
  handleValidationErrors,
];

module.exports = {
  expenseBodyRules,
  convertQueryRules,
  idParamRule,
  handleValidationErrors,
};
