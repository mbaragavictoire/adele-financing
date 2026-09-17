import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { queryOne } from '../db.js'
import { signToken, requireAuth } from '../auth.js'
import { writeAudit } from '../utils.js'

const router = Router()

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

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' })
    }

    const user = await findUserByIdentifier(String(email).trim())
    if (!user) {
      await writeAudit({ action: 'LOGIN_FAILED', description: `Failed login attempt for ${email}` })
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

    if (user.status !== 'active') {
      await writeAudit({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_DENIED',
        description: `Login denied: account is ${user.status}`,
      })
      return res.status(403).json({ error: 'Your account is inactive. Contact an administrator.' })
    }

    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) {
      await writeAudit({
        userId: user.id,
        userName: user.full_name,
        action: 'LOGIN_FAILED',
        description: 'Invalid password',
      })
      return res.status(401).json({ error: 'Invalid email or password.' })
    }

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

export default router