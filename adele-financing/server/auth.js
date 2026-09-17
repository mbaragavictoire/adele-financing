import jwt from 'jsonwebtoken'

export const JWT_SECRET =
  process.env.JWT_SECRET || 'adele-finance-secret-change-in-production'
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h'

export function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      name: user.full_name,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  )
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' })
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    req.user = payload
    next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session.' })
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