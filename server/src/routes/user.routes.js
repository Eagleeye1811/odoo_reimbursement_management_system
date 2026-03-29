const express = require('express');
const { createUser, listUsers, updateUser, sendPassword, deleteUser } = require('../controllers/user.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', listUsers);
router.post('/', requireRole(['admin']), createUser);
router.post('/:id/send-password', requireRole(['admin']), sendPassword);
router.put('/:id', requireRole(['admin']), updateUser);
router.delete('/:id', requireRole(['admin']), deleteUser);

module.exports = router;
