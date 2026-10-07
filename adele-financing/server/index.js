import './env.js'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initDb } from './db.js'
import { securityHeaders } from './security.js'
import { maybePruneLoginAttempts } from './rateLimit.js'
import { pruneSessions } from './session.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The API listens first and initialises second — the ordering is the point.
//
// Building the schema, seeding and migrating used to run before app.listen(),
// so for the whole of that window port 4000 accepted nothing at all. Vite
// serves the SPA the instant it boots, the browser asks for GET /api/auth/me
// straight away, and the proxy found no socket to connect to — hence
// ECONNREFUSED, printed as an AggregateError because Node tried both ::1 and
// 127.0.0.1 and both were refused. The "ADELE LMS API running" line that
// appeared after those errors was not a crash; it was the API announcing it had
// finally come up. Requests arriving during that window are now held by the
// gate further down and released the moment the schema is in place.
const boot = { ready: false, waiters: [] }

function markBootReady() {
  boot.ready = true
  for (const release of boot.waiters.splice(0)) release(true)
}

/**
 * Waits for boot. Resolves true once ready, or 'timeout' if it takes too long.
 * It deliberately never rejects and never hangs indefinitely: a database that
 * fails to start must not leave sockets open and connections waiting forever.
 */
function awaitBoot(timeoutMs) {
  if (boot.ready) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs)
    boot.waiters.push(() => {
      clearTimeout(timer)
      resolve(true)
    })
  })
}

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

// Origins this application is deliberately served from, for the CSRF check
// below. Derived from configuration the operator sets, so — unlike a forwarded
// header the caller could write — it cannot be used to talk your way past the
// check. Empty unless CORS_ORIGINS is configured.
const CONFIGURED_HOSTS = new Set(
  ALLOWED_ORIGINS.flatMap((origin) => {
    try {
      return [new URL(origin).host.toLowerCase()]
    } catch {
      return [] // not a parseable URL; not usable as a host
    }
  }),
)

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and non-browser clients send no Origin header.
      if (!origin) return callback(null, true)
      if (ALLOWED_ORIGINS.length === 0) return callback(null, true)
      callback(null, ALLOWED_ORIGINS.includes(origin))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  }),
)

// Sessions now travel in a cookie, which the browser attaches automatically.
// That removes the need for a bearer token but introduces cross-site request
// forgery, so every state-changing API call must come from this origin.
//
// SameSite=strict is the primary defence. This is the backstop for the cases it
// cannot cover. The request's own Host header is the primary comparison because
// it describes the origin the browser actually addressed, which keeps working
// behind a tunnel without that hostname being hard-coded. CORS_ORIGINS is
// accepted as well, for deployments where a proxy rewrites Host to a backend
// address and the two no longer agree.
//
// X-Forwarded-Host is deliberately not consulted. CORS_ORIGINS defaults to
// allow-all, so trusting a header the caller can supply would weaken this to
// whatever the caller claims; Host is set by the connection, not the page.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
app.use('/api', (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next()

  const origin = req.headers.origin
  // Absent Origin means a non-browser client (curl, a server-to-server call).
  // Those are not forgeable by a web page, and requiring the header would break
  // legitimate tooling.
  if (!origin) return next()

  let originHost
  try {
    originHost = new URL(origin).host.toLowerCase()
  } catch {
    return res.status(403).json({ error: 'Request origin could not be verified.' })
  }

  const requestHost = String(req.headers.host || '').toLowerCase()
  if (originHost !== requestHost && !CONFIGURED_HOSTS.has(originHost)) {
    return res.status(403).json({ error: 'Cross-site request refused.' })
  }
  next()
})

// Explicit body cap. The public upload route uses multipart and is limited by
// multer instead, so a small JSON limit does not restrict PDF submissions.
app.use(express.json({ limit: '256kb' }))

// Health doubles as the readiness probe. 'starting' is a 503 so that a
// supervisor polling for 200 is waiting for the thing it actually cares about,
// rather than for a socket that opens before there is anything behind it.
app.get('/api/health', (req, res) => {
  res.status(boot.ready ? 200 : 503).json({
    status: boot.ready ? 'ok' : 'starting',
    service: 'adele-lms-api',
  })
})

// Readiness gate, registered ahead of every router so it runs first. A request
// that arrives mid-boot is held rather than refused, which is why the very
// first call the browser makes after starting the dev server now succeeds
// instead of failing with a proxy stack trace. Bounded, so it degrades to a
// considered 503 rather than a hung connection if boot takes unreasonably long.
const BOOT_WAIT_MS = 30000
app.use('/api', (req, res, next) => {
  if (req.path === '/health') return next()

  awaitBoot(BOOT_WAIT_MS).then((ready) => {
    if (ready === true) return next()
    res.setHeader('Retry-After', '5')
    res.status(503).json({ error: 'The database is still starting up. Please retry.' })
  })
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
import sessionsRouter from './routes/sessions.js'
import dashboardRouter from './routes/dashboard.js'
import financeRouter from './routes/finance.js'
import publicApplicationsRouter from './routes/publicApplications.js'
import contactRouter from './routes/contactMessages.js'

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
app.use('/api/sessions', sessionsRouter)
app.use('/api/dashboard', dashboardRouter)
app.use('/api/finance', financeRouter)
app.use('/api/apply', publicApplicationsRouter)
app.use('/api/contact', contactRouter)

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

// Open the socket first, then boot. Everything above is registration, so the
// server can accept connections as soon as this is called while initDb() still
// runs; requests reaching the gate are queued until it finishes.
app.listen(PORT, () => {
  console.log(`ADELE LMS API listening on http://localhost:${PORT}`)
})

try {
  await initDb()
} catch (error) {
  // Fail fast rather than leave a process up that answers every request with
  // 500. Previously this surfaced as an unhandled rejection from a top-level
  // await; the exit code is unchanged, the message is now readable.
  console.error('ADELE LMS API failed to start:', error)
  process.exit(1)
}

markBootReady()
console.log(`ADELE LMS API ready at http://localhost:${PORT}`)

maybePruneLoginAttempts()
setInterval(maybePruneLoginAttempts, 60 * 60 * 1000).unref()

// Expired sessions are also closed lazily on the request that notices them, but
// this keeps the admin session list honest about sessions nobody has retried.
pruneSessions().catch((e) => console.error('session prune failed:', e.message))
setInterval(
  () => pruneSessions().catch((e) => console.error('session prune failed:', e.message)),
  60 * 60 * 1000,
).unref()