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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong!' });
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
