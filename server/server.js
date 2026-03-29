const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const adminRoutes = require('./src/routes/admin.routes');
const approvalRoutes = require('./modules/approvals/routes');
const { getDb } = require('./src/utils/db');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Initialize DB (creates tables if not exist)
getDb()
  .then(() => console.log('✅ NeonDB connected and tables ready'))
  .catch((err) => { console.error('❌ DB init failed:', err); process.exit(1); });

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/approvals', approvalRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'healthy', timestamp: new Date() }));

// Manager Routes
app.get('/api/manager/approvals', (req, res) => {
  res.json({ message: 'List of approvals' });
});

// Mock Authentication Middleware — fetch a real user from the DB
const { query } = require('./src/utils/db');
app.use(async (req, res, next) => {
  try {
    // If a real auth token was decoded upstream, skip this mock
    if (req.user) return next();

    // Otherwise grab the first employee from the DB as a stand-in
    const result = await query(
      `SELECT id, company_id, role FROM users ORDER BY created_at ASC LIMIT 1`
    );
    if (result.rows.length > 0) {
      const u = result.rows[0];
      req.user = { id: u.id, role: u.role, companyId: u.company_id };
    } else {
      // Fallback: no users in DB yet
      req.user = null;
    }
    next();
  } catch (err) {
    console.error('Mock auth middleware error:', err.message);
    next();
  }
});

// Mount modular Employee Routes & Utility Routes
app.use('/api/expenses', require('./src/routes/expense.routes'));
app.use('/api', require('./src/routes/utility.routes')); // Mounts /api/categories & /api/currencies

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
