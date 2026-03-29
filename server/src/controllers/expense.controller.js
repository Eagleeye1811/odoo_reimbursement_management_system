/**
 * Expense controller — handles HTTP request/response for expense endpoints.
 */
const expenseService = require('../services/expense.service');
const ocrService = require('../services/ocr.service');
const { success, error } = require('../utils/apiResponse');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary from env
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * POST /api/expenses – create a new DRAFT expense.
 */
async function createExpense(req, res) {
  try {
    const expense = await expenseService.createExpense(req.body, req.user);
    return success(res, expense, 'Expense created successfully', 201);
  } catch (err) {
    console.error('createExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * GET /api/expenses – list employee's own expenses.
 */
async function listExpenses(req, res) {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const result = await expenseService.listExpenses(req.user.id, {
      status,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    });
    return success(res, result, 'Expenses retrieved successfully');
  } catch (err) {
    console.error('listExpenses error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * GET /api/expenses/:id – get a single expense with approval trail.
 */
async function getExpense(req, res) {
  try {
    const expense = await expenseService.getExpenseById(req.params.id, req.user.id);
    if (!expense) return error(res, 'Expense not found', 404);
    return success(res, expense, 'Expense retrieved successfully');
  } catch (err) {
    console.error('getExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * PUT /api/expenses/:id – update a DRAFT expense.
 */
async function updateExpense(req, res) {
  try {
    const expense = await expenseService.updateExpense(req.params.id, req.body, req.user);
    return success(res, expense, 'Expense updated successfully');
  } catch (err) {
    console.error('updateExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * DELETE /api/expenses/:id – delete a DRAFT expense.
 */
async function deleteExpense(req, res) {
  try {
    await expenseService.deleteExpense(req.params.id, req.user.id);
    return success(res, null, 'Expense deleted successfully');
  } catch (err) {
    console.error('deleteExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * PATCH /api/expenses/:id/submit – submit a DRAFT for approval.
 */
async function submitExpense(req, res) {
  try {
    const expense = await expenseService.submitExpense(req.params.id, req.user.id);
    return success(res, expense, 'Expense submitted for approval');
  } catch (err) {
    console.error('submitExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * GET /api/expenses/:id/approval-status – get step-by-step approval trail.
 */
async function getApprovalStatus(req, res) {
  try {
    const trail = await expenseService.getApprovalTrail(req.params.id, req.user.id);
    return success(res, trail, 'Approval trail retrieved successfully');
  } catch (err) {
    console.error('getApprovalStatus error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * POST /api/expenses/receipt/upload – upload receipt image, run OCR.
 * Uses multer (from route) to get the file buffer, uploads to Cloudinary,
 * then runs Tesseract OCR on the image.
 */
async function uploadReceipt(req, res) {
  try {
    if (!req.file) {
      return error(res, 'No file uploaded. Send a file under the "receipt" field.', 400);
    }

    // 1. Upload to Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'receipts', resource_type: 'image' },
        (err, result) => (err ? reject(err) : resolve(result)),
      );
      stream.end(req.file.buffer);
    });

    const receiptUrl = cloudinaryResult.secure_url;

    // 2. Run OCR on the uploaded image URL
    const parsed = await ocrService.processReceipt(receiptUrl);

    return success(res, { receiptUrl, ...parsed }, 'Receipt uploaded and processed', 201);
  } catch (err) {
    console.error('uploadReceipt error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * GET /api/expenses/manager/pending – Get expenses pending for manager approval
 */
async function getPendingApprovals(req, res) {
  try {
    const expenses = await expenseService.getPendingApprovals(req.user.id);
    return success(res, { expenses }, 'Pending approvals retrieved');
  } catch (err) {
    console.error('getPendingApprovals error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * GET /api/expenses/manager/team – Get team expenses for manager
 */
async function getTeamExpenses(req, res) {
  try {
    const expenses = await expenseService.getTeamExpenses(req.user.id);
    return success(res, { expenses }, 'Team expenses retrieved');
  } catch (err) {
    console.error('getTeamExpenses error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * POST /api/expenses/:id/approve – Manager approves expense
 */
async function approveExpense(req, res) {
  try {
    const { comment } = req.body;
    const result = await expenseService.approveExpense(req.params.id, req.user.id, comment);
    return success(res, result, 'Expense approved');
  } catch (err) {
    console.error('approveExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

/**
 * POST /api/expenses/:id/reject – Manager rejects expense
 */
async function rejectExpense(req, res) {
  try {
    const { comment } = req.body;
    const result = await expenseService.rejectExpense(req.params.id, req.user.id, comment);
    return success(res, result, 'Expense rejected');
  } catch (err) {
    console.error('rejectExpense error:', err);
    return error(res, err.message, err.statusCode || 500);
  }
}

module.exports = {
  createExpense,
  listExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  submitExpense,
  getApprovalStatus,
  uploadReceipt,
  getPendingApprovals,
  getTeamExpenses,
  approveExpense,
  rejectExpense,
};
