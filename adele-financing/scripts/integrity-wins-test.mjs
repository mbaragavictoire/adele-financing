// Integrity quick-wins — end-to-end verification of fixes 1-4.
//
// 1. Public application duration is capped by the selected product's
//    max_duration (was hard-capped at 6 months).
// 2. Customer duration ceiling relaxed from 6 to 120 months (approval writes
//    up to product limits into customers.duration, so 6 was wrong).
// 3. Income/expense reference IDs are MAX-based with a retry loop (COUNT-based
//    IDs were reused after deletions).
// 4. Loan balances: interest is rounded to whole francs at creation, and the
//    closing repayment clears a sub-franc residue instead of getting stuck.
//
// Run against the local MySQL stack (XAMPP, 127.0.0.1:3306, root, no password):
//   node scripts/integrity-wins-test.mjs
import { spawn } from 'node:child_process'
import mysql from 'mysql2/promise'
import crypto from 'node:crypto'

const MYSQL = { host: '127.0.0.1', port: 3306, user: 'root', password: '' }
const DB = 'adele_qtest2'
const API_PORT = 5098
const BASE = `http://127.0.0.1:${API_PORT}/api`
const COOKIE = 'adele_session=qtest-cookie'

let failures = 0
const results = []
function check(name, actual, expected) {
  const ok =
    typeof expected === 'number'
      ? typeof actual === 'number' && Math.abs(actual - expected) < 0.001
      : JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, ok, actual, expected })
  if (!ok) failures++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Cookie: COOKIE, ...(opts.headers || {}) },
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ---- 1. Fresh scratch DB ---------------------------------------------------
const root = await mysql.createConnection(MYSQL)
await root.query('DROP DATABASE IF EXISTS `' + DB + '`')
await root.query('CREATE DATABASE `' + DB + '` CHARACTER SET utf8mb4')
await root.end()
console.log('[*] scratch database ready')

// ---- 2. Boot the real API server -------------------------------------------
const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DB_HOST: MYSQL.host,
    DB_PORT: String(MYSQL.port),
    DB_NAME: DB,
    DB_USER: MYSQL.user,
    DB_PASSWORD: MYSQL.password,
    PORT: String(API_PORT),
    NODE_ENV: 'development',
    SESSION_COOKIE_SECURE: 'false',
    SEED_ADMIN_PASSWORD: 'QtestAdminPass1!',
    CORS_ORIGINS: `http://127.0.0.1:${API_PORT}`,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let bootLog = ''
server.stdout.on('data', (d) => (bootLog += String(d)))
server.stderr.on('data', (d) => (bootLog += String(d)))
const deadline = Date.now() + 40000
while (Date.now() < deadline && !/ready/i.test(bootLog)) await new Promise((r) => setTimeout(r, 400))
if (!/ready/i.test(bootLog)) {
  console.error('server failed to boot:\n' + bootLog)
  server.kill()
  process.exit(2)
}
console.log('[*] API server ready on port', API_PORT)

// ---- 3. Fixtures -----------------------------------------------------------
const conn = await mysql.createConnection({ ...MYSQL, database: DB })
for (const t of ['incomes', 'expenses', 'payments', 'repayments', 'repayment_schedules', 'loans', 'loan_applications', 'customers', 'loan_products']) {
  await conn.query('DELETE FROM `' + t + '`')
}
// Products: "Personal Loan" allows 24 months, "Salary Loan" allows 6.
await conn.query(
  `INSERT INTO loan_products (id, name, description, min_amount, max_amount, interest_rate, max_duration, status)
   VALUES (1, 'Personal Loan', 'fixture', 0, 10000000, 12, 24, 'active'),
          (2, 'Salary Loan', 'fixture', 0, 10000000, 12, 6, 'active')`,
)
await conn.query(
  `INSERT INTO customers (id, customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
   VALUES (1, 'CUS-0001', 'Test Customer', '781234990', 'M', 'cust@test.local', 0, 0, 'active', '2026-01-05')`,
)
await conn.end()

