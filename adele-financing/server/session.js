/**
 * Server-side session store for the ADELE Loan Management System.
 *
 * Design decisions, and why they matter:
 *
 *  - The session lives in MySQL, never in the browser. The browser only ever
 *    receives an opaque, random identifier in an HttpOnly cookie, so client-side
 *    code cannot read it and cannot forge it. The backend is the sole authority
 *    for "is this person signed in, and what may they do".
 *
 *  - Only a SHA-256 hash of the identifier is stored. If the database is ever
 *    leaked, the hashes cannot be replayed as cookies, because the raw
 *    identifier never touches the database. This is why the session id may
 *    safely be handled server-side (including in the admin sessions API)
 *    without being a credential.
 *
 *  - A brand new identifier is minted on every successful login and no
 *    identifier is ever reused or accepted before it exists in the table. That
 *    is what prevents session fixation: an attacker who plants an identifier in
 *    a victim's browser gains nothing, because login always replaces it.
 *
 *  - Nothing sensitive is stored on the client. No token in localStorage, no
 *    user id in a URL, no role information the server does not re-derive.
 *
 * See SESSIONS.md for the full description of the lifecycle.
 */
import crypto from 'node:crypto'
import { queryOne, queryAll, run } from './db.js'

export const SESSION_COOKIE = 'adele_session'

/** Reads an integer env var, falling back when unset or nonsensical. */
function intEnv(name, fallback, min, max) {
  const raw = process.env[name]
  if (raw === undefined || String(raw).trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// Inactivity timeout: how long a session may sit unused before it dies.
export const IDLE_MINUTES = intEnv('SESSION_IDLE_MINUTES', 30, 1, 24 * 60)

// Absolute lifetime: the ceiling no amount of activity can extend past, so a
// session cannot be kept alive forever by a scripted client.
export const ABSOLUTE_HOURS = intEnv('SESSION_ABSOLUTE_HOURS', 8, 1, 24 * 7)

// Simultaneous sessions allowed per staff account.
export const MAX_SESSIONS_PER_USER = intEnv('SESSION_MAX_PER_USER', 3, 1, 25)

// Writing last_seen_at on every single API call would turn each request into a
// database write. The stored value is refreshed at most this often, which is
// far tighter than the idle timeout, so the idle clock stays accurate.
const TOUCH_INTERVAL_MS = 60 * 1000

const MAX_USER_AGENT = 255
const MAX_IP = 64

/**
 * The pool is configured with dateStrings, so DATETIME values arrive as
 * 'YYYY-MM-DD HH:MM:SS'. That is not ISO-8601 and Date#parse treats it
 * inconsistently, so it is converted explicitly to a local-time Date.
 */
export function toDate(value) {
  if (value instanceof Date) return value
  if (!value) return null
  const parsed = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function hashIdentifier(rawIdentifier) {
  return crypto.createHash('sha256').update(String(rawIdentifier)).digest('hex')
}

export function sessionPolicy() {
  return {
    idleMinutes: IDLE_MINUTES,
    absoluteHours: ABSOLUTE_HOURS,
    maxSessionsPerUser: MAX_SESSIONS_PER_USER,
  }
}

function requestIp(req) {
  return String(req?.ip || '').slice(0, MAX_IP)
}

function requestUserAgent(req) {
  return String(req?.headers?.['user-agent'] || '').slice(0, MAX_USER_AGENT)
}

/**
 * Cookie attributes.
 *
 * Secure defaults to on in production. Setting it off is only correct when the
 * browser genuinely talks plain HTTP to the API, which in practice means local
 * development. SESSION_COOKIE_SECURE exists so that choice is explicit rather
 * than inferred.
 *
 * SameSite is 'strict' because the LMS and the API are served from one origin.
 * A split deployment (frontend on a different host) cannot use 'strict': the
 * browser would refuse to attach the cookie to cross-site API calls, and the
 * fix is 'none' + secure + a real CSRF token, not simply loosening this.
 */
function cookieOptions() {
  const forced = String(process.env.SESSION_COOKIE_SECURE || '').trim().toLowerCase()
  const secure =
    forced === 'true'
      ? true
      : forced === 'false'
        ? false
        : process.env.NODE_ENV === 'production'

  const forcedSite = String(process.env.SESSION_COOKIE_SAMESITE || '').trim().toLowerCase()
  const sameSite = ['strict', 'lax', 'none'].includes(forcedSite) ? forcedSite : 'strict'

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    // Not a session cookie in the HTTP sense: the Max-Age is the absolute
    // lifetime, so a forgotten tab cannot outlive the server's own limit.
    maxAge: ABSOLUTE_HOURS * 60 * 60 * 1000,
  }
}

export function setSessionCookie(res, rawIdentifier) {
  res.cookie(SESSION_COOKIE, rawIdentifier, cookieOptions())
}

export function clearSessionCookie(res) {
  const opts = cookieOptions()
  // Clearing requires the same attributes that were used to set the cookie,
  // otherwise the browser keeps the original one.
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    path: opts.path,
  })
}

