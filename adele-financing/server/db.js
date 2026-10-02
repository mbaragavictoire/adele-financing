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
    // NOTE: a legacy step here used to DROP COLUMN customers.address on every
    // boot, silently destroying existing customer addresses. Legacy columns are
    // intentionally left in place; drop them only through a reviewed migration.
    const appCustRows = await queryAll(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loan_applications' AND COLUMN_NAME = 'customer_id'`,
    )
    if (appCustRows.length > 0 && String(appCustRows[0].IS_NULLABLE).toUpperCase() !== 'YES') {
      await run('ALTER TABLE loan_applications MODIFY COLUMN customer_id INT NULL')
    }
    const appCols = await queryAll(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loan_applications'`,
    )
    const appHas = new Set(appCols.map((r) => r.COLUMN_NAME))
    if (!appHas.has('applicant_first_name')) {
      await run('ALTER TABLE loan_applications ADD COLUMN applicant_first_name VARCHAR(255)')
    }
    if (!appHas.has('applicant_last_name')) {
      await run('ALTER TABLE loan_applications ADD COLUMN applicant_last_name VARCHAR(255)')
    }
    if (!appHas.has('applicant_email')) {
      await run('ALTER TABLE loan_applications ADD COLUMN applicant_email VARCHAR(255)')
    }
    if (!appHas.has('applicant_phone')) {
      await run('ALTER TABLE loan_applications ADD COLUMN applicant_phone VARCHAR(50)')
    }

    const customerEmailIndex = await queryAll(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
         AND INDEX_NAME = 'uq_customers_email' LIMIT 1`,
    )
    if (customerEmailIndex.length === 0) {
      const duplicateEmails = await queryAll(
        `SELECT LOWER(email) AS email_key FROM customers
         WHERE email IS NOT NULL AND TRIM(email) <> ''
         GROUP BY LOWER(email) HAVING COUNT(*) > 1`,
      )
      if (duplicateEmails.length === 0) {
        await run('ALTER TABLE customers ADD UNIQUE KEY uq_customers_email (email)')
      } else {
        console.warn('Skipping unique customer email index because duplicate emails already exist.')
      }
    }

    const loanApplicationIndex = await queryAll(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'loans'
         AND INDEX_NAME = 'uq_loans_application_id' LIMIT 1`,
    )
    if (loanApplicationIndex.length === 0) {
      const duplicateLoans = await queryAll(
        `SELECT application_id FROM loans
         WHERE application_id IS NOT NULL
         GROUP BY application_id HAVING COUNT(*) > 1`,
      )
      if (duplicateLoans.length === 0) {
        await run('ALTER TABLE loans ADD UNIQUE KEY uq_loans_application_id (application_id)')
      } else {
        console.warn('Skipping unique loan application index because duplicate loans already exist.')
      }
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

async function queryAllWith(executor, sql, params) {
  const { sql: s, values } = toArgs(sql, params)
  const [rows] = await executor.execute(s, values)
  return rows
}

async function queryOneWith(executor, sql, params) {
  const rows = await queryAllWith(executor, sql, params)
  return rows[0]
}

async function runWith(executor, sql, params) {
  const { sql: s, values } = toArgs(sql, params)
  const [res] = await executor.execute(s, values)
  return { lastInsertRowid: Number(res.insertId), changes: res.affectedRows }
}

export async function queryAll(sql, params) {
  return queryAllWith(pool, sql, params)
}

export async function queryOne(sql, params) {
  return queryOneWith(pool, sql, params)
}

export async function run(sql, params) {
  return runWith(pool, sql, params)
}

export async function withTransaction(callback) {
  if (!pool) throw new Error('Database is not initialized.')
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const tx = {
      queryAll: (sql, params) => queryAllWith(connection, sql, params),
      queryOne: (sql, params) => queryOneWith(connection, sql, params),
      run: (sql, params) => runWith(connection, sql, params),
    }
    const result = await callback(tx)
    await connection.commit()
    return result
  } catch (error) {
    try {
      await connection.rollback()
    } catch {
      // Preserve the original database error.
    }
    throw error
  } finally {
    connection.release()
  }
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
    amount DOUBLE NOT NULL DEFAULT 0,
    duration INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    registration_date DATE NOT NULL,
    UNIQUE KEY uq_customers_email (email)
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
    customer_id INT,
    applicant_first_name VARCHAR(255),
    applicant_last_name VARCHAR(255),
    applicant_email VARCHAR(255),
    applicant_phone VARCHAR(50),
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
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_loans_application_id (application_id)
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

  CREATE TABLE IF NOT EXISTS revoked_tokens (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id INT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_revoked_expires (expires_at)
  );

  -- Server-side sessions. The id column is the SHA-256 hash of the cookie value,
  -- never the cookie value itself, so a database leak yields nothing replayable.
  -- idle_expires_at slides forward with activity; absolute_expires_at never does.
  CREATE TABLE IF NOT EXISTS sessions (
    id CHAR(64) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    absolute_expires_at DATETIME NOT NULL,
    idle_expires_at DATETIME NOT NULL,
    revoked_at DATETIME,
    revoked_by INT,
    revoke_reason VARCHAR(255),
    ip VARCHAR(64),
    user_agent VARCHAR(255),
    KEY idx_sessions_user (user_id, revoked_at),
    KEY idx_sessions_live (revoked_at, absolute_expires_at, idle_expires_at),
    KEY idx_sessions_revoked_at (revoked_at)
  );

  CREATE TABLE IF NOT EXISTS login_attempts (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(255),
    ip VARCHAR(64),
    successful TINYINT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_attempts_identifier (identifier, created_at),
    KEY idx_login_attempts_created (created_at)
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
  // Seed only the single super_admin account. Previously every seeded role
  // shared one bcrypt hash, so compromising the weakest account revealed the
  // super_admin password. Other roles must be created by a super_admin.
  const seedPassword =
    process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url')
  const passwordHash = bcrypt.hashSync(seedPassword, 12)

  if ((await countRows('users')) === 0) {
    const stmt = `
      INSERT INTO users (full_name, email, phone, password_hash, role, status)
      VALUES (?, ?, ?, ?, ?, 'active')
    `
    await pool.execute(stmt, [
      'System Administrator',
      'adele1company@gmail.com',
      '+250 788 739 764',
      passwordHash,
      'super_admin',
    ])
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`[seed] Generated super_admin password: ${seedPassword}`)
    }
    console.log(
      '[seed] Only a super_admin was created. Add loan_officer / finance_officer / ' +
        'manager accounts from Settings > Staff after signing in.',
    )
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