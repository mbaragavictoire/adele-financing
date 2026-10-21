import { isPostgres } from './databaseDriver.js'
import { queryOne } from './db.js'
import { writeAudit } from './utils.js'
import {
  resolveSession,
  revokeSessionById,
  touchSession,
  readSessionCookie,
  clearSessionCookie,
} from './session.js'

// The session primitives are re-exported for convenience, but routes should
// import them from ./session.js directly. Keep this list in step with that.
export { createSession, setSessionCookie, clearSessionCookie, sessionPolicy } from './session.js'

/**
 * Rejection message per failure mode. Each one is deliberately explicit for the
 * legitimate user (so an expired session is distinguishable from a revoked one)
 * while revealing nothing about other accounts.
 */
const REJECTED = {
  missing: 'Authentication required.',
  unknown: 'Invalid or expired session.',
  revoked: 'This session has been signed out.',
  idle_timeout: 'Your session timed out after a period of inactivity. Please sign in again.',
  absolute_timeout: 'Your session reached its maximum length. Please sign in again.',
  inactive_account: 'Your account is not active.',
  no_account: 'Account not found.',
}

/**
 * Marks an expired session as closed and records why. Doing this once, at the
 * moment it is first noticed, keeps the admin session list truthful and means
 * the audit log gets exactly one SESSION_EXPIRED entry per expiry rather than
 * one per rejected request.
 */
async function closeExpiredSession(row, reason, req) {
  await revokeSessionById(row.id, { reason: 'Expired' }).catch(() => {})
  await writeAudit({
    userId: row.user_id,
    userName: req?.user?.name || null,
    action: 'SESSION_EXPIRED',
    description:
      reason === 'idle_timeout'
        ? 'Session closed after the inactivity timeout'
        : 'Session closed after reaching its maximum lifetime',
    relatedRecord: `session:${row.id.slice(0, 12)}`,
  }).catch(() => {})
}

/**
 * Validates the session on every protected request.
 *
 * A request is authorised only when all of the following hold, checked here on
 * the server rather than trusted from the client:
 *   1. a session cookie is present;
 *   2. it maps to a real, unrevoked session row;
 *   3. it is inside both the idle and the absolute limits;
 *   4. the account still exists and is still active;
 *   5. the role is re-read from the database on this request.
 *
 * Because the role is read fresh every time, a demotion or a suspension takes
 * effect immediately instead of waiting for a token to expire. There is no
 * signed token to replay and nothing for the browser to tamper with.
 */
export async function requireAuth(req, res, next) {
  const rawIdentifier = readSessionCookie(req)
  const { ok, reason, row } = await resolveSession(rawIdentifier)

  if (!ok) {
    // Expired sessions are closed for the record; a revoked or unknown one is
    // already in its final state.
    if ((reason === 'idle_timeout' || reason === 'absolute_timeout') && row) {
      await closeExpiredSession(row, reason, req)
    }
    clearSessionCookie(res)
    return res.status(401).json({ error: REJECTED[reason] || REJECTED.unknown })
  }

  try {
    const user = await queryOne(
      'SELECT id, full_name, email, role, status FROM users WHERE id = ?',
      [row.user_id],
    )
    if (!user) {
      await revokeSessionById(row.id, { reason: 'Account no longer exists' })
      clearSessionCookie(res)
      return res.status(401).json({ error: REJECTED.no_account })
    }
    if (user.status !== 'active') {
      await revokeSessionById(row.id, { reason: 'Account is not active' })
      clearSessionCookie(res)
      return res.status(403).json({ error: REJECTED.inactive_account })
    }

    // `sub` and `name` are kept as aliases of `id` and `full_name` because the
    // route handlers that record audit entries read them.
    req.user = {
      id: user.id,
      sub: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      status: user.status,
    }
    req.session = {
      id: row.id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      absoluteExpiresAt: row.absolute_expires_at,
      idleExpiresAt: row.idle_expires_at,
    }

    // Deliberately not awaited: a failed heartbeat must never turn a valid
    // request into an error. The session is already valid at this point.
    touchSession(row).catch((e) => console.error('session touch failed:', e.message))

    next()
  } catch (error) {
    next(error)
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission for this action.' })
    }
    next()
  }
}

const GENERIC_ACTION = {
  allowed: true,
  message: 'Access allowed.',
}

export function validateFields(fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => {
      const v = req.body ? req.body[f] : undefined
      return v === undefined || v === null || String(v).trim() === ''
    })
    if (missing.length > 0) {
      return res.status(400).json({
        error: `Missing required fields: ${missing.join(', ')}`,
      })
    }
    next()
  }
}

export function notFound(res, message = 'Not found.') {
  res.status(404).json({ error: message })
}

export function handleError(res, error, log = true) {
  if (isPostgres()) {
    if (log) console.error('PostgreSQL request failed', { code: error.code || 'APPLICATION_ERROR' })
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'An unexpected error occurred.' })
  }
  if (log) console.error(error)
  res.status(500).json({ error: 'An unexpected error occurred.' })
}

export { GENERIC_ACTION }