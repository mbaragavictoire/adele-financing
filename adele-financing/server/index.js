import './env.js'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initDb } from './db.js'
import { securityHeaders } from './security.js'
import { maybePruneLoginAttempts } from './rateLimit.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await initDb()
maybePruneLoginAttempts()
setInterval(maybePruneLoginAttempts, 60 * 60 * 1000).unref()

const app = express()
const PORT = process.env.PORT || 4000

// Browsers send X-Forwarded-For when running behind the Cloudflare tunnel, so
// client IPs must be trusted from the proxy for rate limiting to be accurate.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1))

app.use(securityHeaders)

// Wildcard CORS would let any site on the internet read authenticated API
// responses. When CORS_ORIGINS is configured only those origins are accepted.
const ALLOWED_ORIGINS = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser clients send no Origin header.
      if (!origin) return callback(null, true)
      if (ALLOWED_ORIGINS.length === 0) return callback(null, true)
      callback(null, ALLOWED_ORIGINS.includes(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
)

// Explicit body cap. The public upload route uses multipart and is limited by
// multer instead, so a small JSON limit does not restrict PDF submissions.
app.use(express.json({ limit: '256kb' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'adele-lms-api' })
})

import authRouter from './routes/auth.js'
import customersRouter from './routes/customers.js'
import loanProductsRouter from './routes/loanProducts.js'
import applicationsRouter from './routes/loanApplications.js'
import loansRouter from './routes/loans.js'
import repaymentsRouter from './routes/repayments.js'
import paymentsRouter from './routes/payments.js'
import reportsRouter from './routes/reports.js'
import usersRouter from './routes/users.js'
import settingsRouter from './routes/settings.js'
import auditLogsRouter from './routes/auditLogs.js'
import dashboardRouter from './routes/dashboard.js'
import financeRouter from './routes/finance.js'
import publicApplicationsRouter from './routes/publicApplications.js'

app.use('/api/auth', authRouter)
app.use('/api/customers', customersRouter)
app.use('/api/loan-products', loanProductsRouter)
app.use('/api/loan-applications', applicationsRouter)
app.use('/api/loans', loansRouter)
app.use('/api/repayments', repaymentsRouter)
app.use('/api/payments', paymentsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/users', usersRouter)
app.use('/api/settings', settingsRouter)
app.use('/api/audit-logs', auditLogsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/finance', financeRouter)
app.use('/api/apply', publicApplicationsRouter)

// Serve built frontend in production
const distDir = path.join(__dirname, '..', 'dist')
app.use(express.static(distDir))
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'))
})

// Central error handler. Must be registered after the routes, and must take four
// arguments for Express to recognise it. Without it, multer and body-parser
// failures fall through to Express's default handler, which replies with a full
// stack trace while NODE_ENV is not explicitly 'production'.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Each document must be 10 MB or smaller.'
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Too many files were uploaded. A maximum of 5 PDF documents is allowed.'
          : 'The upload could not be processed.'
    return res.status(400).json({ error: message })
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body.' })
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' })
  }

  // Errors raised deliberately by routes carry an intended status and a safe
  // message, so they are passed through rather than masked.
  const status = Number(err?.status || err?.statusCode)
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.message || 'Request could not be completed.' })
  }

  // Client-supplied text from an invalid file type is safe to surface, but
  // anything else is logged only and reduced to a generic response.
  if (typeof err?.message === 'string' && /allowed|not a valid PDF/i.test(err.message)) {
    return res.status(400).json({ error: err.message })
  }

  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'An unexpected error occurred.' })
})

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

app.listen(PORT, () => {
  console.log(`ADELE LMS API running at http://localhost:${PORT}`)
})