import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId, isValidRwPhone, rwPhoneFull } from '../utils.js'

const router = Router()

function mapCustomer(row) {
  if (!row) return null
  return {
    id: row.id,
    customer_id: row.customer_id,
    full_name: row.full_name,
    phone_number: row.phone_number,
    gender: row.gender || '',
    email: row.email,
    address: row.address,
    amount: row.amount,
    duration: row.duration,
    status: row.status,
    registration_date: row.registration_date,
  }
}

// All authenticated staff can view customers
router.get('/', requireAuth, async (req, res) => {
  try {
    let sql = `
      SELECT * FROM customers
    `
    const params = {}
    const q = req.query

    const where = []
    if (q.status && q.status !== '') {
      where.push('status = @status')
      params.status = q.status
    }
    if (q.search && q.search.trim() !== '') {
      where.push(
        '(customer_id LIKE @search OR full_name LIKE @search OR phone_number LIKE @search OR gender LIKE @search)',
      )
      params.search = `%${q.search.trim()}%`
    }
    if (where.length) sql += ` WHERE ${where.join(' AND ')}`

    sql += ` ORDER BY id DESC LIMIT 500`

    const rows = await queryAll(sql, params)
    res.json({ customers: rows.map(mapCustomer) })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/:id', requireAuth, async (req, res) => {
  try {
    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id])
    if (!row) return res.status(404).json({ error: 'Customer not found.' })
    const loans = await queryAll(
      `SELECT
         l.*,
         la.application_date,
         la.approved_at,
         la.interest_rate,
         lp.name AS product_name
       FROM loans l
       LEFT JOIN loan_applications la ON la.id = l.application_id
       LEFT JOIN loan_products lp ON lp.id = l.loan_product_id
       WHERE l.customer_id = ?
       ORDER BY l.created_at DESC`,
      [req.params.id],
    )
    res.json({ customer: mapCustomer(row), loans })
  } catch (e) {
    handleError(res, e)
  }
})

