import { Router } from 'express'
import bcrypt from '#adele-passwords'
import { queryAll, queryOne, run } from '#adele-db'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { revokeUserSessions } from '../session.js'
import { writeAudit, isValidRwPhone, rwPhoneFull } from '../utils.js'

const router = Router()

const ROLES = ['super_admin', 'loan_officer', 'finance_officer', 'manager']

function mapUser(row) {
  if (!row) return null
  return {
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    status: row.status,
    created_at: row.created_at,
  }
}

router.get('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM users ORDER BY id')
    res.json({ users: rows.map(mapUser) })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/roles', requireAuth, async (req, res) => {
  try {
    const rows = await queryAll('SELECT * FROM roles ORDER BY id')
    res.json({ roles: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const { full_name, email, phone, role, status = 'active', password } = req.body || {}

    if (!full_name || !email || !role || !password) {
      return res
        .status(400)
        .json({ error: 'Full name, email, role and password are required.' })
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Invalid role.' })
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    }
    if (phone && phone.trim() !== '' && !isValidRwPhone(phone)) {
      return res.status(400).json({ error: 'Phone number must be a valid 9-digit number.' })
    }
    const normalizedPhone = phone && phone.trim() !== '' ? rwPhoneFull(phone) : null
    const existing = await queryOne('SELECT * FROM users WHERE email = ?', [email])
    if (existing) return res.status(400).json({ error: 'A user with this email already exists.' })

    const password_hash = bcrypt.hashSync(String(password), 10)
    const info = await run(
      `INSERT INTO users (full_name, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [full_name, email, normalizedPhone, password_hash, role, status],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'USER_CREATED',
      description: `Created user ${full_name} with role ${role}`,
      relatedRecord: `user:${email}`,
    })

    const row = await queryOne('SELECT * FROM users WHERE id = ?', [info.lastInsertRowid])
    res.status(201).json({ user: mapUser(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'User not found.' })

    const { full_name, email, phone, role, status, password } = req.body || {}
    const updated = {
      full_name: full_name !== undefined ? full_name : existing.full_name,
      email: email !== undefined ? email : existing.email,
      phone: phone !== undefined ? phone : existing.phone,
      role: role !== undefined ? role : existing.role,
      status: status !== undefined ? status : existing.status,
    }

    if (!ROLES.includes(updated.role)) {
      return res.status(400).json({ error: 'Invalid role.' })
    }

    if (updated.email && updated.email !== existing.email) {
      const dup = await queryOne('SELECT * FROM users WHERE email = ? AND id != ?', [updated.email, req.params.id])
      if (dup) return res.status(400).json({ error: 'A user with this email already exists.' })
    }
    if (updated.phone && updated.phone.trim() !== '' && !isValidRwPhone(updated.phone)) {
      return res.status(400).json({ error: 'Phone number must be a valid 9-digit number.' })
    }
    const normalizedPhone =
      updated.phone && updated.phone.trim() !== '' ? rwPhoneFull(updated.phone) : null

    await run(
      'UPDATE users SET full_name = ?, email = ?, phone = ?, role = ?, status = ? WHERE id = ?',
      [updated.full_name, updated.email, normalizedPhone, updated.role, updated.status, req.params.id],
    )

    if (password) {
      if (String(password).length < 12) {
        return res
          .status(400)
          .json({ error: 'Password must be at least 12 characters.' })
      }
      const password_hash = bcrypt.hashSync(String(password), 12)
      await run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, req.params.id])

      // An administrator resetting a password must not leave whoever prompted
      // the reset still signed in. Every session on that account is closed, so
      // the holder has to authenticate with the new password.
      const closed = await revokeUserSessions(existing.id, {
        reason: 'Password reset by a Super Admin',
        revokedBy: req.user.id,
      })
      await writeAudit({
        userId: req.user.id,
        userName: req.user.name,
        action: 'PASSWORD_RESET',
        description: `Reset the password for ${existing.email}; ${closed} session(s) closed`,
        relatedRecord: `user:${existing.id}`,
      })
    }

    // Suspending or deactivating an account must also end it immediately, not at
    // the end of the session's lifetime.
    if (existing.status !== updated.status || existing.role !== updated.role) {
      await revokeUserSessions(existing.id, {
        reason:
          existing.status !== updated.status && updated.status !== 'active'
            ? 'Account status changed'
            : 'Role changed',
        revokedBy: req.user.id,
      })
    }

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'USER_UPDATED',
      description: `Updated user ${updated.full_name}`,
      relatedRecord: `user:${existing.email}`,
    })

    const row = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id])
    res.json({ user: mapUser(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.delete('/:id', requireAuth, requireRole('super_admin'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM users WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'User not found.' })
    if (existing.id === req.user.sub)
      return res.status(400).json({ error: 'You cannot delete your own account.' })

    await run('DELETE FROM users WHERE id = ?', [req.params.id])

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'USER_DELETED',
      description: `Deleted user ${existing.full_name}`,
      relatedRecord: `user:${existing.email}`,
    })

    res.json({ message: 'User deleted.' })
  } catch (e) {
    handleError(res, e)
  }
})

export default router