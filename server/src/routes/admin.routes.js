const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const {
  getStats,
  listChains,
  createChain,
  updateChain,
  deleteChain,
  getAllExpenses,
  overrideExpense,
} = require('../controllers/admin.controller');

const router = express.Router();
router.use(requireAuth, requireRole(['admin']));

router.get('/stats', getStats);
router.get('/expenses', getAllExpenses);
router.post('/expenses/:id/override', overrideExpense);
router.get('/chains', listChains);
router.post('/chains', createChain);
router.put('/chains/:id', updateChain);
router.delete('/chains/:id', deleteChain);

module.exports = router;
