import { clientIp } from './clientIp.js'
export { clientIp }
import { isPostgres } from './databaseDriver.js'
import { queryAll, queryOne, run } from '#adele-db'

// Brute-force protection for credential endpoints.
//
// The store is MySQL rather than process memory so that limits survive a
// restart and cannot be bypassed by cycling the app through PM2. Counters are
// keyed on the submitted identifier AND the source IP, which stops both
// repeated guessing against one account and a spray across many accounts from
// a single host.

const DEFAULT_WINDOW_MINUTES = 15
const DEFAULT_MAX_ATTEMPTS = 5

function windowStart(minutes) {
  const d = new Date()
  d.setMinutes(d.getMinutes() - minutes)
  return d
}


export async function recordLoginAttempt(identifier, ip, successful) {
  await run(
    'INSERT INTO login_attempts (identifier, ip, successful) VALUES (?, ?, ?)',
    [String(identifier || '').slice(0, 255), String(ip || '').slice(0, 64), isPostgres() ? Boolean(successful) : (successful ? 1 : 0)],
  )
}

async function countFailures(identifier, ip, minutes) {
  const since = windowStart(minutes)
  const rows = await queryAll(
    `SELECT COUNT(*) AS c FROM login_attempts
      WHERE successful = 0
        AND created_at > ?
        AND (identifier = ? OR ip = ?)`,
    [since, String(identifier || '').slice(0, 255), String(ip || '').slice(0, 64)],
  )
  return Number(rows[0]?.c || 0)
}

export async function loginThrottleStatus(identifier, ip, options = {}) {
  const minutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const max = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const failures = await countFailures(identifier, ip, minutes)
  return { allowed: failures < max, failures, max, windowMinutes: minutes }
}

/**
 * Express middleware for login. Responds 429 once the failure budget is spent.
 * Successful logins should call clearLoginFailures() to reset the counter.
 */
export function loginRateLimit(options = {}) {
  const minutes = options.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const max = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  return async function loginRateLimitMiddleware(req, res, next) {
    try {
      const identifier = String(req.body?.email || req.body?.identifier || '').trim()
      const ip = clientIp(req)
      const status = await loginThrottleStatus(identifier, ip, { windowMinutes: minutes, maxAttempts: max })

      if (!status.allowed) {
        res.setHeader('Retry-After', String(minutes * 60))
        return res.status(429).json({
          error:
            'Too many failed login attempts. Please wait before trying again or contact an administrator.',
        })
      }
      next()
    } catch (error) {
      // A throttle-table failure must not become an authentication bypass.
      next(error)
    }
  }
}

export async function clearLoginFailures(identifier, ip) {
  await run('DELETE FROM login_attempts WHERE successful = 0 AND (identifier = ? OR ip = ?)', [
    String(identifier || '').slice(0, 255),
    String(ip || '').slice(0, 64),
  ])
}

/** Housekeeping: drop counters that can no longer throttle anything. */
export async function pruneLoginAttempts(days = 30) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  await run('DELETE FROM login_attempts WHERE created_at < ?', [cutoff])
  await run('DELETE FROM revoked_tokens WHERE expires_at < NOW()', [])
}

// Keep a failed-login counter query cheap on low-traffic installs.
let lastPrune = 0
export function maybePruneLoginAttempts() {
  const now = Date.now()
  if (now - lastPrune < 60 * 60 * 1000) return
  lastPrune = now
  pruneLoginAttempts().catch((e) => console.error('login_attempts prune failed:', e.message))
}

export async function recentFailedLogins(limit = 20) {
  return queryAll(
    `SELECT identifier, ip, created_at FROM login_attempts
      WHERE successful = 0 ORDER BY created_at DESC LIMIT ?`,
    [limit],
  )
}

export async function loginActivitySummary(hours = 24) {
  const since = new Date()
  since.setHours(since.getHours() - hours)
  const row = await queryOne(
    `SELECT
        SUM(CASE WHEN successful = 0 THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN successful = 1 THEN 1 ELSE 0 END) AS succeeded
       FROM login_attempts WHERE created_at > ?`,
    [since],
  )
  return { failed: Number(row?.failed || 0), succeeded: Number(row?.succeeded || 0) }
}