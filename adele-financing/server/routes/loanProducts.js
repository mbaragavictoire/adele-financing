import { money } from '../money.js'
import { isPostgres } from '../databaseDriver.js'
const financialValue = value => isPostgres() ? money(value) : value
import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit } from '../utils.js'

const router = Router()

function mapProduct(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    min_amount: row.min_amount,
    max_amount: row.max_amount,
    interest_rate: row.interest_rate,
    max_duration: row.max_duration,
    repayment_frequency: row.repayment_frequency,
    status: row.status,
    created_at: row.created_at,
  }
}

router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = 'SELECT * FROM loan_products'
    const params = {}
    const where = []
    if (req.query.status && req.query.status !== '') {
      where.push('status = @status')
      params.status = req.query.status
    }
    if (req.query.search && req.query.search.trim() !== '') {
      where.push('name LIKE @search')
      params.search = `%${req.query.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY id DESC'

    const rows = await queryAll(sql, params)
    res.json({ loanProducts: rows.map(mapProduct) })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM loan_products WHERE id = ?', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Loan product not found.' })
    res.json({ loanProduct: mapProduct(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const {
      name,
      description,
      min_amount = 0,
      max_amount = 0,
      interest_rate = 0,
      max_duration = 6,
      repayment_frequency = 'Monthly',
      status = 'active',
    } = req.body || {}

    if (!name) return res.status(400).json({ error: 'Loan product name is required.' })

    const info = await run(
      `INSERT INTO loan_products
        (name, description, min_amount, max_amount, interest_rate, max_duration, repayment_frequency, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || null, financialValue(min_amount), financialValue(max_amount), financialValue(interest_rate), max_duration, repayment_frequency, status],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'LOAN_PRODUCT_CREATED',
      description: `Created loan product ${name}`,
      relatedRecord: `loan_product:${name}`,
    })

    const row = await queryOne('SELECT * FROM loan_products WHERE id = ?', [info.lastInsertRowid])
    res.status(201).json({ loanProduct: mapProduct(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM loan_products WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Loan product not found.' })

    const {
      name,
      description,
      min_amount,
      max_amount,
      interest_rate,
      max_duration,
      repayment_frequency,
      status,
    } = req.body || {}

    const updated = {
      name: name !== undefined ? name : existing.name,
      description: description !== undefined ? description : existing.description,
      min_amount: min_amount !== undefined ? min_amount : existing.min_amount,
      max_amount: max_amount !== undefined ? max_amount : existing.max_amount,
      interest_rate: interest_rate !== undefined ? interest_rate : existing.interest_rate,
      max_duration: max_duration !== undefined ? max_duration : existing.max_duration,
      repayment_frequency:
        repayment_frequency !== undefined ? repayment_frequency : existing.repayment_frequency,
      status: status !== undefined ? status : existing.status,
    }

    if (!updated.name) return res.status(400).json({ error: 'Loan product name is required.' })

    await run(
      `UPDATE loan_products SET
        name = ?, description = ?, min_amount = ?, max_amount = ?, interest_rate = ?,
        max_duration = ?, repayment_frequency = ?, status = ?
       WHERE id = ?`,
      [
        updated.name,
        updated.description,
        financialValue(updated.min_amount),
        financialValue(updated.max_amount),
        financialValue(updated.interest_rate),
        updated.max_duration,
        updated.repayment_frequency,
        updated.status,
        req.params.id,
      ],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'LOAN_PRODUCT_UPDATED',
      description: `Updated loan product ${updated.name}`,
      relatedRecord: `loan_product:${updated.name}`,
    })

    const row = await queryOne('SELECT * FROM loan_products WHERE id = ?', [req.params.id])
    res.json({ loanProduct: mapProduct(row) })
  } catch (e) {
    handleError(res, e)
  }
})

export default router