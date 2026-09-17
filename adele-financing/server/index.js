import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initDb } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await initDb()

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(express.json())

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

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' })
})

app.listen(PORT, () => {
  console.log(`ADELE LMS API running at http://localhost:${PORT}`)
})