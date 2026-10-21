import { Router } from 'express'
import { queryAll } from '#adele-db'
import { requireAuth, requireRole, handleError } from '../auth.js'

const router = Router()

router.get('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    let sql = 'SELECT * FROM audit_logs'
    const params = {}
    const where = []
    const q = req.query

    if (q.action && q.action !== '') {
      where.push('action = @action')
      params.action = q.action
    }
    if (q.search && q.search.trim() !== '') {
      where.push('(user_name LIKE @search OR description LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`
    sql += ' ORDER BY created_at DESC LIMIT 1000'

    const rows = await queryAll(sql, params)
    res.json({ logs: rows })
  } catch (e) {
    handleError(res, e)
  }
})

export default router