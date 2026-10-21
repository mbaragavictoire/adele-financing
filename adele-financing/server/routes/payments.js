import { Router } from 'express'
import { queryAll } from '#adele-db'
import { requireAuth, requireRole, handleError } from '../auth.js'

const router = Router()

// Same rationale as /api/repayments: the transaction ledger is finance data.
router.get('/', requireAuth, requireRole('super_admin', 'finance_officer', 'manager'), async (req, res) => {
  try {
    let sql = `
      SELECT p.*, c.full_name AS customer_name, l.loan_id
      FROM payments p
      JOIN customers c ON c.id = p.customer_id
      LEFT JOIN loans l ON l.id = p.loan_id
    `
    const params = {}
    const where = []
    const q = req.query

    if (q.type && q.type !== '') {
      where.push('p.type = @type')
      params.type = q.type
    }
    if (q.from && q.to) {
      where.push('p.payment_date BETWEEN @from AND @to')
      params.from = q.from
      params.to = q.to
    }
    if (q.search && q.search.trim() !== '') {
      where.push('(p.payment_id LIKE @search OR c.full_name LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY p.payment_date DESC LIMIT 500'

    const rows = await queryAll(sql, params)
    res.json({ payments: rows })
  } catch (e) {
    handleError(res, e)
  }
})

export default router