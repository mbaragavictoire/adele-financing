import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'

const router = Router()

const loanWithJoins = `
  SELECT
    l.*,
    c.full_name AS customer_name,
    c.customer_id,
    c.phone_number AS customer_phone,
    lp.name AS product_name
  FROM loans l
  JOIN customers c ON c.id = l.customer_id
  LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
`

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
    if (!application_id)
      return res.status(400).json({ error: 'Application id is required.' })

    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [application_id])
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    if (app.status !== 'approved')
      return res.status(400).json({ error: 'Only approved applications can be disbursed.' })

    const existing = await queryOne('SELECT * FROM loans WHERE application_id = ?', [application_id])
    if (existing) return res.status(400).json({ error: 'This application already has a disbursed loan.' })

    let start_date = disbursement_date ? String(disbursement_date).trim() : ''
    if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      return res.status(400).json({ error: 'Invalid loan date. Use YYYY-MM-DD.' })
    }
    if (!start_date) start_date = new Date().toISOString().slice(0, 10)

    const principal = Number(approved_amount || app.approved_amount || app.requested_amount)
    const amount = app.interest_rate ? app.interest_rate / 100 : 0
    const interest = principal * amount
    const total_payable = principal + interest
    const duration = Number(app.approved_duration || app.duration)
    const due = new Date(`${start_date}T00:00:00`)
    due.setMonth(due.getMonth() + duration)
    const due_date = due.toISOString().slice(0, 10)

    const last = await queryOne('SELECT COUNT(*) AS c FROM loans')
    const loan_id = genId('LON', Number(last.c))

    const info = await run(
      `INSERT INTO loans
        (loan_id, application_id, customer_id, loan_product_id, principal, interest,
         total_payable, amount_paid, outstanding_balance, start_date, due_date, duration,
         status, disbursement_date, disbursed_amount, disbursed_by, payment_method, reference_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      [
        loan_id,
        application_id,
        app.customer_id,
        app.loan_product_id,
        principal,
        interest,
        total_payable,
        total_payable,
        start_date,
        due_date,
        duration,
        start_date,
        principal,
        req.user.sub,
        payment_method,
        reference_number || null,
      ],
    )

    // Generate repayment schedule (monthly)
    const monthly = total_payable / duration
    for (let i = 1; i <= duration; i++) {
      const d = new Date(`${start_date}T00:00:00`)
      d.setMonth(d.getMonth() + i)
      await run(
        'INSERT INTO repayment_schedules (loan_id, due_date, amount) VALUES (?, ?, ?)',
        [info.lastInsertRowid, d.toISOString().slice(0, 10), Math.round(monthly * 100) / 100],
      )
    }

    // Record disbursement payment
    const payLast = await queryOne('SELECT COUNT(*) AS c FROM payments')
    const payment_id = genId('PAY', Number(payLast.c))
    await run(
      `INSERT INTO payments
        (payment_id, loan_id, customer_id, type, amount, payment_date, payment_method, reference_number, recorded_by)
       VALUES (?, ?, ?, 'disbursement', ?, ?, ?, ?, ?)`,
      [
        payment_id,
        info.lastInsertRowid,
        app.customer_id,
        principal,
        start_date,
        payment_method,
        reference_number || null,
        req.user.sub,
      ],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'LOAN_DISBURSED',
      description: `Disbursed loan ${loan_id} for ${principal} RWF`,
      relatedRecord: `loan:${loan_id}`,
    })

    const row = await queryOne(`${loanWithJoins} WHERE l.id = ?`, [info.lastInsertRowid])
    res.status(201).json({ loan: row })
  } catch (e) {
    handleError(res, e)
  }
})

export default router