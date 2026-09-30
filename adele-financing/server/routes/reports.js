import { Router } from 'express'
import { queryAll, queryOne } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { parseQuarter } from '../quarter.js'

const router = Router()

router.get('/summary', requireAuth, async (req, res) => {
  try {
    const quarter = parseQuarter(req.query.q, req.query.year)
    const { start, end } = quarter

    const customerCounts = await queryOne(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
       FROM customers`,
    )
    const loanCounts = await queryOne(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status <> 'active' THEN 1 ELSE 0 END) AS inactive,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM loans`,
    )
    const totalCustomers = Number(customerCounts.total)
    const activeCustomers = Number(customerCounts.active)
    const inactiveCustomers = Number(customerCounts.inactive)
    const totalLoans = Number(loanCounts.total)
    const activeLoans = Number(loanCounts.active)
    const inactiveLoans = Number(loanCounts.inactive)
    const completedLoans = Number(loanCounts.completed)
    const pendingApplications = Number(
      (await queryOne("SELECT COUNT(*) AS c FROM loan_applications WHERE status IN ('pending','under_review')")).c,
    )
    const approvedApplications = Number(
      (await queryOne("SELECT COUNT(*) AS c FROM loan_applications WHERE status = 'approved'")).c,
    )
    const totalDisbursed = Number(
      (await queryOne("SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans WHERE status != 'cancelled'")).s,
    )
    const loansDisbursedQuarter = Number(
      (await queryOne(
        `SELECT COUNT(*) AS c FROM loans
         WHERE disbursement_date IS NOT NULL
           AND disbursement_date BETWEEN ? AND ?`,
        [start, end],
      )).c,
    )
    const totalDisbursedQuarter = Number(
      (await queryOne(
        `SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans
         WHERE disbursement_date IS NOT NULL
           AND disbursement_date BETWEEN ? AND ?`,
        [start, end],
      )).s,
    )
    const totalRepaid = Number((await queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM repayments')).s)
    const repayQuarter = await queryOne(
      `SELECT
         COALESCE(SUM(r.amount * l.interest / l.total_payable), 0) AS interest_received,
         COALESCE(SUM(r.amount * l.principal / l.total_payable), 0) AS capital_repaid
       FROM repayments r
       JOIN loans l ON l.id = r.loan_id
       WHERE r.payment_date BETWEEN ? AND ?`,
      [start, end],
    )
    const interestReceivedQuarter = Number(repayQuarter.interest_received)
    const capitalRepaidQuarter = Number(repayQuarter.capital_repaid)
    const outstanding = Number(
      (await queryOne("SELECT COALESCE(SUM(outstanding_balance), 0) AS s FROM loans WHERE status = 'active'")).s,
    )
    const approvedLoans = Number((await queryOne("SELECT COUNT(*) AS c FROM loans WHERE status = 'active'")).c)

    res.json({
      summary: {
        total_customers: totalCustomers,
        active_customers: activeCustomers,
        inactive_customers: inactiveCustomers,
        total_loans: totalLoans,
        active_loans: activeLoans,
        inactive_loans: inactiveLoans,
        completed_loans: completedLoans,
        pending_applications: pendingApplications,
        approved_loans: approvedLoans,
        approved_applications: approvedApplications,
        total_disbursed: totalDisbursed,
        loans_disbursed_quarter: loansDisbursedQuarter,
        total_disbursed_quarter: totalDisbursedQuarter,
        interest_received_quarter: interestReceivedQuarter,
        capital_repaid_quarter: capitalRepaidQuarter,
        total_repaid: totalRepaid,
        outstanding_balance: outstanding,
        quarter: {
          q: quarter.q,
          year: quarter.year,
          label: quarter.label,
          start: quarter.start,
          end: quarter.end,
          dateRangeLabel: quarter.dateRangeLabel,
        },
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

const dateFilter = (q, alias) => {
  let clause = ''
  const params = {}
  if (q.from) {
    clause += ` AND ${alias} >= @from`
    params.from = q.from
  }
  if (q.to) {
    clause += ` AND ${alias} <= @to`
    params.to = q.to
  }
  return { clause, params }
}

router.get('/customers', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'c.registration_date')
    const rows = await queryAll(
      `SELECT * FROM customers c WHERE 1=1 ${clause} ORDER BY c.registration_date DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/applications', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'la.application_date')
    const rows = await queryAll(
       `SELECT la.application_id, COALESCE(c.full_name, TRIM(CONCAT_WS(' ', la.applicant_first_name, la.applicant_last_name))) AS customer_name,
               lp.name AS product_name,
               la.requested_amount, la.duration, la.status, la.application_date
        FROM loan_applications la
        LEFT JOIN customers c ON c.id = la.customer_id
        JOIN loan_products lp ON lp.id = la.loan_product_id
       WHERE 1=1 ${clause}
       ORDER BY la.application_date DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/loans', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'l.start_date')
    const rows = await queryAll(
      `SELECT l.loan_id, c.full_name AS customer_name, l.principal, l.interest,
              l.total_payable, l.amount_paid, l.outstanding_balance, l.status,
              l.start_date, l.due_date
       FROM loans l
       JOIN customers c ON c.id = l.customer_id
       WHERE 1=1 ${clause}
       ORDER BY l.start_date DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/approved', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'la.approved_at')
    const rows = await queryAll(
       `SELECT la.application_id, COALESCE(c.full_name, TRIM(CONCAT_WS(' ', la.applicant_first_name, la.applicant_last_name))) AS customer_name,
               la.approved_amount, la.approved_duration, la.interest_rate, la.approved_at
        FROM loan_applications la
        LEFT JOIN customers c ON c.id = la.customer_id
        WHERE la.status = 'approved' ${clause}
       ORDER BY la.approved_at DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/rejected', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'la.rejected_at')
    const rows = await queryAll(
       `SELECT la.application_id, COALESCE(c.full_name, TRIM(CONCAT_WS(' ', la.applicant_first_name, la.applicant_last_name))) AS customer_name,
               la.requested_amount, la.rejection_reason, la.rejected_at
        FROM loan_applications la
        LEFT JOIN customers c ON c.id = la.customer_id
        WHERE la.status = 'rejected' ${clause}
       ORDER BY la.rejected_at DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/repayments', requireAuth, requireRole('super_admin', 'finance_officer'), async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'r.payment_date')
    const rows = await queryAll(
      `SELECT r.repayment_id, c.full_name AS customer_name, l.loan_id, r.amount,
              r.payment_date, r.payment_method, r.reference_number
       FROM repayments r
       JOIN customers c ON c.id = r.customer_id
       JOIN loans l ON l.id = r.loan_id
       WHERE 1=1 ${clause}
       ORDER BY r.payment_date DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/outstanding', requireAuth, async (req, res) => {
  try {
    const rows = await queryAll(
      `SELECT l.loan_id, c.full_name AS customer_name, l.principal, l.total_payable,
              l.amount_paid, l.outstanding_balance, l.due_date
       FROM loans l
       JOIN customers c ON c.id = l.customer_id
       WHERE l.status = 'active'
       ORDER BY l.outstanding_balance DESC`,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/completed', requireAuth, async (req, res) => {
  try {
    const { clause, params } = dateFilter(req.query, 'l.start_date')
    const rows = await queryAll(
      `SELECT l.loan_id, c.full_name AS customer_name, l.principal, l.total_payable,
              l.amount_paid, l.start_date, l.due_date
       FROM loans l
       JOIN customers c ON c.id = l.customer_id
       WHERE l.status = 'completed' ${clause}
       ORDER BY l.due_date DESC`,
      params,
    )
    res.json({ rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/financial', requireAuth, requireRole('super_admin', 'finance_officer'), async (req, res) => {
  try {
    const totalDisbursed = Number((await queryOne('SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans')).s)
    const totalRepaid = Number((await queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM repayments')).s)
    const totalInterest = Number((await queryOne('SELECT COALESCE(SUM(interest), 0) AS s FROM loans')).s)
    const outstanding = Number(
      (await queryOne("SELECT COALESCE(SUM(outstanding_balance), 0) AS s FROM loans WHERE status = 'active'")).s,
    )
    const active = Number((await queryOne("SELECT COUNT(*) AS c FROM loans WHERE status = 'active'")).c)
    const completed = Number((await queryOne("SELECT COUNT(*) AS c FROM loans WHERE status = 'completed'")).c)

    res.json({
      rows: [
        { metric: 'Total Disbursed', value: totalDisbursed },
        { metric: 'Total Repaid', value: totalRepaid },
        { metric: 'Total Interest', value: totalInterest },
        { metric: 'Outstanding Balance', value: outstanding },
        { metric: 'Active Loans', value: active },
        { metric: 'Completed Loans', value: completed },
      ],
    })
  } catch (e) {
    handleError(res, e)
  }
})

export default router