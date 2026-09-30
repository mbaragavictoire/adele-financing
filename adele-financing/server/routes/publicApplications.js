import { Router } from 'express'
import multer from 'multer'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, handleError } from '../auth.js'
import { writeAudit, genId, isValidRwPhone, rwPhoneFull } from '../utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'applications')
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const router = Router()

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.pdf'
      cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`)
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    const ok =
      file.mimetype === 'application/pdf' ||
      file.originalname.toLowerCase().endsWith('.pdf')
    cb(ok ? null : new Error('Only PDF documents are allowed.'), ok)
  },
})

const LOAN_TYPE_TO_PRODUCT = {
  personal: 'Personal Loan',
  sme: 'Business Loan',
  salary: 'Salary Loan',
  agricultural: 'Agricultural Loan',
  asset: 'Asset Financing',
  'working-capital': 'Working Capital Loan',
  'school-fees': 'School Fees Loan',
  emergency: 'Emergency Loan',
}
const defaultDb = { queryAll, queryOne, run }
let customerCreationQueue = Promise.resolve()

async function findExistingCustomer(normalizedPhone, emailValue, db = defaultDb) {
  const conditions = ['phone_number = ?']
  const params = [normalizedPhone]
  if (emailValue) {
    conditions.push('LOWER(email) = LOWER(?)')
    params.push(emailValue)
  }

  const matches = await db.queryAll(
    `SELECT * FROM customers
     WHERE ${conditions.join(' OR ')}
     ORDER BY id`,
    params,
  )
  if (matches.length > 1) {
    const error = new Error(
      'The applicant phone number and email match different customer records. Resolve the identity conflict before approval.',
    )
    error.code = 'CUSTOMER_IDENTITY_CONFLICT'
    error.statusCode = 409
    throw error
  }
  return matches[0] || null
}

export function findOrCreateCustomer(args, db = defaultDb) {
  const operation = customerCreationQueue.then(() => findOrCreateCustomerNow(args, db))
  customerCreationQueue = operation.catch(() => {})
  return operation
}

async function findOrCreateCustomerNow({
  first,
  last,
  email,
  phone,
  gender = '',
  amount = 0,
  duration = 0,
  applicationDate = null,
} = {}, db = defaultDb) {
  const firstName = String(first ?? '').trim()
  const lastName = String(last ?? '').trim()
  const fullName = `${firstName} ${lastName}`.trim()
  const emailValue = String(email ?? '').trim()
  const phoneValue = String(phone ?? '').trim()
  const normalizedPhone = phoneValue ? rwPhoneFull(phoneValue) : ''

  if (!fullName) throw new Error('Applicant full name is required.')
  if (!normalizedPhone) throw new Error('Applicant phone number is required.')

  const amountValue = Number.isFinite(Number(amount)) ? Number(amount) : 0
  const durationValue = Number.isFinite(Number(duration)) ? Math.trunc(Number(duration)) : 0

  const existing = await findExistingCustomer(normalizedPhone, emailValue, db)

  if (existing) {
    const updates = []
    const values = []
    if (!existing.email && emailValue) {
      updates.push('email = ?')
      values.push(emailValue)
    }
    if (!existing.gender && gender) {
      updates.push('gender = ?')
      values.push(String(gender).trim())
    }
    if (updates.length) {
      values.push(existing.id)
      await db.run(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`, values)
      const customer = await db.queryOne('SELECT * FROM customers WHERE id = ?', [existing.id])
      return { customer, created: false }
    }
    return { customer: existing, created: false }
  }

  const registrationDateValue = String(applicationDate ?? '').trim()
  const registration_date = /^\d{4}-\d{2}-\d{2}$/.test(registrationDateValue)
    ? registrationDateValue
    : new Date().toISOString().slice(0, 10)

  // Only fields that exist in customers are copied. Application-only fields
  // remain on loan_applications and are never inserted into customer records.
  for (let attempt = 0; attempt < 5; attempt++) {
    const max = await db.queryOne(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(customer_id, 5) AS UNSIGNED)), 0) AS n FROM customers`,
    )
    // genId adds one to the supplied sequence number.
    const customer_id = genId('CUS', Number(max.n))

    try {
      const info = await db.run(
        `INSERT INTO customers
          (customer_id, full_name, phone_number, gender, email, amount, duration, status, registration_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [
          customer_id,
          fullName,
          normalizedPhone,
          String(gender ?? '').trim(),
          emailValue || null,
          Math.max(0, amountValue),
          Math.max(0, durationValue),
          registration_date,
        ],
      )
      const customer = await db.queryOne('SELECT * FROM customers WHERE id = ?', [info.lastInsertRowid])
      if (!customer) throw new Error('Customer could not be read after creation.')
      return { customer, created: true }
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY') continue
      throw e
    }
  }

  throw new Error('Could not allocate a unique customer reference. Please try again.')
}

async function findProduct(loanType, amount) {
  const name = LOAN_TYPE_TO_PRODUCT[loanType]
  const amountValue = Number(amount)
  if (name) {
    const product = await queryOne(
      "SELECT * FROM loan_products WHERE name = ? AND status = 'active' ORDER BY id LIMIT 1",
      [name],
    )
    if (!product) return null
    const minAmount = Number(product.min_amount) || 0
    const maxAmount = Number(product.max_amount) || 0
    if (amountValue < minAmount || (maxAmount > 0 && amountValue > maxAmount)) return null
    return product
  }
  return queryOne(
    `SELECT * FROM loan_products
     WHERE status = 'active' AND min_amount <= ?
       AND (max_amount = 0 OR max_amount >= ?)
     ORDER BY min_amount DESC LIMIT 1`,
    [amountValue, amountValue],
  )
}