/** Minimal cookie reader. Only one header is needed and it is small. */
export function readSessionCookie(req) {
  const header = req?.headers?.cookie
  if (!header) return null
  for (const part of String(header).split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    if (part.slice(0, eq).trim() !== SESSION_COOKIE) continue
    const value = decodeURIComponent(part.slice(eq + 1).trim())
    return value || null
  }
  return null
}

export async function activeSessionCount(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS c FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL
       AND absolute_expires_at > NOW() AND idle_expires_at > NOW()`,
    [userId],
  )
  return Number(row?.c || 0)
}

/**
 * Mints a new session for a user who has just authenticated.
 *
 * If the account is already at its simultaneous-session limit, the oldest
 * sessions are closed rather than the login being refused: the limit stays a
 * real limit, and a legitimate member of staff is never locked out of their own
 * account by their own earlier sign-ins.
 */
export async function createSession({ userId, req }) {
  const rawIdentifier = crypto.randomBytes(32).toString('base64url')
  const id = hashIdentifier(rawIdentifier)

  const existing = await queryAll(
    `SELECT id FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL
       AND absolute_expires_at > NOW() AND idle_expires_at > NOW()
     ORDER BY last_seen_at ASC`,
    [userId],
  )

  const overflow = existing.length - (MAX_SESSIONS_PER_USER - 1)
  const evicted = []
  if (overflow > 0) {
    for (const row of existing.slice(0, overflow)) {
      await revokeSessionById(row.id, { reason: 'Exceeded simultaneous session limit' })
      evicted.push(row.id)
    }
  }

  const now = new Date()
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_HOURS * 3600 * 1000)
  const idleExpiresAt = new Date(now.getTime() + IDLE_MINUTES * 60 * 1000)

  await run(
    `INSERT INTO sessions
       (id, user_id, created_at, last_seen_at, absolute_expires_at, idle_expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      now,
      now,
      absoluteExpiresAt,
      idleExpiresAt,
      requestIp(req),
      requestUserAgent(req),
    ],
  )

  return {
    rawIdentifier,
    id,
    createdAt: now,
    absoluteExpiresAt,
    idleExpiresAt,
    evicted,
  }
}

/**
 * Looks a session up and reports precisely why it is unusable.
 * The reason drives both the HTTP response and the audit trail.
 */
export async function resolveSession(rawIdentifier) {
  if (!rawIdentifier) return { ok: false, reason: 'missing' }

  const row = await queryOne('SELECT * FROM sessions WHERE id = ?', [
    hashIdentifier(rawIdentifier),
  ])
  if (!row) return { ok: false, reason: 'missing' }

  const now = Date.now()
  if (row.revoked_at) return { ok: false, reason: 'revoked', row }

  const absolute = toDate(row.absolute_expires_at)
  const idle = toDate(row.idle_expires_at)

  if (absolute && now >= absolute.getTime()) {
    return { ok: false, reason: 'absolute_timeout', row }
  }
  if (idle && now >= idle.getTime()) {
    return { ok: false, reason: 'idle_timeout', row }
  }

  return { ok: true, row }
}