// ---- 4. Forge super_admin session ------------------------------------------
const authConn = await mysql.createConnection({ ...MYSQL, database: DB })
const [admins] = await authConn.query("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1")
await authConn.query(
  `INSERT INTO sessions (id, user_id, absolute_expires_at, idle_expires_at, ip, user_agent)
   VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY), '127.0.0.1', 'integrity-wins-test')`,
  [crypto.createHash('sha256').update('qtest-cookie').digest('hex'), admins[0].id],
)
await authConn.end()
console.log('[*] admin session forged')

// ---- 5. Tests --------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10)

console.log('\n== 1. Public application duration follows product max_duration ==')
{
  const post = (payload) =>
    api('/apply', { method: 'POST', body: JSON.stringify(payload) })

  const rLong = await post({
    first: 'Alice', last: 'Mukamana', email: 'alice@test.local', phone: '780000001',
    amount: '500000', loanType: 'personal', date: today, monthly: '12',
  })
  check('12-month apply on a 24-month product accepted', rLong.status, 201)

  const rTooLong = await post({
    first: 'Bob', last: 'Mugisha', email: 'bob@test.local', phone: '780000002',
    amount: '500000', loanType: 'salary', date: today, monthly: '12',
  })
  check('12-month apply on a 6-month product rejected (400)', rTooLong.status, 400)
  check('rejection names the product limit', rTooLong.body?.error?.includes('6 months'), true)

  const rOver = await post({
    first: 'Caro', last: 'Uwase', email: 'caro@test.local', phone: '780000003',
    amount: '500000', loanType: 'personal', date: today, monthly: '25',
  })
  check('25-month apply on a 24-month product rejected', rOver.status, 400)

  const rShort = await post({
    first: 'Didi', last: 'Ingabire', email: 'didi@test.local', phone: '780000004',
    amount: '500000', loanType: 'personal', date: today, monthly: '6',
  })
  check('6-month apply still accepted (no regression)', rShort.status, 201)

  const readConn = await mysql.createConnection({ ...MYSQL, database: DB })
  const [row] = await readConn.query(
    "SELECT duration FROM loan_applications WHERE applicant_email = 'alice@test.local'",
  )
  check('stored application duration is 12', row?.length ? Number(row[0].duration) : null, 12)
  await readConn.end()
}

console.log('\n== 2. Customer duration ceiling ==')
{
  const create = (duration, phone) =>
    api('/customers', {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Niyonzima Eric',
        phone_number: phone,
        email: `cust${duration}@test.local`,
        amount: 0,
        duration,
        status: 'active',
        registration_date: '2026-02-01',
      }),
    })
  const ok = await create(12, '780000010')
  check('customer with 12-month duration accepted', ok.status, 201)
  const tooHigh = await create(121, '780000011')
  check('customer with 121-month duration rejected (sanity bound)', tooHigh.status, 400)
}

console.log('\n== 3. Income / expense IDs are MAX-based (no reuse after delete) ==')
{
  // Scenario that breaks COUNT-based IDs: create two records, delete the FIRST,
  // create a third. COUNT-based would rebuild the second record's ID and fail
  // with a duplicate key; MAX-based advances past it. (Deleting the *max* row
  // is legal in both schemes, so this deletes a non-max row.)
  const makeIncome = (description, amount) =>
    api('/finance/income', {
      method: 'POST',
      body: JSON.stringify({ description, amount, income_date: '2026-03-10' }),
    })
  const i1 = await makeIncome('Consulting', 10000)
  check('first income created', i1.status, 201)
  check('first income id is INC-00001', i1.body?.income?.income_id, 'INC-00001')
  const i2 = await makeIncome('Consulting again', 15000)
  check('second income created with next id', i2.status, 201)
  check('second income id is INC-00002', i2.body?.income?.income_id, 'INC-00002')
  const del1 = await api(`/finance/income/${i1.body?.income?.id}`, { method: 'DELETE' })
  check('first income deleted via API', del1.status, 200)
  const i3 = await makeIncome('Consulting third', 20000)
  check('third income created after deleting the first', i3.status, 201)
  check('income id advances past deleted record (INC-00003)', i3.body?.income?.income_id, 'INC-00003')

  const makeExpense = (description, amount) =>
    api('/finance/expenses', {
      method: 'POST',
      body: JSON.stringify({ description, amount, expense_date: '2026-03-11' }),
    })
  const e1 = await makeExpense('Stationery', 5000)
  check('first expense created', e1.status, 201)
  check('first expense id is EXP-00001', e1.body?.expense?.expense_id, 'EXP-00001')
  const e2 = await makeExpense('Stationery again', 6000)
  check('second expense created with next id', e2.status, 201)
  check('second expense id is EXP-00002', e2.body?.expense?.expense_id, 'EXP-00002')
  const delE = await api(`/finance/expenses/${e1.body?.expense?.id}`, { method: 'DELETE' })
  check('first expense deleted via API', delE.status, 200)
  const e3 = await makeExpense('Stationery third', 7000)
  check('third expense created after deleting the first', e3.status, 201)
  check('expense id advances past deleted record (EXP-00003)', e3.body?.expense?.expense_id, 'EXP-00003')
}

