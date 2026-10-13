// Quarterly dashboard filter — end-to-end verification against a scratch database.
//
// Creates a fresh DB (adele_qtest), boots the real API server against it, seeds
// controlled fixtures across Q1/Q2/Q3 2026 (boundary dates included), forges an
// admin session, and asserts every KPI against hand-computed expectations.
//
// Run with the local MySQL stack (XAMPP on 127.0.0.1:3306, root, no password):
//   node scripts/quarterly-dashboard-test.mjs
import { spawn } from 'node:child_process'
import mysql from 'mysql2/promise'
import crypto from 'node:crypto'

const MYSQL = { host: '127.0.0.1', port: 3306, user: 'root', password: '' }
const DB = 'adele_qtest'
const API_PORT = 5099
const BASE = `http://127.0.0.1:${API_PORT}/api`
const COOKIE = 'adele_session=qtest-cookie'
const RAW_ID = 'qtest-cookie'

let failures = 0
const results = []
function check(name, actual, expected, tol = 0.5) {
  const got = typeof actual === 'string' ? Number(actual) : actual
  const ok =
    typeof expected === 'number'
      ? typeof got === 'number' && Math.abs(got - expected) <= tol
      : JSON.stringify(actual) === JSON.stringify(expected)
  results.push({ name, ok, actual: got ?? actual, expected })
  if (!ok) failures++
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}  (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`)
}

async function api(path) {
  const res = await fetch(BASE + path, { headers: { Cookie: COOKIE } })
  const body = await res.json().catch(() => null)
  return { status: res.status, body }
}

// ---- 1. Fresh scratch database ------------------------------------------
const root = await mysql.createConnection(MYSQL)
await root.query(`DROP DATABASE IF EXISTS \`${DB}\``)
await root.query(`CREATE DATABASE \`${DB}\` CHARACTER SET utf8mb4`)
await root.end()
console.log('[*] scratch database ready')

// ---- 2. Boot the real API server against it ------------------------------
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
    CORS_ORIGINS: 'http://127.0.0.1:' + API_PORT,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let bootLog = ''
server.stdout.on('data', (d) => {
  bootLog += String(d)
})
server.stderr.on('data', (d) => {
  bootLog += String(d)
})
const deadline = Date.now() + 40000
while (Date.now() < deadline && !/ready/i.test(bootLog)) {
  await new Promise((r) => setTimeout(r, 400))
}
if (!/ready/i.test(bootLog)) {
  console.error('server failed to boot:\n' + bootLog)
  server.kill()
  process.exit(2)
}
console.log('[*] API server ready on port', API_PORT)

// ---- 3. Fixtures: products, customers, applications, loans, repayments, incomes, expenses
const conn = await mysql.createConnection({ ...MYSQL, database: DB })

// The server seed may have created its own rows (e.g. a default loan product).
// This is a throwaway scratch DB, so sweep the fixture tables first.
for (const t of ['incomes', 'expenses', 'repayments', 'loans', 'loan_applications', 'customers', 'loan_products']) {
  await conn.query(`DELETE FROM \`${t}\``)
}

await conn.query(
  `INSERT INTO loan_products (id, name, description, min_amount, max_amount, interest_rate, max_duration, status)
   VALUES (1, 'Standard Loan', 'fixture', 0, 10000000, 12, 24, 'active')`,
)

