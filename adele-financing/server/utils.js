import { run } from '#adele-db'

export async function writeAudit({
  userId = null,
  userName = 'System',
  action,
  description,
  relatedRecord = null,
}, db = null) {
  const execute = db?.run || run
  await execute(
    `INSERT INTO audit_logs (user_id, user_name, action, description, related_record)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, userName, action, description, relatedRecord],
  )
}

export function buildFilter(req, table, allowed = []) {
  const clauses = []
  const params = {}
  for (const key of allowed) {
    const value = req.query[key]
    if (value !== undefined && value !== '') {
      params[key] = value
      clauses.push(`${key} = @${key}`)
    }
  }
  if (params.status && params.status !== '') {
    // status already handled by loop above
  }
  return { clause: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', params }
}

export function searchFilter(search, columns) {
  if (!search || search.trim() === '') return ''
  const likes = columns.map((c) => `${c} LIKE @search`).join(' OR ')
  return ` AND (${likes})`
}

export function searchParams(search) {
  return { search: `%${search.trim()}%` }
}

export function genId(prefix, lastId) {
  const n = lastId + 1
  return `${prefix}-${String(n).padStart(5, '0')}`
}

const RW_LOCAL_LENGTH = 9

export function sanitizeRwPhone(value) {
  let d = String(value ?? '').replace(/[^\d]/g, '')
  if (d.startsWith('250')) d = d.slice(3)
  if (d.startsWith('0')) d = d.slice(1)
  return d.slice(0, RW_LOCAL_LENGTH)
}

export function rwPhoneFull(value) {
  const local = sanitizeRwPhone(value)
  return local ? `+250${local}` : ''
}

export function isValidRwPhone(value) {
  return /^[78]\d{8}$/.test(sanitizeRwPhone(value))
}