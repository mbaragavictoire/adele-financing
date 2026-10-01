import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { queryOne, run } from '../db.js'
import { signToken, requireAuth } from '../auth.js'
import { writeAudit } from '../utils.js'
import {
  loginRateLimit,
  recordLoginAttempt,
  clearLoginFailures,
  clientIp,
} from '../rateLimit.js'

const router = Router()

// One generic message for every failure mode so the endpoint cannot be used to
// discover which emails are registered or whether an account is suspended.
const GENERIC_AUTH_ERROR = 'Invalid email or password.'

function publicUser(row) {
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

async function findUserByIdentifier(identifier) {
  return queryOne('SELECT * FROM users WHERE email = ? OR phone = ?', [identifier, identifier])
}

// Both a wrong password and an unknown account cost the same bcrypt work, so
// response timing does not reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('adele-timing-equaliser', 12)

router.post('/login', loginRateLimit({ windowMinutes: 15, maxAttempts: 5 }), async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const identifier = String(email).trim()
    const ip = clientIp(req)
    const user = await findUserByIdentifier(identifier)

    const valid = user
      ? await bcrypt.compare(String(password), user.password_hash)
      : await bcrypt.compare(String(password), DUMMY_HASH)

    if (!user || !valid || user.status !== 'active') {
      await recordLoginAttempt(identifier, ip, false)
      await writeAudit({
        userId: user?.id ?? null,
        userName: user?.full_name ?? null,
        action: 'LOGIN_FAILED',
        description: `Failed login attempt for ${identifier}`,
      })
      return res.status(401).json({ error: GENERIC_AUTH_ERROR })
    }

    await recordLoginAttempt(identifier, ip, true)
    await clearLoginFailures(identifier, ip)

    const token = signToken(user)
    await writeAudit({
      userId: user.id,
      userName: user.full_name,
      action: 'LOGIN',
      description: 'User logged in',
      relatedRecord: `user:${user.id}`,
    })

    res.json({ token, user: publicUser(user) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.sub])
    if (!row) return res.status(401).json({ error: 'Account not found.' })
    res.json({ user: publicUser(row) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

router.post('/logout', requireAuth, async (req, res) => {
  try {
    // Revoke this specific token so a copied JWT stops working immediately,
    // instead of remaining valid until its natural expiry.
    if (req.user.jti) {
      await run(
        'INSERT IGNORE INTO revoked_tokens (id, user_id, expires_at) VALUES (?, ?, ?)',
        [req.user.jti, req.user.sub, new Date(Date.now() + 9 * 60 * 60 * 1000)],
      )
    }
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'LOGOUT',
      description: 'User logged out',
    })
    res.json({ message: 'Logged out.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

// Signed-out sessions must not be usable again, so the frontend is told to drop
// its stored copy of the token.
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const current_password = String(req.body?.current_password || '')
    const new_password = String(req.body?.new_password || '')

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required.' })
    }
    if (new_password.length < 12) {
      return res.status(400).json({ error: 'New password must be at least 12 characters.' })
    }

    const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.sub])
    const valid = await bcrypt.compare(current_password, row?.password_hash || DUMMY_HASH)
    if (!row || !valid) {
      await writeAudit({
        userId: req.user.sub,
        userName: req.user.name,
        action: 'PASSWORD_CHANGE_FAILED',
        description: 'Change-password rejected: current password did not match',
      })
      return res.status(400).json({ error: 'Current password is incorrect.' })
    }

    await run('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(new_password, 12),
      req.user.sub,
    ])

    // Changing a password ends every other session for that account.
    await run(
      `INSERT IGNORE INTO revoked_tokens (id, user_id, expires_at)
       SELECT UUID(), id, DATE_ADD(NOW(), INTERVAL 9 HOUR) FROM users WHERE id = ?`,
      [req.user.sub],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'PASSWORD_CHANGED',
      description: 'User changed their own password',
      relatedRecord: `user:${req.user.sub}`,
    })

    res.json({ message: 'Password updated. Please sign in again.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

export default router