console.log('\n== 4. Loan completion settles cleanly ==')
{
  const dc = await mysql.createConnection({ ...MYSQL, database: DB })

  // Fresh whole-franc loan (as loans.js now creates them).
  await dc.query(
    `INSERT INTO loans
      (id, loan_id, customer_id, loan_product_id, principal, interest, total_payable, amount_paid,
       outstanding_balance, start_date, due_date, duration, status, disbursement_date, disbursed_amount)
     VALUES (1, 'LON-00001', 1, 1, 100000, 25000, 125000, 0, 125000,
             '2026-01-10', '2027-01-10', 12, 'active', '2026-01-10', 100000)`,
  )
  const repay = (loanId, amount) =>
    api('/repayments', {
      method: 'POST',
      body: JSON.stringify({ loan_id: loanId, amount, payment_date: '2026-02-10' }),
    })

  const p1 = await repay(1, 100000)
  check('partial repayment accepted', p1.status, 201)
  const p2 = await repay(1, 25000)
  check('closing repayment accepted', p2.status, 201)
  check('loan completed', p2.body?.loan?.status, 'completed')
  check('completed balance is exactly 0', Number(p2.body?.loan?.outstanding_balance), 0)
  check('amount_paid equals total_payable', Number(p2.body?.loan?.amount_paid), 125000)

  // Legacy fractional loan (from pre-rounding creation) — closing payment must
  // be able to clear a sub-franc residue, while real overpayments still fail.
  await dc.query(
    `INSERT INTO loans
      (id, loan_id, customer_id, loan_product_id, principal, interest, total_payable, amount_paid,
       outstanding_balance, start_date, due_date, duration, status, disbursement_date, disbursed_amount)
     VALUES (2, 'LON-00002', 1, 1, 100000, 33333.333, 133333.333, 0, 133333.333,
             '2026-01-20', '2027-01-20', 12, 'active', '2026-01-20', 100000)`,
  )
  const q1 = await repay(2, 100000)
  check('fractional loan partial repayment accepted', q1.status, 201)
  check('fractional loan balance after partial', Number(q1.body?.loan?.outstanding_balance), 33333.333)
  const over = await repay(2, 33334)
  check('overpayment of more than half a franc still rejected', over.status, 400)
  const q2 = await repay(2, 33333)
  check('closing payment clears sub-franc residue', q2.status, 201)
  check('legacy fractional loan completed', q2.body?.loan?.status, 'completed')
  check('legacy completed balance exactly 0', Number(q2.body?.loan?.outstanding_balance), 0)
  check('legacy amount_paid equals total_payable', Number(q2.body?.loan?.amount_paid) - 133333.333 < 0.001, true)

  await dc.end()
}

// ---- 6. Shutdown -----------------------------------------------------------
server.kill()
console.log(`\n==== ${results.length} checks, ${failures} failed ====`)
process.exit(failures === 0 ? 0 : 1)

process.on('exit', () => {
  try { server.kill() } catch { /* already gone */ }
})