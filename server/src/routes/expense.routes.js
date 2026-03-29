const express = require('express');
const router = express.Router();
const multer = require('multer');
const expenseController = require('../controllers/expense.controller');
const validate = require('../middlewares/validate');

// Multer setup for memory storage (for uploading to Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// ─── CRUD ───────────────────────────────────────────────────────────────────

// Create new expense
router.post(
  '/',
  validate.expenseBodyRules,
  expenseController.createExpense
);

// List all expenses for logged-in employee
router.get(
  '/',
  expenseController.listExpenses
);

// Get single expense with trail
router.get(
  '/:id',
  validate.idParamRule,
  expenseController.getExpense
);

// Update DRAFT expense
router.put(
  '/:id',
  [...validate.idParamRule, ...validate.expenseBodyRules],
  expenseController.updateExpense
);

// Delete DRAFT expense
router.delete(
  '/:id',
  validate.idParamRule,
  expenseController.deleteExpense
);

// Submit expense for approval
router.patch(
  '/:id/submit',
  validate.idParamRule,
  expenseController.submitExpense
);

// ─── Extras ─────────────────────────────────────────────────────────────────

// Upload and OCR Receipt
router.post(
  '/receipt/upload',
  upload.single('receipt'),
  expenseController.uploadReceipt
);

// Get approval status
router.get(
  '/:id/approval-status',
  validate.idParamRule,
  expenseController.getApprovalStatus
);

// ─── Manager Approvals ──────────────────────────────────────────────────────

// List pending approvals for logged in user
router.get(
  '/manager/pending',
  expenseController.getPendingApprovals
);

// List team expenses for logged in user
router.get(
  '/manager/team',
  expenseController.getTeamExpenses
);

// Approve expense
router.post(
  '/:id/approve',
  validate.idParamRule,
  expenseController.approveExpense
);

// Reject expense
router.post(
  '/:id/reject',
  validate.idParamRule,
  expenseController.rejectExpense
);

module.exports = router;
