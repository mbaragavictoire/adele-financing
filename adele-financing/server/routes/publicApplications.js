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

async function findOrCreateCustomer({ first, last, email, phone }) {
  const existing = await queryOne(
    'SELECT * FROM customers WHERE phone_number = ? OR email = ? ORDER BY id LIMIT 1',
    [phone, email],
  )
  if (existing) return existing

  const lastCount = await queryOne('SELECT COUNT(*) AS c FROM customers')
  const customer_id = genId('CUS', Number(lastCount.c))
  const registration_date = new Date().toISOString().slice(0, 10)

  const info = await run(
    `INSERT INTO customers
      (customer_id, full_name, phone_number, gender, email, address, status, registration_date)
     VALUES (?, ?, ?, '', ?, NULL, 'active', ?)`,
    [customer_id, `${first} ${last}`.trim(), phone, email || null, registration_date],
  )

  return queryOne('SELECT * FROM customers WHERE id = ?', [info.lastInsertRowid])
}

async function findProduct(loanType, amount) {
  const name = LOAN_TYPE_TO_PRODUCT[loanType]
  if (name) {
    const product = await queryOne(
      "SELECT * FROM loan_products WHERE name = ? AND status = 'active' ORDER BY id LIMIT 1",
      [name],
    )
    if (product) return product
  }
  return queryOne(
    `SELECT * FROM loan_products WHERE status = 'active' AND min_amount <= ? ORDER BY min_amount DESC LIMIT 1`,
    [Number(amount)],
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

    if (!first || !last || !phone) {
      return res.status(400).json({ error: 'First name, last name and phone number are required.' })
    }
    if (!isValidRwPhone(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 9-digit phone number.' })
    }
    const normalizedPhone = rwPhoneFull(phone)
    if (!(+amount > 0)) return res.status(400).json({ error: 'Invalid loan amount.' })
    if (!loanType) return res.status(400).json({ error: 'Please select a loan type.' })
    const duration = Number(monthly)
    if (!Number.isInteger(duration) || duration < 1) {
      return res.status(400).json({ error: 'Invalid repayment period.' })
    }
    if (duration > 6) {
      return res.status(400).json({ error: 'The repayment period cannot be more than 6 months.' })
    }

    const customer = await findOrCreateCustomer({ first, last, email, phone: normalizedPhone })

    const product = await findProduct(loanType, amount)
    if (!product) return res.status(400).json({ error: 'No matching loan product is available right now.' })

    const lastApp = await queryOne('SELECT COUNT(*) AS c FROM loan_applications')
    const application_id = genId('APP', Number(lastApp.c))
    const application_date = date || new Date().toISOString().slice(0, 10)

    await run(
      `INSERT INTO loan_applications
        (application_id, customer_id, loan_product_id, requested_amount, duration, purpose,
         application_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        application_id,
        customer.id,
        product.id,
        +amount,
        duration,
        message || null,
        application_date,
      ],
    )

    const docCount = await saveDocuments(application_id, req.files)

    await writeAudit({
      action: 'APPLICATION_CREATED',
      description: `Website application ${application_id} for ${customer.full_name}${docCount ? ` with ${docCount} document(s)` : ''}`,
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