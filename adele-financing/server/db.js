import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'

const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = Number(process.env.DB_PORT) || 3306
const DB_USER = process.env.DB_USER || 'root'
const DB_PASSWORD = process.env.DB_PASSWORD || ''
const DB_NAME = (process.env.DB_NAME || 'adele_lms').replace(/[^a-zA-Z0-9_]/g, '_')

const baseConfig = { host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASSWORD }

export let pool = null

export async function initDb() {
  const tmp = await mysql.createConnection(baseConfig)
  await tmp.query(
    `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  )
  await tmp.end()

  pool = mysql.createPool({
    ...baseConfig,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    charset: 'utf8mb4',
  })

  const ddl = await mysql.createConnection({ ...baseConfig, database: DB_NAME, multipleStatements: true })
  await ddl.query(SCHEMA)
  await ddl.end()

  await seed()
  await migrate()
}

async function migrate() {
  try {
    const rows = await queryAll(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'amount'`,
    )
    if (rows.length === 0) {
      await run('ALTER TABLE customers ADD COLUMN amount DOUBLE NOT NULL DEFAULT 0')
    }
    const durRows = await queryAll(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'duration'`,
    )
    if (durRows.length === 0) {
      await run('ALTER TABLE customers ADD COLUMN duration INT NOT NULL DEFAULT 0')
    }
  } catch (e) {
    console.error('Migration failed:', e.message)
  }
}

function toArgs(sql, params) {
  if (params == null) return { sql, values: [] }
  if (Array.isArray(params)) return { sql, values: params }
  const names = []
  const converted = String(sql).replace(/@(\w+)/g, (_m, key) => {
    names.push(key)
    return '?'
  })
  return { sql: converted, values: names.map((k) => params[k]) }
}

export async function queryAll(sql, params) {
  const { sql: s, values } = toArgs(sql, params)
  const [rows] = await pool.execute(s, values)
  return rows
}

export async function queryOne(sql, params) {
  const rows = await queryAll(sql, params)
  return rows[0]
}

export async function run(sql, params) {
  const { sql: s, values } = toArgs(sql, params)
  const [res] = await pool.execute(s, values)
  return { lastInsertRowid: Number(res.insertId), changes: res.affectedRows }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS roles (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    customer_id VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    gender VARCHAR(20) NOT NULL DEFAULT '',
    email VARCHAR(255),
    address TEXT,
    amount DOUBLE NOT NULL DEFAULT 0,
    duration INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    registration_date DATE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loan_products (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    min_amount DOUBLE NOT NULL DEFAULT 0,
    max_amount DOUBLE NOT NULL DEFAULT 0,
    interest_rate DOUBLE NOT NULL DEFAULT 0,
    max_duration INT NOT NULL DEFAULT 6,
    repayment_frequency VARCHAR(20) NOT NULL DEFAULT 'Monthly',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS loan_applications (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id VARCHAR(20) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    loan_product_id INT NOT NULL,
    requested_amount DOUBLE NOT NULL,
    duration INT NOT NULL,
    purpose TEXT,
    application_date DATE NOT NULL,
    assigned_loan_officer_id INT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    rejected_by INT,
    rejected_at DATETIME,
    approved_amount DOUBLE,
    approved_duration INT,
    interest_rate DOUBLE,
    approved_by INT,
    approved_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    loan_id VARCHAR(20) NOT NULL UNIQUE,
    application_id INT,
    customer_id INT NOT NULL,
    loan_product_id INT,
    principal DOUBLE NOT NULL,
    interest DOUBLE NOT NULL DEFAULT 0,
    total_payable DOUBLE NOT NULL,
    amount_paid DOUBLE NOT NULL DEFAULT 0,
    outstanding_balance DOUBLE NOT NULL,
    start_date DATE NOT NULL,
    due_date DATE NOT NULL,
    duration INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    disbursement_date DATE,
    disbursed_amount DOUBLE,
    disbursed_by INT,
    payment_method VARCHAR(50),
    reference_number VARCHAR(100),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS repayment_schedules (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    loan_id INT NOT NULL,
    due_date DATE NOT NULL,
    amount DOUBLE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS repayments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    repayment_id VARCHAR(20) NOT NULL UNIQUE,
    loan_id INT NOT NULL,
    customer_id INT NOT NULL,
    amount DOUBLE NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    recorded_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    payment_id VARCHAR(20) NOT NULL UNIQUE,
    loan_id INT,
    customer_id INT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'repayment',
    amount DOUBLE NOT NULL,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    reference_number VARCHAR(100),
    recorded_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    user_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    description TEXT,
    related_record VARCHAR(255),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(100) NOT NULL UNIQUE,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    income_id VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    amount DOUBLE NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Other Income',
    income_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    recorded_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS application_documents (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    application_id VARCHAR(20) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    size BIGINT NOT NULL DEFAULT 0,
    uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    expense_id VARCHAR(20) NOT NULL UNIQUE,
    description VARCHAR(255) NOT NULL,
    amount DOUBLE NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'Other Expense',
    expense_date DATE NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    recorded_by INT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`

async function countRows(table) {
  const row = await queryOne(`SELECT COUNT(*) AS c FROM ${table}`)
  return Number(row.c)
}

async function seed() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url')
  const passwordHash = bcrypt.hashSync(seedPassword, 10)

  if ((await countRows('users')) === 0) {
    const stmt = `
      INSERT INTO users (full_name, email, phone, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `
    const users = [
      ['System Administrator', 'adele1company@gmail.com', '+250 788 739 764', passwordHash, 'super_admin'],
      ['Mukunde Densyse', 'densyse@adelefinancing.rw', '+250 788 000 001', passwordHash, 'loan_officer'],
      ['Gahamanyi Edouard', 'edouard@adelefinancing.rw', '+250 788 000 002', passwordHash, 'manager'],
      ['UWAMAHORO Divine', 'divine@adelefinancing.rw', '0738494008', passwordHash, 'finance_officer'],
    ]
    for (const u of users) {
      await pool.execute(stmt, u)
    }
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`[seed] SEED_ADMIN_PASSWORD not set. Generated admin password: ${seedPassword}`)
    }
  }

  if ((await countRows('roles')) === 0) {
    const stmt = 'INSERT INTO roles (name, description) VALUES (?, ?)'
    await pool.execute(stmt, ['super_admin', 'Can access and manage the entire system.'])
    await pool.execute(stmt, ['loan_officer', 'Can manage loan-related operations.'])
    await pool.execute(stmt, ['finance_officer', 'Can manage financial operations.'])
    await pool.execute(stmt, ['manager', 'Can monitor and approve business operations.'])
  }

  if ((await countRows('loan_products')) === 0) {
    const stmt = `
      INSERT INTO loan_products
        (name, description, min_amount, max_amount, interest_rate, max_duration, repayment_frequency, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Monthly', 'active')
    `
    const products = [
      ['Business Loan', 'Financing for business growth and operations.', 100000, 30000000, 12, 24],
      ['Personal Loan', 'Quick financing for personal needs.', 50000, 5000000, 10, 12],
      ['Salary Loan', 'Loans for salaried employees with regular income.', 50000, 3000000, 8, 6],
      ['Agricultural Loan', 'Financing for farming and agricultural activities.', 50000, 10000000, 9, 12],
      ['Asset Financing', 'Financing for equipment and asset purchases.', 200000, 30000000, 11, 24],
      ['Working Capital Loan', 'Short-term financing for business working capital.', 100000, 15000000, 12, 12],
      ['School Fees Loan', 'Financing for education fees and school expenses.', 30000, 3000000, 6, 6],
      ['Emergency Loan', 'Fast financing for urgent personal needs.', 20000, 1000000, 5, 3],
    ]
    for (const p of products) {
      await pool.execute(stmt, p)
    }
  }

  if ((await countRows('settings')) === 0) {
    const stmt = 'INSERT INTO settings (`key`, value) VALUES (?, ?)'
    await pool.execute(stmt, ['company_name', 'ADELE Financing Company Ltd'])
    await pool.execute(stmt, ['company_email', 'adele1company@gmail.com'])
    await pool.execute(stmt, ['company_phone', '+250 788 739 764'])
    await pool.execute(stmt, ['company_address', 'Kicukiro - Nyarugunga, Kigali, Rwanda'])
  }

  const stmt = 'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE `key` = `key`'
  await pool.execute(stmt, ['opening_cash', '0'])
  await pool.execute(stmt, ['equipment_value', '0'])
  await pool.execute(stmt, ['owner_capital', '0'])
  await pool.execute(stmt, ['liabilities_value', '0'])
}