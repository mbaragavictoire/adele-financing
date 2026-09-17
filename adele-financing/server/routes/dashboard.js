import { Router } from 'express'
import { queryAll, queryOne } from '../db.js'
import { requireAuth, handleError } from '../auth.js'

const router = Router()

router.get('/activity', requireAuth, async (req, res) => {
  try {
    const recentApplications = await queryAll(
      `SELECT la.application_id, c.full_name AS customer_name, lp.name AS product_name,
              la.requested_amount, la.status, la.created_at
       FROM loan_applications la
       JOIN customers c ON c.id = la.customer_id
       JOIN loan_products lp ON lp.id = la.loan_product_id
       ORDER BY la.created_at DESC LIMIT 8`,
    )

    const recentRepayments = await queryAll(
      `SELECT r.repayment_id, c.full_name AS customer_name, r.amount, r.payment_date
       FROM repayments r
       JOIN customers c ON c.id = r.customer_id
       ORDER BY r.created_at DESC LIMIT 8`,
    )

    const statusOverview = await queryAll(
      `SELECT status, COUNT(*) AS count FROM loan_applications GROUP BY status`,
    )

    const loanStatus = await queryAll(
      `SELECT status, COUNT(*) AS count FROM loans GROUP BY status`,
    )

    const recentRepaymentsByPayment = await queryAll(
      `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total
       FROM repayments GROUP BY month ORDER BY month DESC LIMIT 6`,
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