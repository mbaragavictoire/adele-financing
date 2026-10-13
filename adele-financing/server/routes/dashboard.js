import { Router } from 'express'
import { queryAll, queryOne } from '../db.js'
import { requireAuth, handleError } from '../auth.js'
import { quarterFromQuery } from '../quarter.js'

const router = Router()

// Every activity module below is scoped to the selected quarter, each using
// the transaction date that belongs to it:
//   applications  -> application_date   (DATE)
//   repayments    -> payment_date       (DATE)
// Alerts stay "to date": they are operational (overdue, pending, inactive
// products), not period statistics, and always need to reflect the present.
router.get('/activity', requireAuth, async (req, res) => {
  try {
    const parsed = quarterFromQuery(req.query.q, req.query.year)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const { start, end } = parsed.quarter

    const recentApplications = await queryAll(
      `SELECT la.application_id, COALESCE(c.full_name, TRIM(CONCAT_WS(' ', la.applicant_first_name, la.applicant_last_name))) AS customer_name,
              lp.name AS product_name, la.requested_amount, la.status, la.application_date
       FROM loan_applications la
       LEFT JOIN customers c ON c.id = la.customer_id
       JOIN loan_products lp ON lp.id = la.loan_product_id
       WHERE la.application_date BETWEEN ? AND ?
       ORDER BY la.application_date DESC LIMIT 8`,
      [start, end],
    )

    const recentRepayments = await queryAll(
      `SELECT r.repayment_id, c.full_name AS customer_name, r.amount, r.payment_date
       FROM repayments r
       JOIN customers c ON c.id = r.customer_id
       WHERE r.payment_date BETWEEN ? AND ?
       ORDER BY r.payment_date DESC LIMIT 8`,
      [start, end],
    )

    // Applications created in the quarter, grouped by their current status.
    const statusOverview = await queryAll(
      `SELECT status, COUNT(*) AS count FROM loan_applications
       WHERE application_date BETWEEN ? AND ?
       GROUP BY status`,
      [start, end],
    )

    // Loans originated (first disbursed) in the quarter, by current status.
    const loanStatus = await queryAll(
      `SELECT status, COUNT(*) AS count FROM loans
       WHERE disbursement_date BETWEEN ? AND ?
       GROUP BY status`,
      [start, end],
    )

    // Months inside the selected quarter — no spillover from earlier/later ones.
    const recentRepaymentsByPayment = await queryAll(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total
       FROM repayments
       WHERE payment_date BETWEEN ? AND ?
       GROUP BY month ORDER BY month`,
      [start, end],
    )

    const alerts = []

    const overdueLoans = await queryAll(
      `SELECT l.loan_id, c.full_name, l.outstanding_balance, l.due_date
       FROM loans l JOIN customers c ON c.id = l.customer_id
       WHERE l.status = 'active' AND l.due_date < CURDATE()
       ORDER BY l.due_date`,
    )
    if (overdueLoans.length) {
      alerts.push({
        level: 'warning',
        title: `${overdueLoans.length} overdue loan(s)`,
        detail: `${overdueLoans.length} active loan(s) are past their due date.`,
      })
    }

    const pending = Number(
      (await queryOne("SELECT COUNT(*) AS c FROM loan_applications WHERE status = 'pending'")).c,
    )
    if (pending > 0) {
      alerts.push({
        level: 'info',
        title: `${pending} pending application(s)`,
        detail: 'Applications awaiting review.',
      })
    }

    const sellingProducts = Number(
      (await queryOne("SELECT COUNT(*) AS c FROM loan_products WHERE status = 'inactive'")).c,
    )
    if (sellingProducts > 0) {
      alerts.push({
        level: 'info',
        title: `${sellingProducts} inactive loan product(s)`,
        detail: 'Some loan products are inactive.',
      })
    }

    res.json({
      recentApplications,
      recentRepayments,
      statusOverview,
      loanStatus,
      paymentActivity: recentRepaymentsByPayment.map((r) => ({
        month: r.month,
        total: r.total,
      })),
      alerts,
    })
  } catch (e) {
    handleError(res, e)
  }
})

export default router