import { Router } from 'express'
import { queryAll, queryOne, run } from '#adele-db'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit } from '../utils.js'
import { clientIp } from '../rateLimit.js'

const router = Router()

// Only staff who run the company read the visitor inbox. Finance officers have
// no business seeing it and loan officers already get inquiries through their
// applications. The public submission below is deliberately unauthenticated.
const MESSAGE_ROLES = ['super_admin', 'manager']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VALID_STATUSES = new Set(['new', 'read', 'archived'])

/**
 * Rejects markup and control characters in anonymous user input. The message
 * text and headers are rendered back inside the LMS inbox, so they are
 * validated the same way as the public application form rather than encoded
 * on the way out.
 * @param {string} value
 * @param {number} maxLength
 * @param {boolean} [allowPunctuation] allow , . ; : ' ( ) / & ? ! % # + - _ @
 */
function isSafeText(value, maxLength, allowPunctuation = false) {
  const text = String(value ?? '')
  if (!text || text.length > maxLength) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F<>]/.test(text)) return false
  const punctuated = new RegExp('^[\\p{L}\\p{N}\\p{M} ,.;:\'()/&?!%#+@_-]+$', 'u')
  const simple = /^[\p{L}\p{M} '-.]+$/u
  return (allowPunctuation ? punctuated : simple).test(text)
}

// Public submissions are spam magnets once the domain is known. A modest
// per-IP budget keeps the inbox usable without a second service: 5 messages
// per hour is far more than any legitimate visitor sends. The counter is
// process-local, which is fine — restarting the process only resets it.
const RATE_MAX = 5
const RATE_WINDOW_MS = 60 * 60 * 1000
const submissions = new Map()

function allowSubmission(ip) {
  const now = Date.now()
  const times = (submissions.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (times.length >= RATE_MAX) {
    submissions.set(ip, times)
    return false
  }
  times.push(now)
  submissions.set(ip, times)
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, times] of submissions) {
    const live = times.filter((t) => now - t < RATE_WINDOW_MS)
    if (live.length === 0) submissions.delete(ip)
    else submissions.set(ip, live)
  }
}, RATE_WINDOW_MS).unref()

// Public submission from the Contact page (authenticated or not — visitors
// are anonymous).
router.post('/', async (req, res) => {
  try {
    const ip = clientIp(req)
    if (!allowSubmission(ip)) {
      res.setHeader('Retry-After', '3600')
      return res
        .status(429)
        .json({ error: 'Too many messages sent from this device. Please try again later.' })
    }

    const { name, email, subject, message } = req.body || {}
    const nameValue = String(name ?? '').trim()
    const emailValue = String(email ?? '').trim()
    const subjectValue = String(subject ?? '').trim()
    const messageValue = String(message ?? '').trim()

    if (!nameValue || !emailValue || !subjectValue || !messageValue) {
      return res.status(400).json({ error: 'All fields are required.' })
    }
    if (!isSafeText(nameValue, 120)) {
      return res
        .status(400)
        .json({ error: 'Name may only contain letters, spaces, hyphens and apostrophes.' })
    }
    if (!EMAIL_RE.test(emailValue) || emailValue.length > 255) {
      return res.status(400).json({ error: 'Please enter a valid email address.' })
    }
    if (!isSafeText(subjectValue, 160, true)) {
      return res.status(400).json({ error: 'Subject contains unsupported characters.' })
    }
    if (messageValue.length < 10 || !isSafeText(messageValue, 2000, true)) {
      return res.status(400).json({ error: 'Message must be at least 10 characters.' })
    }

    const info = await run(
      `INSERT INTO contact_messages (name, email, subject, message, status)
       VALUES (?, ?, ?, ?, 'new')`,
      [nameValue, emailValue, subjectValue, messageValue],
    )

    await writeAudit({
      action: 'CONTACT_MESSAGE_RECEIVED',
      description: `Website message from ${nameValue} <${emailValue}>: ${subjectValue}`,
      relatedRecord: `message:${info.lastInsertRowid}`,
    })

    res.status(201).json({
      success: true,
      message: "Thanks for reaching out! We'll get back to you within one business day.",
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Staff inbox with status filter, search, and per-status counts so the page
// can show tab badges without a second round trip.
router.get('/', requireAuth, requireRole(...MESSAGE_ROLES), async (req, res) => {
  try {
    const { status, search } = req.query
    const where = []
    const params = {}
    if (status && VALID_STATUSES.has(status)) {
      where.push('status = @status')
      params.status = status
    }
    if (search && String(search).trim()) {
      where.push('(name LIKE @search OR email LIKE @search OR subject LIKE @search)')
      params.search = `%${String(search).trim()}%`
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''

    const rows = await queryAll(
      `SELECT id, name, email, subject, message, status, created_at
       FROM contact_messages${clause}
       ORDER BY
         CASE status WHEN 'new' THEN 0 WHEN 'read' THEN 1 ELSE 2 END,
         created_at DESC
       LIMIT 500`,
      params,
    )

    const counts = await queryOne(
      `SELECT
         SUM(status = 'new') AS new_count,
         SUM(status = 'read') AS read_count,
         SUM(status = 'archived') AS archived_count,
         COUNT(*) AS total_count
       FROM contact_messages`,
    )

    res.json({
      messages: rows,
      counts: {
        new: Number(counts?.new_count || 0),
        read: Number(counts?.read_count || 0),
        archived: Number(counts?.archived_count || 0),
        total: Number(counts?.total_count || 0),
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Mark a message read / unread / archived. Nothing is ever deleted, so the
// inbox keeps a history staff can restore from.
router.put('/:id/status', requireAuth, requireRole(...MESSAGE_ROLES), async (req, res) => {
  try {
    const { status } = req.body || {}
    if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: 'Status must be new, read or archived.' })
    }
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid message id.' })
    }

    const row = await queryOne(
      'SELECT id, name, subject, status FROM contact_messages WHERE id = ?',
      [id],
    )
    if (!row) return res.status(404).json({ error: 'Message not found.' })
    if (row.status === status) {
      return res.json({ success: true, id, status })
    }

    await run('UPDATE contact_messages SET status = ? WHERE id = ?', [status, id])
    await writeAudit({
      userId: req.user?.id ?? null,
      userName: req.user?.name || 'System',
      action: 'CONTACT_MESSAGE_STATUS',
      description: `Marked message ${id} (${row.name}: ${row.subject}) as ${status}`,
      relatedRecord: `message:${id}`,
    })

    res.json({ success: true, id, status })
  } catch (e) {
    handleError(res, e)
  }
})

export default router