for (const c of [
  [1, 'CUS-0001', 'Customer One', '+250780000001', 'M', 'c1@test.local', 0, 0, 'active', '2026-01-05'],
  [2, 'CUS-0002', 'Customer Two', '+250780000002', 'F', 'c2@test.local', 0, 0, 'active', '2026-01-06'],
  [3, 'CUS-0003', 'Customer Three', '+250780000003', 'F', 'c3@test.local', 0, 0, 'inactive', '2026-01-07'],
]) {
  await conn.query(
    `INSERT INTO customers (id, customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    c,
  )
}

// Applications. Key boundary cases:
//  A1 applied 2026-03-31 (Q1 last day), approved 2026-04-02 (Q2) — cross-quarter approval.
//  A3 applied 2026-06-30 (Q2 last day), rejected 2026-06-30 23:59:59 — DATETIME last-day edge.
//  A6 applied 2026-07-01 (Q3 first day).
const applications = [
  [1, 'APP-0001', 1, 'Customer One', 1000000, 12, 1, '2026-03-31', 'approved', null, '2026-04-02 10:00:00'],
  [2, 'APP-0002', 2, 'Customer Two', 500000, 6, 1, '2026-04-01', 'approved', null, '2026-04-05 09:00:00'],
  [3, 'APP-0003', 2, 'Customer Two', 400000, 6, 1, '2026-06-30', 'rejected', '2026-06-30 23:59:59', null],
  [4, 'APP-0004', 3, 'Customer Three', 250000, 6, 1, '2026-05-15', 'pending', null, null],
  [5, 'APP-0005', 3, 'Customer Three', 200000, 6, 1, '2026-01-10', 'approved', null, '2026-01-15 08:00:00'],
  [6, 'APP-0006', 1, 'Customer One', 300000, 6, 1, '2026-07-01', 'approved', null, '2026-07-10 11:00:00'],
]
for (const [id, appId, custId, name, amount, dur, prodId, appDate, status, rejAt, apprAt] of applications) {
  await conn.query(
    `INSERT INTO loan_applications
       (id, application_id, customer_id, applicant_first_name, applicant_last_name, requested_amount, duration,
        loan_product_id, application_date, status, rejection_reason, rejected_at, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1, ?)`,
    [id, appId, custId, name.split(' ')[0], name.split(' ')[1], amount, dur, prodId, appDate, status, rejAt, apprAt],
  )
}

// Loans. principal/interest/total_payable ratios are 1,000,000 / 100,000 / 1,100,000 etc.
//  L1 disbursed Q2 (2026-05-20) from a Q1 application (A1) — cross-quarter case.
//  L2 disbursed 2026-06-30 (Q2 last day).
//  L3 disbursed Q1 (2026-02-15), fully repaid in Q1.
//  L4 disbursed Q3 (2026-08-10).
const loans = [
  [1, 'LN-0001', 1, 1, 1000000, 100000, 1100000, 220000, 800000, '2026-04-02', '2027-04-02', 12, 'active', '2026-05-20', 1000000, 1],
  [2, 'LN-0002', 2, 1, 500000, 50000, 550000, 110000, 400000, '2026-05-01', '2026-11-01', 6, 'active', '2026-06-30', 500000, 2],
  [3, 'LN-0003', 3, 1, 200000, 20000, 220000, 220000, 0, '2026-01-20', '2026-07-20', 6, 'completed', '2026-02-15', 200000, 5],
  [4, 'LN-0004', 1, 1, 300000, 30000, 330000, 0, 300000, '2026-07-20', '2027-01-20', 6, 'active', '2026-08-10', 300000, 6],
]
for (const l of loans) {
  await conn.query(
    `INSERT INTO loans
       (id, loan_id, customer_id, loan_product_id, principal, interest, total_payable, amount_paid, outstanding_balance,
        start_date, due_date, duration, status, disbursement_date, disbursed_amount, application_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    l,
  )
}

// Repayments. L1 receives repayments in Q2 (R1) and Q3 (R2) — same loan, different quarters.
const repayments = [
  ['RPM-0001', 1, 1, 220000, '2026-06-15'],
  ['RPM-0002', 1, 1, 220000, '2026-07-05'],
  ['RPM-0003', 3, 3, 220000, '2026-02-28'],
  ['RPM-0004', 2, 2, 110000, '2026-06-30'],
]
for (const r of repayments) {
  await conn.query(
    `INSERT INTO repayments (repayment_id, loan_id, customer_id, amount, payment_date, payment_method, reference_number)
     VALUES (?, ?, ?, ?, ?, 'Cash', NULL)`,
    r,
  )
}

const incomes = [
  ['INC-0001', 'Office rent refund', 50000, '2026-04-10'],
  ['INC-0002', 'Consulting', 20000, '2026-03-15'],
  ['INC-0003', 'Grant', 30000, '2026-07-20'],
]
for (const i of incomes) {
  await conn.query(
    `INSERT INTO incomes (income_id, description, amount, category, income_date, payment_method)
     VALUES (?, ?, ?, 'Other Income', ?, 'Cash')`,
    i,
  )
}
const expenses = [
  ['EXP-0001', 'Stationery', 40000, '2026-04-25'],
  ['EXP-0002', 'Transport', 15000, '2026-02-10'],
  ['EXP-0003', 'Repairs', 25000, '2026-08-01'],
]
for (const e of expenses) {
  await conn.query(
    `INSERT INTO expenses (expense_id, description, amount, category, expense_date, payment_method)
     VALUES (?, ?, ?, 'Other Expense', ?, 'Cash')`,
    e,
  )
}
await conn.end()
console.log('[*] fixtures inserted')

// ---- 4. Forge an admin session -------------------------------------------
const authConn = await mysql.createConnection({ ...MYSQL, database: DB })
const [admins] = await authConn.query("SELECT id FROM users WHERE role = 'super_admin' ORDER BY id LIMIT 1")
if (!admins.length) {
  console.error('no seeded super_admin found')
  process.exit(2)
}
await authConn.query(
  `INSERT INTO sessions (id, user_id, absolute_expires_at, idle_expires_at, ip, user_agent)
   VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY), '127.0.0.1', 'quarterly-dashboard-test')`,
  [crypto.createHash('sha256').update(RAW_ID).digest('hex'), admins[0].id],
)
await authConn.end()
console.log('[*] admin session forged (user id', admins[0].id + ')')

// ---- 5. Assertions --------------------------------------------------------
console.log('\n== Q2 2026 (2026-04-01 .. 2026-06-30 inclusive) ==')
{
  const { status, body } = await api('/reports/summary?q=2&year=2026')
  check('reports/summary Q2 returns 200', status, 200)
  const s = body?.summary || {}
  check('Q2 applications total (application_date)', s.applications_total_quarter, 3)
  check('Q2 applications approved (approved_at)', s.applications_approved_quarter, 2)
  check('Q2 applications rejected (rejected_at)', s.applications_rejected_quarter, 1)
  check('Q2 loans disbursed (disbursement_date)', s.loans_disbursed_quarter, 2)
  check('Q2 total disbursed', s.total_disbursed_quarter, 1500000)
  check('Q2 repayments received (payment_date)', s.repayments_received_quarter, 330000)
  check('Q2 interest received', s.interest_received_quarter, 30000, 1)
  check('Q2 capital repaid', s.capital_repaid_quarter, 300000, 1)
  check('Q2 outstanding as of period end', s.outstanding_balance_end, 1200000, 1)
  check('Q2 quarter label', s.quarter?.label, 'Q2 2026')
  check('Q2 quarter start', s.quarter?.start, '2026-04-01')
  check('Q2 quarter end', s.quarter?.end, '2026-06-30')
  check('Q2 quarter endExclusive', s.quarter?.endExclusive, '2026-07-01')
  const fin = (await api('/finance/summary?q=2&year=2026')).body?.summary || {}
  check('Q2 income (income_date)', fin.income_quarter, 50000)
  check('Q2 interest income', fin.interest_income_quarter, 30000, 1)
  check('Q2 total income = interest + other', fin.total_income_quarter, 80000)
  check('Q2 expenses (expense_date)', fin.expenses_quarter, 40000)
  check('Q2 net profit', fin.net_profit_quarter, 40000)
  check('Q2 cash balance as of period end', fin.cash_balance_end, -1135000, 1)
  const act = (await api('/dashboard/activity?q=2&year=2026')).body
  check('Q2 recent applications in quarter', act?.recentApplications?.length, 3)
  check('Q2 applications by status (approved/rejected/pending)',
    Object.fromEntries((act?.statusOverview || []).map((r) => [r.status, Number(r.count)]).sort((a, b) => a[0].localeCompare(b[0]))),
    { approved: 1, pending: 1, rejected: 1 })
  check('Q2 recent repayments in quarter', act?.recentRepayments?.length, 2)
  check('Q2 payment months only within quarter',
    (act?.paymentActivity || []).map((p) => p.month),
    ['2026-06'])
  check('Q2 loans originated by status', Object.fromEntries((act?.loanStatus || []).map((r) => [r.status, Number(r.count)])), { active: 2 })
}

console.log('\n== Q1 2026 (Jan 1 .. Mar 31) ==')
{
  const s = (await api('/reports/summary?q=1&year=2026')).body?.summary || {}
  check('Q1 applications total incl. Mar 31', s.applications_total_quarter, 2)
  check('Q1 approved (only A5; A1 approved in Q2)', s.applications_approved_quarter, 1)
  check('Q1 rejected', s.applications_rejected_quarter, 0)
  check('Q1 loans disbursed', s.loans_disbursed_quarter, 1)
  check('Q1 total disbursed', s.total_disbursed_quarter, 200000)
  check('Q1 repayments received', s.repayments_received_quarter, 220000)
  check('Q1 interest received', s.interest_received_quarter, 20000, 1)
  check('Q1 capital repaid', s.capital_repaid_quarter, 200000, 1)
  check('Q1 outstanding as of period end (L3 fully repaid)', s.outstanding_balance_end, 0, 1)
  const fin = (await api('/finance/summary?q=1&year=2026')).body?.summary || {}
  check('Q1 income', fin.income_quarter, 20000)
  check('Q1 expenses', fin.expenses_quarter, 15000)
  check('Q1 net profit', fin.net_profit_quarter, 25000)
  check('Q1 cash balance as of end', fin.cash_balance_end, 25000, 1)
  const act = (await api('/dashboard/activity?q=1&year=2026')).body
  check('Q1 recent applications', act?.recentApplications?.length, 2)
  check('Q1 loans originated by status (L3 completed)', Object.fromEntries((act?.loanStatus || []).map((r) => [r.status, Number(r.count)])), { completed: 1 })
}

console.log('\n== Q3 2026 (Jul 1 .. Sep 30) ==')
{
  const s = (await api('/reports/summary?q=3&year=2026')).body?.summary || {}
  check('Q3 applications total (A6 on Jul 1)', s.applications_total_quarter, 1)
  check('Q3 approved', s.applications_approved_quarter, 1)
  check('Q3 loans disbursed', s.loans_disbursed_quarter, 1)
  check('Q3 total disbursed', s.total_disbursed_quarter, 300000)
  check('Q3 repayments received (R2 on Jul 5 for L1)', s.repayments_received_quarter, 220000)
  check('Q3 interest received', s.interest_received_quarter, 20000, 1)
  check('Q3 outstanding as of end (L1 fell from 800k to 600k)', s.outstanding_balance_end, 1300000, 1)
  const fin = (await api('/finance/summary?q=3&year=2026')).body?.summary || {}
  check('Q3 income', fin.income_quarter, 30000)
  check('Q3 expenses', fin.expenses_quarter, 25000)
  check('Q3 net profit', fin.net_profit_quarter, 25000)
  check('Q3 cash balance as of end', fin.cash_balance_end, -1210000, 1)
}

console.log('\n== Empty quarters ==')
{
  const s4 = (await api('/reports/summary?q=4&year=2026')).body?.summary || {}
  check('Q4 2026 applications total = 0', s4.applications_total_quarter, 0)
  check('Q4 2026 disbursed = 0', s4.loans_disbursed_quarter, 0)
  check('Q4 2026 repayments = 0', s4.repayments_received_quarter, 0)
  check('Q4 2026 outstanding as of Dec 31 keeps all history', s4.outstanding_balance_end, 1300000, 1)
  const s27 = (await api('/reports/summary?q=1&year=2027')).body?.summary || {}
  check('2027 Q1 applications total = 0', s27.applications_total_quarter, 0)
  check('2027 Q1 approved = 0', s27.applications_approved_quarter, 0)
  check('2027 Q1 disbursed = 0', s27.loans_disbursed_quarter, 0)
  check('2027 Q1 repayments = 0', s27.repayments_received_quarter, 0)
  check('2027 Q1 historical balance still intact', s27.outstanding_balance_end, 1300000, 1)
  const act = (await api('/dashboard/activity?q=4&year=2026')).body
  check('Q4 2026 recent applications empty', act?.recentApplications?.length, 0)
  check('Q4 2026 recent repayments empty', act?.recentRepayments?.length, 0)
  check('Q4 2026 status overview empty', act?.statusOverview?.length, 0)
  check('Q4 2026 payment activity empty', act?.paymentActivity?.length, 0)
}

console.log('\n== Cross-quarter semantics ==')
{
  const s1 = (await api('/reports/summary?q=1&year=2026')).body?.summary || {}
  const s2 = (await api('/reports/summary?q=2&year=2026')).body?.summary || {}
  const s3 = (await api('/reports/summary?q=3&year=2026')).body?.summary || {}
  const act1 = (await api('/dashboard/activity?q=1&year=2026')).body
  const act2 = (await api('/dashboard/activity?q=2&year=2026')).body

  check('application dated Q1 last day counts in Q1 only', s1.applications_total_quarter === 2 && s2.applications_total_quarter === 3, true)
  check('approval in Q2 counts in Q2, not Q1',
    s1.applications_approved_quarter === 1 && s2.applications_approved_quarter === 2, true)
  check('disbursement in Q2 not counted in Q1',
    s1.total_disbursed_quarter === 200000 && s2.total_disbursed_quarter === 1500000, true)
  check('same loan repaid in Q2 and Q3 counted per quarter',
    s2.repayments_received_quarter === 330000 && s3.repayments_received_quarter === 220000, true)
  check('outstanding drops as later repayments arrive',
    s2.outstanding_balance_end === 1200000 && s3.outstanding_balance_end === 1300000, true)
  check('activity list for Q1 excludes Q2 applications',
    act1?.recentApplications?.every((a) => a.application_id !== 'APP-0002'), true)
  check('activity list for Q2 excludes Q1 applications',
    act2?.recentApplications?.every((a) => a.application_id !== 'APP-0001'), true)
}

console.log('\n== Parameter validation ==')
{
  for (const bad of ['q=5&year=2026', 'q=0&year=2026', 'q=-1&year=2026', 'q=abc&year=2026', 'q=1&year=1999', 'q=1&year=2101', 'q=3.5&year=2026']) {
    const r = await api(`/dashboard/activity?${bad}`)
    check(`dashboard/activity rejects ${bad}`, r.status, 400)
  }
  const r1 = await api('/reports/summary?q=9&year=2026')
  check('reports/summary rejects q=9', r1.status, 400)
  const r2 = await api('/finance/summary?q=1&year=0')
  check('finance/summary rejects year=0', r2.status, 400)
  const ok = await api('/dashboard/activity?q=2&year=2026')
  check('valid q/year still allowed', ok.status, 200)
}

console.log('\n== Security: unauth and role guard ==')
{
  const res = await fetch(BASE + '/dashboard/activity?q=2&year=2026')
  check('unauthenticated dashboard request rejected (401)', res.status, 401)
  const fin = await fetch(BASE + '/finance/summary?q=2&year=2026', { headers: { Cookie: COOKIE } })
  check('finance summary allowed for super_admin (200)', fin.status, 200)
}

// ---- 6. Shutdown ----------------------------------------------------------
server.kill()
console.log(`\n==== ${results.length} checks, ${failures} failed ====`)
process.exit(failures === 0 ? 0 : 1)

process.on('exit', () => {
  try { server.kill() } catch { /* already gone */ }
})