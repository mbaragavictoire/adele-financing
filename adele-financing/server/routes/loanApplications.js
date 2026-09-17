import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'

const router = Router()

const applicationWithJoins = `
  SELECT
    la.*,
    c.full_name AS customer_name,
    c.customer_id,
    c.phone_number AS customer_phone,
    lp.name AS product_name
  FROM loan_applications la
  JOIN customers c ON c.id = la.customer_id
  JOIN loan_products lp ON lp.id = la.loan_product_id
`

// All authenticated staff can view applications
router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = applicationWithJoins
    const params = {}
    const where = []
    const q = req.query

    if (q.status && q.status !== '') {
      where.push('la.status = @status')
      params.status = q.status
    }
    if (q.customer_id && q.customer_id !== '') {
      where.push('la.customer_id = @customer_id')
      params.customer_id = q.customer_id
    }
    if (q.search && q.search.trim() !== '') {
      where.push(
        '(la.application_id LIKE @search OR c.full_name LIKE @search OR lp.name LIKE @search)',
      )
      params.search = `%${q.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY la.created_at DESC LIMIT 500'

    const rows = await queryAll(sql, params)
    res.json({ applications: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id])
    if (!row) return res.status(404).json({ error: 'Application not found.' })
    res.json({ application: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const { customer_id, loan_product_id, requested_amount, duration, purpose } = req.body || {}

    if (!customer_id || !loan_product_id || !requested_amount || !duration) {
      return res
        .status(400)
        .json({ error: 'Customer, loan product, requested amount and duration are required.' })
    }

    const customer = await queryOne('SELECT * FROM customers WHERE id = ?', [customer_id])
    if (!customer) return res.status(400).json({ error: 'Customer not found.' })

    const product = await queryOne('SELECT * FROM loan_products WHERE id = ?', [loan_product_id])
    if (!product) return res.status(400).json({ error: 'Loan product not found.' })

    const amount = Number(requested_amount)
    if (!(amount > 0)) return res.status(400).json({ error: 'Invalid requested amount.' })

    const last = await queryOne('SELECT COUNT(*) AS c FROM loan_applications')
    const application_id = genId('APP', Number(last.c))
    const application_date = new Date().toISOString().slice(0, 10)

    const info = await run(
      `INSERT INTO loan_applications
        (application_id, customer_id, loan_product_id, requested_amount, duration, purpose,
         application_date, assigned_loan_officer_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        application_id,
        customer_id,
        loan_product_id,
        amount,
        duration,
        purpose || null,
        application_date,
        req.user.sub,
        'pending',
      ],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_CREATED',
      description: `Created loan application ${application_id} for ${customer.full_name}`,
      relatedRecord: `application:${application_id}`,
    })

    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [info.lastInsertRowid])
    res.status(201).json({ application: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id/review', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [req.params.id])
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    if (app.status !== 'pending')
      return res.status(400).json({ error: `Application is already ${app.status}.` })

    const { status } = req.body || {}
    if (!['under_review'].includes(status))
      return res.status(400).json({ error: 'Invalid status.' })

    await run('UPDATE loan_applications SET status = ? WHERE id = ?', [status, req.params.id])

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_REVIEWED',
      description: `Moved application ${app.application_id} to under review`,
      relatedRecord: `application:${app.application_id}`,
    })

    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id])
    res.json({ application: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id/reject', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [req.params.id])
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    if (app.status === 'approved' || app.status === 'rejected')
      return res.status(400).json({ error: `Application is already ${app.status}.` })

    const { reason } = req.body || {}
    if (!reason || !reason.trim())
      return res.status(400).json({ error: 'A rejection reason is required.' })

    await run(
      `UPDATE loan_applications
       SET status = 'rejected', rejection_reason = ?, rejected_by = ?, rejected_at = NOW()
       WHERE id = ?`,
      [reason.trim(), req.user.sub, req.params.id],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_REJECTED',
      description: `Rejected application ${app.application_id}: ${reason}`,
      relatedRecord: `application:${app.application_id}`,
    })

    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id])
    res.json({ application: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id/approve', requireAuth, requireRole('super_admin', 'manager'), async (req, res) => {
  try {
    const app = await queryOne('SELECT * FROM loan_applications WHERE id = ?', [req.params.id])
    if (!app) return res.status(404).json({ error: 'Application not found.' })
    if (app.status !== 'under_review')
      return res.status(400).json({ error: 'Only applications under review can be approved.' })

    const product = await queryOne('SELECT * FROM loan_products WHERE id = ?', [app.loan_product_id])

    const approved_amount = Number(req.body?.approved_amount || app.requested_amount)
    const approved_duration = Number(req.body?.approved_duration || app.duration)
    const interest_rate = Number(
      req.body?.interest_rate ?? product?.interest_rate ?? 0,
    )

    if (!(approved_amount > 0)) return res.status(400).json({ error: 'Invalid approved amount.' })

    await run(
      `UPDATE loan_applications
       SET status = 'approved', approved_amount = ?, approved_duration = ?, interest_rate = ?,
           approved_by = ?, approved_at = NOW()
       WHERE id = ?`,
      [approved_amount, approved_duration, interest_rate, req.user.sub, req.params.id],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'APPLICATION_APPROVED',
      description: `Approved application ${app.application_id} for ${approved_amount} RWF`,
      relatedRecord: `application:${app.application_id}`,
    })

    const row = await queryOne(`${applicationWithJoins} WHERE la.id = ?`, [req.params.id])
    res.json({ application: row })
  } catch (e) {
    handleError(res, e)
  }
})

export default router