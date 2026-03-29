const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query } = require('../utils/db');
const { sendUserCredentials } = require('../utils/mailer');

function generatePassword(length = 10) {
  return crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, length);
}

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['manager', 'employee']),
  manager_id: z.string().uuid().optional().nullable(),
  is_manager_approver: z.boolean().optional().default(false),
});

async function createUser(req, res) {
  try {
    const data = userSchema.parse(req.body);
    const companyId = req.user.companyId;

    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const tempPassword = generatePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const result = await query(
      `INSERT INTO users (company_id, name, email, password_hash, role, manager_id, is_manager_approver)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, company_id, name, email, role, manager_id, is_manager_approver`,
      [companyId, data.name, data.email, hashedPassword, data.role, data.manager_id || null, data.is_manager_approver]
    );
    const newUser = result.rows[0];

    await query(
      'INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, $3)',
      [companyId, newUser.id, 'USER_CREATED']
    );

    await sendUserCredentials(newUser.email, tempPassword).catch(console.error);

    res.status(201).json({ user: newUser, message: 'User created and credentials sent via email' });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ errors: error.errors });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function listUsers(req, res) {
  try {
    const companyId = req.user.companyId;
    const result = await query(
      `SELECT u.id, u.name, u.email, u.role, u.manager_id, u.is_manager_approver,
              m.name as manager_name
       FROM users u
       LEFT JOIN users m ON u.manager_id = m.id
       WHERE u.company_id = $1
       ORDER BY u.created_at DESC`,
      [companyId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { role, manager_id, is_manager_approver } = req.body;
    const companyId = req.user.companyId;

    const existing = await query('SELECT * FROM users WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (!existing.rows.length) return res.status(404).json({ message: 'User not found' });
    if (existing.rows[0].role === 'admin') return res.status(403).json({ message: 'Cannot modify admin' });

    await query(
      `UPDATE users SET role = COALESCE($1, role), manager_id = $2, is_manager_approver = COALESCE($3, is_manager_approver), updated_at = NOW() WHERE id = $4`,
      [role || null, manager_id || null, is_manager_approver, id]
    );

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal error' });
  }
}

async function sendPassword(req, res) {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const result = await query('SELECT * FROM users WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (!result.rows.length) return res.status(404).json({ message: 'User not found' });
    const user = result.rows[0];

    const plainPassword = generatePassword();
    const hashed = await bcrypt.hash(plainPassword, 12);

    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, id]);
    await sendUserCredentials(user.email, plainPassword);

    res.json({ message: 'Password sent successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;
    const companyId = req.user.companyId;

    const existing = await query('SELECT role FROM users WHERE id = $1 AND company_id = $2', [id, companyId]);
    if (!existing.rows.length) return res.status(404).json({ message: 'User not found' });
    if (existing.rows[0].role === 'admin') return res.status(403).json({ message: 'Cannot delete admin' });

    await query('DELETE FROM users WHERE id = $1 AND company_id = $2', [id, companyId]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete user' });
  }
}

module.exports = { createUser, listUsers, updateUser, sendPassword, deleteUser };
