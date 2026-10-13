import { Router } from 'express'
import { queryAll, queryOne, withTransaction } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'

const router = Router()

const loanWithJoins = `
  SELECT
    l.*,
    c.full_name AS customer_name,
    c.customer_id AS customer_reference,
    c.phone_number AS customer_phone,
    lp.name AS product_name
  FROM loans l
  JOIN customers c ON c.id = l.customer_id
  LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
`

function httpError(statusCode, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  return error
}

router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = loanWithJoins
    const params = {}
    const where = []
    const q = req.query

    if (q.status && q.status !== '') {
      where.push('l.status = @status')
      params.status = q.status
    }
    if (q.customer_id && q.customer_id !== '') {
      where.push('l.customer_id = @customer_id')
      params.customer_id = q.customer_id
    }
    if (q.search && q.search.trim() !== '') {
      where.push('(l.loan_id LIKE @search OR c.full_name LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY l.created_at DESC LIMIT 500'

    const rows = await queryAll(sql, params)
    res.json({ loans: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne(`${loanWithJoins} WHERE l.id = ?`, [req.params.id])
    if (!row) return res.status(404).json({ error: 'Loan not found.' })

    const repayments = await queryAll(
      'SELECT * FROM repayments WHERE loan_id = ? ORDER BY payment_date DESC',
      [req.params.id],
    )
    const schedule = await queryAll(
      'SELECT * FROM repayment_schedules WHERE loan_id = ? ORDER BY due_date',
      [req.params.id],
    )

    res.json({ loan: row, repayments, schedule })
  } catch (e) {
    handleError(res, e)
  }
})

// Disburse an approved loan
router.post('/disburse', requireAuth, requireRole('super_admin', 'finance_officer', 'manager'), async (req, res) => {
  try {
    const { application_id, payment_method = 'Bank Transfer', reference_number, approved_amount, disbursement_date } = req.body || {}
    if (!application_id) throw httpError(400, 'Application id is required.')

    const result = await withTransaction(async (tx) => {
      const app = await tx.queryOne(
        `SELECT * FROM loan_applications
         WHERE id = ? OR application_id = ?
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [application_id, application_id],
      )
      if (!app) throw httpError(404, 'Application not found.')
      if (app.status !== 'approved') {
        throw httpError(400, 'Only approved applications can be disbursed.')
      }
      if (!app.customer_id) {
        throw httpError(409, 'This approved application is not linked to a customer.')
      }

      const existing = await tx.queryOne(
        'SELECT id FROM loans WHERE application_id = ? LIMIT 1 FOR UPDATE',
        [app.id],
      )
      if (existing) throw httpError(409, 'This application already has a disbursed loan.')

      const product = await tx.queryOne(
        'SELECT * FROM loan_products WHERE id = ?',
        [app.loan_product_id],
      )
      const approvedPrincipal = Number(app.approved_amount ?? app.requested_amount)
      const requestedPrincipal =
        approved_amount === undefined || approved_amount === null || approved_amount === ''
          ? approvedPrincipal
          : Number(approved_amount)
      if (!Number.isFinite(approvedPrincipal) || approvedPrincipal <= 0) {
        throw httpError(400, 'The approved application has an invalid amount.')
      }
      if (!Number.isFinite(requestedPrincipal) || requestedPrincipal <= 0) {
        throw httpError(400, 'Invalid disbursement amount.')
      }
      if (Math.abs(requestedPrincipal - approvedPrincipal) > 0.01) {
        throw httpError(400, 'Disbursement amount must match the approved application amount.')
      }

      const duration = Number(app.approved_duration ?? app.duration)
      if (!Number.isInteger(duration) || duration < 1) {
        throw httpError(400, 'The approved application has an invalid duration.')
      }
      const interestRate = Number(app.interest_rate ?? product?.interest_rate ?? 0)
      if (!Number.isFinite(interestRate) || interestRate < 0) {
        throw httpError(400, 'The approved application has an invalid interest rate.')
      }

      let startDate = disbursement_date ? String(disbursement_date).trim() : ''
      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        throw httpError(400, 'Invalid loan date. Use YYYY-MM-DD.')
      }
      if (!startDate) startDate = new Date().toISOString().slice(0, 10)

      const principal = approvedPrincipal
      // Whole-franc accounting: RWF has no cents, and a fractional principal +
      // interest total (e.g. 373332.96) can never be settled by a whole-franc
      // final payment — the closing balance would get stuck below 1 RWF.
      const interest = Math.round(principal * (interestRate / 100))
      const totalPayable = principal + interest
      const due = new Date(`${startDate}T00:00:00`)
      due.setMonth(due.getMonth() + duration)
      const dueDate = due.toISOString().slice(0, 10)

      const maxLoan = await tx.queryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(loan_id, 5) AS UNSIGNED)), 0) AS n
         FROM loans`,
      )
      const loanId = genId('LON', Number(maxLoan.n))
      const info = await tx.run(
        `INSERT INTO loans
          (loan_id, application_id, customer_id, loan_product_id, principal, interest,
           total_payable, amount_paid, outstanding_balance, start_date, due_date, duration,
           status, disbursement_date, disbursed_amount, disbursed_by, payment_method, reference_number)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        [
          loanId,
          app.id,
          app.customer_id,
          app.loan_product_id,
          principal,
          interest,
          totalPayable,
          totalPayable,
          startDate,
          dueDate,
          duration,
          startDate,
          principal,
          req.user.sub,
          payment_method,
          reference_number || null,
        ],
      )

      const monthly = totalPayable / duration
      for (let i = 1; i <= duration; i++) {
        const dueDateForInstallment = new Date(`${startDate}T00:00:00`)
        dueDateForInstallment.setMonth(dueDateForInstallment.getMonth() + i)
        await tx.run(
          'INSERT INTO repayment_schedules (loan_id, due_date, amount) VALUES (?, ?, ?)',
          [
            info.lastInsertRowid,
            dueDateForInstallment.toISOString().slice(0, 10),
            Math.round(monthly * 100) / 100,
          ],
        )
      }

      const maxPayment = await tx.queryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(payment_id, 5) AS UNSIGNED)), 0) AS n
         FROM payments`,
      )
      const paymentId = genId('PAY', Number(maxPayment.n))
      await tx.run(
        `INSERT INTO payments
          (payment_id, loan_id, customer_id, type, amount, payment_date, payment_method, reference_number, recorded_by)
         VALUES (?, ?, ?, 'disbursement', ?, ?, ?, ?, ?)`,
        [
          paymentId,
          info.lastInsertRowid,
          app.customer_id,
          principal,
          startDate,
          payment_method,
          reference_number || null,
          req.user.sub,
        ],
      )

      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'LOAN_DISBURSED',
        description: `Disbursed loan ${loanId} for ${principal} RWF`,
        relatedRecord: `loan:${loanId}`,
      }, tx)

      const row = await tx.queryOne(`${loanWithJoins} WHERE l.id = ?`, [info.lastInsertRowid])
      return { loan: row }
    })

    res.status(201).json(result)
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ error: e.message })
    handleError(res, e)
  }
})

export default router