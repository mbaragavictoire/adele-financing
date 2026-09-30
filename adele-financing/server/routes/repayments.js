import { Router } from 'express'
import { queryAll, withTransaction } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'

const router = Router()

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = `
      SELECT r.*, c.full_name AS customer_name, l.loan_id
      FROM repayments r
      JOIN customers c ON c.id = r.customer_id
      JOIN loans l ON l.id = r.loan_id
    `
    const params = {}
    const where = []
    const q = req.query

    if (q.loan_id && q.loan_id !== '') {
      where.push('r.loan_id = @loan_id')
      params.loan_id = q.loan_id
    }
    if (q.search && q.search.trim() !== '') {
      where.push('(r.repayment_id LIKE @search OR c.full_name LIKE @search OR l.loan_id LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (q.from && q.to) {
      where.push('r.payment_date BETWEEN @from AND @to')
      params.from = q.from
      params.to = q.to
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY r.payment_date DESC LIMIT 500'

    const rows = await queryAll(sql, params)
    res.json({ repayments: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/', requireAuth, requireRole('super_admin', 'finance_officer'), async (req, res) => {
  try {
    const { loan_id, amount, payment_date, payment_method = 'Cash', reference_number } = req.body || {}
    if (!loan_id || amount === undefined || amount === null || !payment_date) {
      throw httpError(400, 'Loan, amount and payment date are required.')
    }

    const result = await withTransaction(async (tx) => {
      const loan = await tx.queryOne('SELECT * FROM loans WHERE id = ? FOR UPDATE', [loan_id])
      if (!loan) throw httpError(404, 'Loan not found.')
      if (loan.status === 'completed') throw httpError(400, 'This loan is already completed.')

      const pay = Number(amount)
      if (!Number.isFinite(pay) || pay <= 0) throw httpError(400, 'Invalid repayment amount.')
      if (pay > Number(loan.outstanding_balance)) {
        throw httpError(400, `Amount exceeds outstanding balance of ${loan.outstanding_balance}.`)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(payment_date).trim())) {
        throw httpError(400, 'Payment date must use YYYY-MM-DD.')
      }

      const maxRepayment = await tx.queryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(repayment_id, 5) AS UNSIGNED)), 0) AS n
         FROM repayments`,
      )
      const repaymentId = genId('RPT', Number(maxRepayment.n))
      await tx.run(
        `INSERT INTO repayments
          (repayment_id, loan_id, customer_id, amount, payment_date, payment_method, reference_number, recorded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repaymentId,
          loan_id,
          loan.customer_id,
          pay,
          String(payment_date).trim(),
          payment_method,
          reference_number || null,
          req.user.sub,
        ],
      )

      const maxPayment = await tx.queryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 5) AS UNSIGNED)), 0) AS n
         FROM payments`,
      )
      const paymentId = genId('PAY', Number(maxPayment.n))
      await tx.run(
        `INSERT INTO payments
          (payment_id, loan_id, customer_id, type, amount, payment_date, payment_method, reference_number, recorded_by)
         VALUES (?, ?, ?, 'repayment', ?, ?, ?, ?, ?)`,
        [
          paymentId,
          loan_id,
          loan.customer_id,
          pay,
          String(payment_date).trim(),
          payment_method,
          reference_number || null,
          req.user.sub,
        ],
      )

      const newPaid = Number(loan.amount_paid) + pay
      const newBalance = Number(loan.outstanding_balance) - pay
      const newStatus = newBalance <= 0 ? 'completed' : loan.status
      await tx.run(
        'UPDATE loans SET amount_paid = ?, outstanding_balance = ?, status = ? WHERE id = ?',
        [newPaid, Math.max(newBalance, 0), newStatus, loan_id],
      )

      if (newStatus === 'completed') {
        await tx.run('UPDATE repayment_schedules SET status = ? WHERE loan_id = ?', ['paid', loan_id])
        await writeAudit({
          userId: req.user.sub,
          userName: req.user.name,
          action: 'LOAN_COMPLETED',
          description: `Loan ${loan.loan_id} completed.`,
          relatedRecord: `loan:${loan.loan_id}`,
        }, tx)
      }

      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'REPAYMENT_RECORDED',
        description: `Recorded repayment ${repaymentId} of ${pay} RWF`,
        relatedRecord: `loan:${loan.loan_id}`,
      }, tx)

      const updatedLoan = await tx.queryOne('SELECT * FROM loans WHERE id = ?', [loan_id])
      return { repayment_id: repaymentId, loan: updatedLoan }
    })

    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    handleError(res, e)
  }
})

export default router