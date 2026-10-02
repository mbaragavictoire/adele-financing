/**
 * Session management for a Super Admin.
 *
 * Every route here is behind requireAuth + requireRole('super_admin'), so the
 * backend refuses the request regardless of what the browser believes about the
 * signed-in user. Hiding the menu item on the frontend is presentation only.
 *
 * The ids returned are the stored SHA-256 hashes, not the cookie values. They
 * are safe to display and to pass around because possessing one does not
 * authenticate anybody: the cookie is the credential, and its raw value exists
 * only in the browser that received it.
 */
import { Router } from 'express'
import { requireAuth, requireRole } from '../auth.js'
import {
  listActiveSessions,
  listRecentClosedSessions,
  findSessionById,
  revokeSessionById,
  revokeUserSessions,
  sessionPolicy,
} from '../session.js'
import { writeAudit } from '../utils.js'

const router = Router()

router.use(requireAuth, requireRole('super_admin'))

/** Human-readable browser/device summary, derived from the stored user agent. */
function describeDevice(userAgent) {
  const ua = String(userAgent || '')
  if (!ua) return 'Unknown device'

  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser'

  const platform = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : ''

  return platform ? `${browser} on ${platform}` : browser
}

function shape(row, { includeDevice = true } = {}) {
  return {
    id: row.id,
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    ip: row.ip,
    device: includeDevice ? describeDevice(row.user_agent) : undefined,
    user_agent: includeDevice ? row.user_agent : undefined,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    absolute_expires_at: row.absolute_expires_at,
    idle_expires_at: row.idle_expires_at,
    revoked_at: row.revoked_at ?? null,
    revoke_reason: row.revoke_reason ?? null,
  }
}

router.get('/', async (req, res) => {
  try {
    const [active, closed] = await Promise.all([
      listActiveSessions(),
      listRecentClosedSessions(Number(req.query.closed_limit) || 25),
    ])

    res.json({
      policy: sessionPolicy(),
      active: active.map((row) => shape(row)),
      recentlyClosed: closed.map((row) => shape(row, { includeDevice: false })),
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

/** Closes one session. The session id must look like a stored hash. */
router.post('/:id/revoke', async (req, res) => {
  try {
    const { id } = req.params

    if (!/^[a-f0-9]{64}$/.test(String(id || ''))) {
      return res.status(400).json({ error: 'That is not a valid session identifier.' })
    }

    const session = await findSessionById(id)
    if (!session) {
      return res.status(404).json({ error: 'Session not found.' })
    }
    if (session.revoked_at) {
      return res.status(400).json({ error: 'That session is already closed.' })
    }

    const closed = await revokeSessionById(id, {
      reason: 'Revoked by a Super Admin',
      revokedBy: req.user.id,
    })
    if (!closed) {
      return res.status(409).json({ error: 'That session was closed a moment ago.' })
    }

    await writeAudit({
      userId: req.user.id,
      userName: req.user.name,
      action: 'SESSION_REVOKED',
      description: `Revoked a session belonging to ${session.full_name} (${session.email})`,
      relatedRecord: `session:${id.slice(0, 12)}`,
    })

    res.json({ message: 'Session revoked.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

/**
 * Closes every live session for one account. Used when a device is lost or a
 * member of staff is suspected, and when an administrator resets a password.
 */
router.post('/revoke-all', async (req, res) => {
  try {
    const targetId = Number(req.body?.user_id)
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'A user id is required.' })
    }

    // The admin's own session can be kept or closed, but it is never left
    // ambiguous: the caller says which they want.
    const keepOwn = req.body?.keep_own_session === true
    const ownId = keepOwn ? req.session?.id : null

    const closed = await revokeUserSessions(targetId, {
      reason: 'Revoked by a Super Admin',
      revokedBy: req.user.id,
      exceptId: ownId,
    })

    await writeAudit({
      userId: req.user.id,
      userName: req.user.name,
      action: 'SESSION_REVOKED',
      description: `Revoked ${closed} session(s) for user #${targetId}`,
      relatedRecord: `user:${targetId}`,
    })

    res.json({
      message: closed === 0 ? 'There were no active sessions to revoke.' : `Closed ${closed} session(s).`,
      sessionsClosed: closed,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'An unexpected error occurred.' })
  }
})

export default router