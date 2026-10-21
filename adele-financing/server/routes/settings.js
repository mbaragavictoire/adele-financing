import { money } from '../money.js'
import { isPostgres } from '../databaseDriver.js'
const financialSettings = new Set(['opening_cash','equipment_value','owner_capital','liabilities_value'])
import { Router } from 'express'
import { queryAll, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit } from '../utils.js'

const router = Router()

router.get('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const rows = await queryAll('SELECT `key`, value FROM settings ORDER BY `key`')
    res.json({ settings: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const updates = req.body || {}
    for (const [key, value] of Object.entries(updates)) {
      await run(
        'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [key, String(isPostgres() && financialSettings.has(key) ? money(value) : value)],
      )
    }

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'SETTINGS_CHANGED',
      description: `Updated settings: ${Object.keys(updates).join(', ')}`,
    })

    const rows = await queryAll('SELECT `key`, value FROM settings ORDER BY `key`')
    res.json({ settings: rows })
  } catch (e) {
    handleError(res, e)
  }
})

export default router