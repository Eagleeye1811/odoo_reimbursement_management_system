/**
 * src/utils/db.js
 * PostgreSQL connection pool using NeonDB
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const query = (text, params) => pool.query(text, params);

async function getDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) UNIQUE NOT NULL,
      country VARCHAR(100) NOT NULL,
      currency VARCHAR(10) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL DEFAULT 'employee',
      manager_id UUID REFERENCES users(id),
      is_manager_approver BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID REFERENCES companies(id),
      user_id UUID REFERENCES users(id),
      action TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS approval_chains (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      condition_type VARCHAR(50) DEFAULT 'sequential',
      percentage_threshold NUMERIC(5,2),
      auto_approver_id UUID REFERENCES users(id),
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chain_id UUID NOT NULL REFERENCES approval_chains(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      approver_id UUID NOT NULL REFERENCES users(id),
      step_label VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      employee_id UUID NOT NULL REFERENCES users(id),
      amount NUMERIC(12,2) NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'INR',
      category VARCHAR(100) NOT NULL,
      description TEXT,
      expense_date DATE NOT NULL,
      receipt_url TEXT,
      status VARCHAR(50) DEFAULT 'draft',
      chain_id UUID REFERENCES approval_chains(id),
      current_approver_id UUID REFERENCES users(id),
      current_step_index INTEGER DEFAULT 0,
      is_at_manager_stage BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS expense_approval_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      actor_id UUID NOT NULL REFERENCES users(id),
      action VARCHAR(50) NOT NULL,
      step_label VARCHAR(255),
      step_index INTEGER DEFAULT 0,
      comment TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('✅ NeonDB tables ready');
  return { query, pool };
}

module.exports = { getDb, query, pool };