/**
 * Slides the idle deadline forward, never past the absolute deadline.
 * Throttled, so a burst of requests costs at most one write per interval.
 */
export async function touchSession(row) {
  const lastSeen = toDate(row?.last_seen_at)
  if (!lastSeen) return
  const now = new Date()
  if (now.getTime() - lastSeen.getTime() < TOUCH_INTERVAL_MS) return

  const idleExpiresAt = new Date(now.getTime() + IDLE_MINUTES * 60 * 1000)
  await run(
    `UPDATE sessions
     SET last_seen_at = ?, idle_expires_at = LEAST(?, absolute_expires_at)
     WHERE id = ? AND revoked_at IS NULL`,
    [now, idleExpiresAt, row.id],
  )
}

export async function revokeSessionById(id, { reason = 'Revoked', revokedBy = null } = {}) {
  // run() reports the row count as `changes`, not `affectedRows`.
  const result = await run(
    `UPDATE sessions SET revoked_at = NOW(), revoked_by = ?, revoke_reason = ?
     WHERE id = ? AND revoked_at IS NULL`,
    [revokedBy, String(reason).slice(0, 255), id],
  )
  return Number(result?.changes || 0) > 0
}

export async function revokeSession(rawIdentifier, { reason, revokedBy } = {}) {
  if (!rawIdentifier) return false
  return revokeSessionById(hashIdentifier(rawIdentifier), { reason, revokedBy })
}

/**
 * Closes every live session for an account. `exceptId` keeps the caller's own
 * session alive, which is what "sign out my other devices" needs.
 */
export async function revokeUserSessions(userId, { reason, revokedBy, exceptId } = {}) {
  const params = [revokedBy ?? null, String(reason || 'Revoked').slice(0, 255), userId]
  let exclude = ''
  if (exceptId) {
    exclude = ' AND id <> ?'
    params.push(exceptId)
  }
  const result = await run(
    `UPDATE sessions SET revoked_at = NOW(), revoked_by = ?, revoke_reason = ?
     WHERE user_id = ? AND revoked_at IS NULL${exclude}`,
    params,
  )
  return Number(result?.changes || 0)
}

/**
 * Admin view of live sessions. Joins the user so a Super Admin can see who is
 * signed in, from where, and when they were last active.
 */
export async function listActiveSessions() {
  const rows = await queryAll(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.absolute_expires_at,
            s.idle_expires_at, s.ip, s.user_agent,
            u.full_name, u.email, u.role, u.status
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NULL
       AND s.absolute_expires_at > NOW()
       AND s.idle_expires_at > NOW()
     ORDER BY s.last_seen_at DESC`,
    [],
  )
  return rows
}

/** Recently closed sessions, so the admin can see what has been signed out. */
export async function listRecentClosedSessions(limit = 25) {
  return queryAll(
    `SELECT s.id, s.user_id, s.created_at, s.last_seen_at, s.revoked_at,
            s.revoke_reason, s.ip,
            u.full_name, u.email, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.revoked_at IS NOT NULL
     ORDER BY s.revoked_at DESC
     LIMIT ?`,
    [Math.min(Math.max(Number(limit) || 25, 1), 200)],
  )
}

export async function findSessionById(id) {
  return queryOne(
    `SELECT s.*, u.full_name, u.email, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [id],
  )
}

/**
 * Housekeeping. Expired sessions are closed so the admin list stays truthful,
 * and long-dead rows are eventually deleted so the table does not grow without
 * bound. Closed rows are kept for a short window to remain auditable.
 */
export async function pruneSessions(retainClosedDays = 7) {
  await run(
    `UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()),
                        revoke_reason = COALESCE(revoke_reason, 'Expired')
     WHERE revoked_at IS NULL AND (absolute_expires_at <= NOW() OR idle_expires_at <= NOW())`,
    [],
  )

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - retainClosedDays)
  await run(
    `DELETE FROM sessions
     WHERE revoked_at IS NOT NULL AND revoked_at < ?
        AND absolute_expires_at < ?`,
    [cutoff, cutoff],
  )
}