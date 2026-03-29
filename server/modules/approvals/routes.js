const express = require('express');
const { requireRole, requireAuth } = require('../../src/middlewares/auth.middleware');
const approvalService = require('./service');

const router = express.Router();
router.use(requireAuth, requireRole(['manager', 'admin']));

const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/queue', asyncHandler(async (req, res) => {
  const data = await approvalService.getMyQueue(req.user.id, req.user.company_id);
  res.json(data);
}));

router.get('/queue/stats', asyncHandler(async (req, res) => {
  const stats = await approvalService.getQueueStats(req.user.id, req.user.company_id);
  res.json(stats);
}));

router.get('/history', asyncHandler(async (req, res) => {
  const data = await approvalService.getMyHistory(req.user.id, req.user.company_id, req.query);
  res.json(data);
}));

router.get('/team-expenses', asyncHandler(async (req, res) => {
  const data = await approvalService.getTeamExpenses(req.user.id, req.user.company_id, req.query);
  res.json(data);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const detail = await approvalService.getApprovalDetail(req.params.id, req.user.id);
  res.json(detail);
}));

router.post('/:id/approve', asyncHandler(async (req, res) => {
  const result = await approvalService.approveRequest(req.params.id, req.user.id, req.body.comment, req.ip);
  res.json(result);
}));

router.post('/:id/reject', asyncHandler(async (req, res) => {
  const result = await approvalService.rejectRequest(req.params.id, req.user.id, req.body.comment, req.ip);
  res.json(result);
}));

// Error handling specifically for this router
router.use((err, req, res, next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal Server Error' });
});

module.exports = router;
