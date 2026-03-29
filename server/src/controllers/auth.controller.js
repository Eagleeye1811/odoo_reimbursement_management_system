const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const { query } = require('../utils/db');
const { JWT_SECRET } = require('../middlewares/auth.middleware');

const CURRENCY_MAP = {
  'US': 'USD', 'GB': 'GBP', 'IN': 'INR', 'EU': 'EUR',
  'AU': 'AUD', 'CA': 'CAD', 'SG': 'SGD', 'AE': 'AED',
};

const registerSchema = z.object({
  companyName: z.string().min(1),
  country: z.string().min(1),
  adminName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

async function registerCompany(req, res) {
  try {
    const data = registerSchema.parse(req.body);
    const currency = CURRENCY_MAP[data.country] || 'USD';

    // Check email uniqueness
    const existing = await query('SELECT id FROM users WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Create company
    const companyRes = await query(
      `INSERT INTO companies (name, country, currency) VALUES ($1, $2, $3) RETURNING id`,
      [data.companyName, data.country, currency]
    );
    const companyId = companyRes.rows[0].id;

    // Create admin user
    const userRes = await query(
      `INSERT INTO users (company_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, 'admin') RETURNING id, name, email, role, company_id`,
      [companyId, data.adminName, data.email, hashedPassword]
    );
    const user = userRes.rows[0];

    await query(
      `INSERT INTO audit_logs (company_id, user_id, action) VALUES ($1, $2, 'COMPANY_REGISTERED')`,
      [companyId, user.id]
    );

    const accessToken = jwt.sign(
      { userId: user.id, role: 'admin', companyId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET + '_refresh', { expiresIn: '7d' });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, role: 'admin', companyId },
      accessToken,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function login(req, res) {
  try {
    const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const data = loginSchema.parse(req.body);

    const result = await query(
      `SELECT u.*, c.name as company_name, c.currency as company_currency
       FROM users u JOIN companies c ON c.id = u.company_id
       WHERE u.email = $1`,
      [data.email]
    );
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = await bcrypt.compare(data.password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const refreshToken = jwt.sign({ userId: user.id }, JWT_SECRET + '_refresh', { expiresIn: '7d' });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
    });

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, accessToken });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function refresh(req, res) {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: 'Refresh token not found' });

  try {
    const payload = jwt.verify(refreshToken, JWT_SECRET + '_refresh');
    const result = await query('SELECT * FROM users WHERE id = $1', [payload.userId]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ message: 'User not found' });

    const accessToken = jwt.sign(
      { userId: user.id, role: user.role, companyId: user.company_id },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    res.json({ accessToken });
  } catch {
    res.status(401).json({ message: 'Invalid refresh token' });
  }
}

module.exports = { registerCompany, login, refresh };
