const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes Placeholder
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Admin Routes
app.get('/api/admin/users', (req, res) => {
  res.json({ message: 'List of users' });
});

app.get('/api/admin/rules', (req, res) => {
  res.json({ message: 'List of rules' });
});

// Manager Routes
app.get('/api/manager/approvals', (req, res) => {
  res.json({ message: 'List of approvals' });
});

// Mock Authentication Middleware (As per instructions)
app.use((req, res, next) => {
  // Inject mock user
  req.user = { id: "user_123", role: "EMPLOYEE", companyId: "company_123" };
  next();
});

// Mount modular Employee Routes & Utility Routes
app.use('/api/expenses', require('./src/routes/expense.routes'));
app.use('/api', require('./src/routes/utility.routes')); // Mounts /api/categories & /api/currencies

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
