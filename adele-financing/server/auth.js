import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { queryOne } from './db.js'

// A missing or weak signing key would let anyone forge an admin token, so the
// server refuses to boot instead of silently falling back to a known value.
const RAW_SECRET = String(process.env.JWT_SECRET || '').trim()
if (RAW_SECRET.length < 32) {
  throw new Error(
    'FATAL: JWT_SECRET must be set to at least 32 characters. Generate one with: ' +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  )
}

export const JWT_SECRET = RAW_SECRET
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
      // Unique token id so an individual session can be revoked on logout.
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  let payload
  try {
    payload = jwt.verify(token, JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
  }

  try {
    // Revoked sessions (logout) stay unusable even before the token expires.
    if (payload.jti) {
      const revoked = await queryOne('SELECT id FROM revoked_tokens WHERE id = ? LIMIT 1', [
        payload.jti,
      ])
      if (revoked) {
        return res.status(401).json({ error: 'This session has been signed out.' })
      }
    }

    // Re-read the account on every request. Trusting the role inside the token
    // would keep a demoted or suspended user privileged until the token expired.
    const user = await queryOne(
      'SELECT id, full_name, email, role, status FROM users WHERE id = ?',
      [payload.sub],
    )
    if (!user) {
      return res.status(401).json({ error: 'Account not found.' })
    }
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is not active.' })
    }

    req.user = {
      ...payload,
      name: user.full_name,
      email: user.email,
      role: user.role,
    }
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
  if (log) console.error(error)
  res.status(500).json({ error: 'An unexpected error occurred.' })
}

export { GENERIC_ACTION }