// Bulk import customers from an Excel export
router.post('/bulk', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const items = Array.isArray(req.body?.customers) ? req.body.customers : []
    if (items.length === 0) {
      return res.status(400).json({ error: 'No customers provided to import.' })
    }

    const lastCount = Number((await queryOne('SELECT COUNT(*) AS c FROM customers')).c)
    let seq = lastCount
    const imported = []
    const errors = []

    for (let i = 0; i < items.length; i++) {
      const row = items[i]
      const index = i + 1
      try {
        const full_name = String(row.full_name ?? '').trim()
        const phone_number = String(row.phone_number ?? '').replace(/[^\d+]/g, '')
        const gender = String(row.gender ?? '').trim()
        const email_raw = String(row.email ?? '').trim()
        const address = row.address ? String(row.address).trim() : null
        const amount = Number(row.amount ?? 0)
        const duration = Number(row.duration ?? 0)
        const status = row.status === 'inactive' ? 'inactive' : 'active'
        let email = email_raw || null
        if (email && !/^\S+@\S+\.\S+$/.test(email)) {
          errors.push({ row: index, error: `Invalid email "${email_raw}".` })
          continue
        }
        const rawDate = row.registration_date ? String(row.registration_date).trim() : ''
        let registration_date
        if (!rawDate) {
          registration_date = new Date().toISOString().slice(0, 10)
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
          errors.push({ row: index, error: `Invalid registration date "${rawDate}". Use YYYY-MM-DD.` })
          continue
        } else if (rawDate > new Date().toISOString().slice(0, 10)) {
          errors.push({ row: index, error: `Registration date "${rawDate}" is in the future.` })
          continue
        } else {
          registration_date = rawDate
        }

        if (!full_name || !phone_number) {
          errors.push({ row: index, error: 'Full name and phone number are required.' })
          continue
        }
        if (!isValidRwPhone(phone_number)) {
          errors.push({ row: index, error: `Invalid phone "${phone_number}". Enter a valid 9-digit number.` })
          continue
        }
        if (!Number.isFinite(amount) || amount < 0) {
          errors.push({ row: index, error: 'Amount must be a valid number (0 or more).' })
          continue
        }
        if (!Number.isFinite(duration) || duration < 0 || duration > 6) {
          errors.push({ row: index, error: 'Duration must be between 0 and 6 months.' })
          continue
        }

        const normalizedPhone = rwPhoneFull(phone_number)
        const genderNorm = ['Male', 'Female', 'Other'].includes(gender) ? gender : ''
        const customer_id = genId('CUS', seq++)
        await run(
          `INSERT INTO customers (customer_id, full_name, phone_number, gender, email, address, amount, duration, status, registration_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customer_id,
            full_name,
            normalizedPhone,
            genderNorm,
            email,
            address,
            amount,
            duration,
            status,
            registration_date,
          ],
        )
        imported.push({ customer_id, full_name, phone_number: normalizedPhone })
      } catch (e) {
        errors.push({ row: index, error: e.message })
      }
    }

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMERS_BULK_IMPORTED',
      description: `Bulk imported ${imported.length} customer(s) with ${errors.length} error(s)`,
    })

    res.status(imported.length ? 201 : 200).json({ imported, errors })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const { full_name, phone_number, gender, email, address, amount, duration, status = 'active' } = req.body || {}

    if (!full_name || !phone_number) {
      return res.status(400).json({ error: 'Full name and phone number are required.' })
    }
    if (!isValidRwPhone(phone_number)) {
      return res.status(400).json({ error: 'Phone number must be a valid 9-digit number.' })
    }
    const normalizedPhone = rwPhoneFull(phone_number)
    const amountValue = Number(amount)
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      return res.status(400).json({ error: 'Amount must be a valid number.' })
    }
    const durationValue = Number(duration)
    if (!Number.isFinite(durationValue) || durationValue < 0 || durationValue > 6) {
      return res.status(400).json({ error: 'Duration must be between 0 and 6 months.' })
    }

    const last = await queryOne('SELECT COUNT(*) AS c FROM customers')
    const customer_id = genId('CUS', Number(last.c))
    const registration_date = new Date().toISOString().slice(0, 10)

    const info = await run(
      `INSERT INTO customers (customer_id, full_name, phone_number, gender, email, address, amount, duration, status, registration_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, full_name, normalizedPhone, gender || '', email || null, address || null, amountValue, durationValue, status, registration_date],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_CREATED',
      description: `Created customer ${full_name}`,
      relatedRecord: `customer:${customer_id}`,
    })

    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [info.lastInsertRowid])
    res.status(201).json({ customer: mapCustomer(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/:id', requireAuth, requireRole('super_admin', 'loan_officer', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Customer not found.' })

    const { full_name, phone_number, gender, email, address, amount, duration, status } = req.body || {}
    const updated = {
      full_name: full_name !== undefined ? full_name : existing.full_name,
      phone_number: phone_number !== undefined ? phone_number : existing.phone_number,
      gender: gender !== undefined ? gender : existing.gender,
      email: email !== undefined ? email : existing.email,
      address: address !== undefined ? address : existing.address,
      amount: amount !== undefined ? amount : existing.amount,
      duration: duration !== undefined ? duration : existing.duration,
      status: status !== undefined ? status : existing.status,
    }

    if (!updated.full_name || !updated.phone_number) {
      return res.status(400).json({ error: 'Full name and phone number are required.' })
    }
    if (!isValidRwPhone(updated.phone_number)) {
      return res.status(400).json({ error: 'Phone number must be a valid 9-digit number.' })
    }
    const normalizedPhone = rwPhoneFull(updated.phone_number)
    const amountValue = Number(updated.amount)
    if (!Number.isFinite(amountValue) || amountValue < 0) {
      return res.status(400).json({ error: 'Amount must be a valid number.' })
    }
    const durationValue = Number(updated.duration)
    if (!Number.isFinite(durationValue) || durationValue < 0 || durationValue > 6) {
      return res.status(400).json({ error: 'Duration must be between 0 and 6 months.' })
    }

    await run(
      `UPDATE customers SET full_name = ?, phone_number = ?, gender = ?, email = ?, address = ?, amount = ?, duration = ?, status = ?
       WHERE id = ?`,
      [
        updated.full_name,
        normalizedPhone,
        updated.gender || '',
        updated.email,
        updated.address,
        amountValue,
        durationValue,
        updated.status,
        req.params.id,
      ],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_UPDATED',
      description: `Updated customer ${updated.full_name}`,
      relatedRecord: `customer:${existing.customer_id}`,
    })

    const row = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id])
    res.json({ customer: mapCustomer(row) })
  } catch (e) {
    handleError(res, e)
  }
})

router.delete('/:id', requireAuth, requireRole('super_admin', 'manager'), async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM customers WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Customer not found.' })

    const loans = await queryOne(
      'SELECT COUNT(*) AS c FROM loans WHERE customer_id = ?',
      [req.params.id],
    )
    const apps = await queryOne(
      'SELECT COUNT(*) AS c FROM loan_applications WHERE customer_id = ?',
      [req.params.id],
    )
    if (Number(loans.c) > 0 || Number(apps.c) > 0) {
      return res.status(400).json({
        error:
          'This customer has loans or applications. Deactivate them instead of deleting.',
      })
    }

    await run('DELETE FROM customers WHERE id = ?', [req.params.id])

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'CUSTOMER_DELETED',
      description: `Deleted customer ${existing.full_name}`,
      relatedRecord: `customer:${existing.customer_id}`,
    })

    res.json({ success: true })
  } catch (e) {
    handleError(res, e)
  }
})

export default router