async function saveDocuments(application_id, files) {
  if (!files || files.length === 0) return 0
  for (const f of files) {
    await run(
      `INSERT INTO application_documents
        (application_id, file_name, file_path, mime_type, size)
       VALUES (?, ?, ?, ?, ?)`,
      [application_id, f.originalname, f.path, f.mimetype, f.size],
    )
  }
  return files.length
}

// Public application submission (JSON or multipart with PDFs)
router.post('/', upload.array('documents', 5), async (req, res) => {
  try {
    const { first, last, email, phone, amount, loanType, date, monthly, message } = req.body || {}
    const firstName = String(first ?? '').trim()
    const lastName = String(last ?? '').trim()
    const emailValue = String(email ?? '').trim()
    const phoneValue = String(phone ?? '').trim()
    const amountValue = Number(amount)
    const duration = Number(monthly)
    const today = new Date().toISOString().slice(0, 10)
    const applicationDate = String(date ?? '').trim() || today

    if (!firstName || !lastName || !phoneValue) {
      return res.status(400).json({ error: 'First name, last name and phone number are required.' })
    }
    if (!isValidRwPhone(phoneValue)) {
      return res.status(400).json({ error: 'Please enter a valid 9-digit phone number.' })
    }
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      return res.status(400).json({ error: 'Invalid loan amount.' })
    }
    if (!loanType) return res.status(400).json({ error: 'Please select a loan type.' })
    if (!Number.isInteger(duration) || duration < 1) {
      return res.status(400).json({ error: 'Invalid repayment period.' })
    }
    if (duration > 6) {
      return res.status(400).json({ error: 'The repayment period cannot be more than 6 months.' })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(applicationDate) || applicationDate > today) {
      return res.status(400).json({ error: 'Please provide a valid application date.' })
    }

    const normalizedPhone = rwPhoneFull(phoneValue)
    let existingCustomer = null
    try {
      existingCustomer = await findExistingCustomer(normalizedPhone, emailValue)
    } catch (error) {
      // Keep the application available for staff review when legacy customer
      // records contain conflicting identities; approval will return a clear
      // conflict instead of attaching it to an arbitrary customer.
      if (error.code !== 'CUSTOMER_IDENTITY_CONFLICT') throw error
    }
    const applicantName = `${firstName} ${lastName}`.trim()
    const product = await findProduct(loanType, amountValue)
    if (!product) return res.status(400).json({ error: 'No matching loan product is available right now.' })

    let application_id = ''
    for (let attempt = 0; attempt < 5; attempt++) {
      const maxApp = await queryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTRING(application_id, 5) AS UNSIGNED)), 0) AS n
         FROM loan_applications`,
      )
      const candidateId = genId('APP', Number(maxApp.n))
      try {
        await run(
          `INSERT INTO loan_applications
            (application_id, customer_id, loan_product_id, requested_amount, duration, purpose,
             application_date, status, applicant_first_name, applicant_last_name,
             applicant_email, applicant_phone)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
          [
            candidateId,
            existingCustomer?.id || null,
            product.id,
            amountValue,
            duration,
            String(message ?? '').trim() || null,
            applicationDate,
            firstName,
            lastName,
            emailValue || null,
            normalizedPhone,
          ],
        )
        application_id = candidateId
        break
      } catch (error) {
        if (error?.code !== 'ER_DUP_ENTRY' || attempt === 4) throw error
      }
    }
    if (!application_id) {
      return res.status(500).json({ error: 'Could not allocate an application reference. Please try again.' })
    }

    const docCount = await saveDocuments(application_id, req.files)

    await writeAudit({
      action: 'APPLICATION_CREATED',
      description: `Website application ${application_id} for ${applicantName}${docCount ? ` with ${docCount} document(s)` : ''}`,
      relatedRecord: `application:${application_id}`,
    })

    res.status(201).json({
      success: true,
      application_id,
      document_count: docCount,
      message: 'Your application has been received. We will contact you within one business day.',
    })
  } catch (e) {
    handleError(res, e)
  }
})

// List documents for an application (staff only)
router.get('/documents', requireAuth, async (req, res) => {
  try {
    const application_id = req.query.application_id
    if (!application_id)
      return res.status(400).json({ error: 'application_id is required.' })

    const rows = await queryAll(
      'SELECT * FROM application_documents WHERE application_id = ? ORDER BY uploaded_at DESC',
      [application_id],
    )
    res.json({ documents: rows })
  } catch (e) {
    handleError(res, e)
  }
})

// Download a document (staff only)
router.get('/documents/:id/file', requireAuth, async (req, res) => {
  try {
    const doc = await queryOne(
      'SELECT * FROM application_documents WHERE id = ?',
      [req.params.id],
    )
    if (!doc) return res.status(404).json({ error: 'Document not found.' })

    if (!fs.existsSync(doc.file_path)) {
      return res.status(404).json({ error: 'File is missing on the server.' })
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(doc.file_name)}"`,
    )
    fs.createReadStream(doc.file_path).pipe(res)
  } catch (e) {
    handleError(res, e)
  }
})

export default router