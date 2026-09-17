import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'

const router = Router()

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

    if (!loan_id || !amount || !payment_date) {
      return res.status(400).json({ error: 'Loan, amount and payment date are required.' })
    }

    const loan = await queryOne('SELECT * FROM loans WHERE id = ?', [loan_id])
    if (!loan) return res.status(404).json({ error: 'Loan not found.' })
    if (loan.status === 'completed')
      return res.status(400).json({ error: 'This loan is already completed.' })

    const pay = Number(amount)
    if (!(pay > 0)) return res.status(400).json({ error: 'Invalid repayment amount.' })
    if (pay > loan.outstanding_balance)
      return res
        .status(400)
        .json({ error: `Amount exceeds outstanding balance of ${loan.outstanding_balance}.` })

    const last = await queryOne('SELECT COUNT(*) AS c FROM repayments')
    const repayment_id = genId('RPT', Number(last.c))

    await run(
      `INSERT INTO repayments
        (repayment_id, loan_id, customer_id, amount, payment_date, payment_method, reference_number, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        repayment_id,
        loan_id,
        loan.customer_id,
        pay,
        payment_date,
        payment_method,
        reference_number || null,
        req.user.sub,
      ],
    )

    // Also record in payments table
    const payLast = await queryOne('SELECT COUNT(*) AS c FROM payments')
    const payment_id = genId('PAY', Number(payLast.c))
    await run(
      `INSERT INTO payments
        (payment_id, loan_id, customer_id, type, amount, payment_date, payment_method, reference_number, recorded_by)
       VALUES (?, ?, ?, 'repayment', ?, ?, ?, ?, ?)`,
      [
        payment_id,
        loan_id,
        loan.customer_id,
        pay,
        payment_date,
        payment_method,
        reference_number || null,
        req.user.sub,
      ],
    )

    // Update loan balances
    const newPaid = loan.amount_paid + pay
    const newBalance = loan.outstanding_balance - pay
    const newStatus = newBalance <= 0 ? 'completed' : loan.status

    await run(
      `UPDATE loans SET amount_paid = ?, outstanding_balance = ?, status = ? WHERE id = ?`,
      [newPaid, Math.max(newBalance, 0), newStatus, loan_id],
    )

    // Update repayment schedule if any matching due date
    if (newStatus === 'completed') {
      await run('UPDATE repayment_schedules SET status = ? WHERE loan_id = ?', ['paid', loan_id])
      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'LOAN_COMPLETED',
        description: `Loan ${loan.loan_id} completed.`,
        relatedRecord: `loan:${loan.loan_id}`,
      })
    }

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'REPAYMENT_RECORDED',
      description: `Recorded repayment ${repayment_id} of ${pay} RWF`,
      relatedRecord: `loan:${loan.loan_id}`,
    })

    const updatedLoan = await queryOne('SELECT * FROM loans WHERE id = ?', [loan_id])
    res.status(201).json({ repayment_id, loan: updatedLoan })
  } catch (e) {
    handleError(res, e)
  }
})

export default router