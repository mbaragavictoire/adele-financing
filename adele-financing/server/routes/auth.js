import { Router } from 'express'
import bcrypt from '#adele-passwords'
import { queryOne, run } from '#adele-db'
import { requireAuth } from '../auth.js'
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  readSessionCookie,
  revokeSession,
  revokeUserSessions,
  sessionPolicy,
} from '../session.js'
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
// Public timing equaliser only, never a stored user credential. Fixed salt avoids startup RNG in Workers.
const DUMMY_HASH = bcrypt.hashSync('adele-timing-equaliser', '$2b$12$......................')

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

    // A fresh identifier is minted for every successful sign-in and sent only
    // as an HttpOnly cookie. Nothing about the user, the role or the password
    // travels to the browser, so there is nothing in the client to tamper with.
    const session = await createSession({ userId: user.id, req })
    setSessionCookie(res, session.rawIdentifier)

    await writeAudit({
      userId: user.id,
      userName: user.full_name,
      action: 'LOGIN',
      description: `User logged in${session.evicted.length ? ` (closed ${session.evicted.length} older session(s) to stay within the simultaneous session limit)` : ''}`,
      relatedRecord: `user:${user.id}`,
    })

    // Note the absence of a token in this payload: the browser's only credential
    // is the cookie the server just set.
    res.json({
      user: publicUser(user),
      session: {
        idleMinutes: sessionPolicy().idleMinutes,
        absoluteHours: sessionPolicy().absoluteHours,
        maxSessionsPerUser: sessionPolicy().maxSessionsPerUser,
      },
    })
  } catch (e) {
    console.error('Authentication request failed', { code: e?.code || 'AUTH_ERROR' })
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

router.get('/me', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM users WHERE id = ?', [req.user.id])
    if (!row) return res.status(401).json({ error: 'Account not found.' })
    // The session's own limits are returned so the UI can tell the user when
    // they will be asked to sign in again.
    res.json({
      user: publicUser(row),
      session: {
        startedAt: req.session.createdAt,
        lastSeenAt: req.session.lastSeenAt,
        idleExpiresAt: req.session.idleExpiresAt,
        absoluteExpiresAt: req.session.absoluteExpiresAt,
        policy: sessionPolicy(),
      },
    })
  } catch (e) {
    console.error('Authentication request failed', { code: e?.code || 'AUTH_ERROR' })
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

/**
 * Ends the current session. The row is closed server-side, so the cookie that
 * was captured beforehand is dead too, and the cookie itself is cleared.
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const rawIdentifier = readSessionCookie(req)
    await revokeSession(rawIdentifier, { reason: 'Signed out by the user' })

    await writeAudit({
      userId: req.user.id,
      userName: req.user.name,
      action: 'LOGOUT',
      description: 'User logged out',
      relatedRecord: `session:${String(req.session.id).slice(0, 12)}`,
    })

    clearSessionCookie(res)
    res.json({ message: 'Logged out.' })
  } catch (e) {
    console.error('Authentication request failed', { code: e?.code || 'AUTH_ERROR' })
    // The cookie is cleared regardless, so the browser stops presenting it.
    clearSessionCookie(res)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

/**
 * Changing a password ends every session on the account, including this one.
 * That is the safe reading of "require fresh authentication": keeping the
 * current session alive would leave a stolen session usable after the owner
 * reacted to the compromise by changing their password.
 */
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

    const row = await queryOne('SELECT password_hash FROM users WHERE id = ?', [req.user.id])
    const valid = await bcrypt.compare(current_password, row?.password_hash || DUMMY_HASH)
    if (!row || !valid) {
      await writeAudit({
        userId: req.user.id,
        userName: req.user.name,
        action: 'PASSWORD_CHANGE_FAILED',
        description: 'Change-password rejected: current password did not match',
      })
      return res.status(400).json({ error: 'Current password is incorrect.' })
    }

    await run('UPDATE users SET password_hash = ? WHERE id = ?', [
      bcrypt.hashSync(new_password, 12),
      req.user.id,
    ])

    const closedSessions = await revokeUserSessions(req.user.id, {
      reason: 'Password changed',
    })

    await writeAudit({
      userId: req.user.id,
      userName: req.user.name,
      action: 'PASSWORD_CHANGED',
      description: `User changed their own password; ${closedSessions} session(s) closed`,
      relatedRecord: `user:${req.user.id}`,
    })

    clearSessionCookie(res)
    res.json({
      message: 'Password updated. Please sign in again.',
      sessionsClosed: closedSessions,
    })
  } catch (e) {
    console.error('Authentication request failed', { code: e?.code || 'AUTH_ERROR' })
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

export default router