import { Router } from 'express'
import { queryAll, queryOne, run } from '../db.js'
import { requireAuth, requireRole, handleError } from '../auth.js'
import { writeAudit, genId } from '../utils.js'
import { parseQuarter, quarterFromQuery } from '../quarter.js'

const router = Router()

const FINANCE_ROLES = ['super_admin', 'manager', 'finance_officer']

async function getSetting(key) {
  const row = await queryOne('SELECT value FROM settings WHERE `key` = ?', [key])
  const n = parseFloat(row?.value)
  return Number.isFinite(n) ? n : 0
}

async function setSettings(updates) {
  for (const [key, value] of Object.entries(updates)) {
    await run(
      'INSERT INTO settings (`key`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [key, String(value)],
    )
  }
}

// All-time totals (used for cash balance & retained earnings)
async function allTimeSums() {
  const [otherIncome, expenses] = await Promise.all([
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM incomes'),
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses'),
  ])
  const [repayments, disbursements] = await Promise.all([
    queryOne(
      `SELECT
         COALESCE(SUM(r.amount), 0) AS total,
         COALESCE(SUM(r.amount * l.interest / NULLIF(l.total_payable, 0)), 0) AS interest
       FROM repayments r JOIN loans l ON l.id = r.loan_id`,
    ),
    queryOne(
      `SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans WHERE disbursement_date IS NOT NULL AND status != 'cancelled'`,
    ),
  ])
  return {
    income: Number(otherIncome.s),
    expensesTotal: Number(expenses.s),
    repayTotal: Number(repayments.total),
    interestIncome: Number(repayments.interest),
    disbursedTotal: Number(disbursements.s),
  }
}

// Totals strictly inside a period (quarter)
async function periodSums(range) {
  const [otherIncome, expenses] = await Promise.all([
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM incomes WHERE income_date BETWEEN ? AND ?', [
      range.start,
      range.end,
    ]),
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE expense_date BETWEEN ? AND ?', [
      range.start,
      range.end,
    ]),
  ])
  const [repayments, disbursements] = await Promise.all([
    queryOne(
      `SELECT
         COALESCE(SUM(r.amount), 0) AS total,
         COALESCE(SUM(r.amount * l.interest / NULLIF(l.total_payable, 0)), 0) AS interest
       FROM repayments r JOIN loans l ON l.id = r.loan_id
       WHERE r.payment_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
    queryOne(
      `SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans
       WHERE disbursement_date IS NOT NULL AND status != 'cancelled'
         AND disbursement_date BETWEEN ? AND ?`,
      [range.start, range.end],
    ),
  ])
  return {
    income: Number(otherIncome.s),
    expensesTotal: Number(expenses.s),
    repayTotal: Number(repayments.total),
    interestIncome: Number(repayments.interest),
    disbursedTotal: Number(disbursements.s),
  }
}

// Cumulative (opening balance inclusive) totals with every transaction dated
// on or before the quarter end — used for the cash balance "as of period end".
async function cumulativeTo(endIso) {
  const [otherIncome, expenses] = await Promise.all([
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM incomes WHERE income_date <= ?', [endIso]),
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE expense_date <= ?', [endIso]),
  ])
  const [repayments, disbursements] = await Promise.all([
    queryOne('SELECT COALESCE(SUM(amount), 0) AS s FROM repayments WHERE payment_date <= ?', [endIso]),
    queryOne(
      `SELECT COALESCE(SUM(disbursed_amount), 0) AS s FROM loans
       WHERE disbursement_date IS NOT NULL AND status != 'cancelled' AND disbursement_date <= ?`,
      [endIso],
    ),
  ])
  return {
    income: Number(otherIncome.s),
    expensesTotal: Number(expenses.s),
    repayTotal: Number(repayments.s),
    disbursedTotal: Number(disbursements.s),
  }
}

// Aggregate numbers used across several reports.
// With a range: period figures are scoped to the quarter; cash balance is always "to date".
async function financeAggregates(range = null) {
  const all = await allTimeSums()
  const numbers = range ? await periodSums(range) : all
  const outstandingBalance = Number(
    (await queryOne("SELECT COALESCE(SUM(outstanding_balance), 0) AS s FROM loans WHERE status = 'active'")).s,
  )

  const income = numbers.income
  const expensesTotal = numbers.expensesTotal
  const repayTotal = numbers.repayTotal
  const interestIncome = numbers.interestIncome
  const disbursedTotal = numbers.disbursedTotal

  const netProfit = interestIncome + income - expensesTotal
  const cashBalance =
    (await getSetting('opening_cash')) + all.repayTotal + all.income - all.disbursedTotal - all.expensesTotal

  return {
    income,
    expensesTotal,
    repayTotal,
    interestIncome,
    disbursedTotal,
    outstandingBalance,
    netProfit,
    cashBalance,
  }
}

// Registered only by super_admin permanently: keep this router usable by finance roles
router.use(requireAuth, requireRole(...FINANCE_ROLES))

// Financial summary (dashboard cards). With ?q= and ?year= the flow figures
// (income/expenses/interest/net) are scoped to the quarter; cash balance is
// reported as of the quarter-end date, opening balance included.
router.get('/summary', async (req, res) => {
  try {
    const parsed = quarterFromQuery(req.query.q, req.query.year)
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const quarter = parsed.quarter

    const a = await financeAggregates()
    const period = await periodSums({ start: quarter.start, end: quarter.end })
    const cum = await cumulativeTo(quarter.end)

    const interestIncomeQuarter = period.interestIncome
    const otherIncomeQuarter = period.income
    const totalIncomeQuarter = interestIncomeQuarter + otherIncomeQuarter
    const expensesQuarter = period.expensesTotal
    const netProfitQuarter = totalIncomeQuarter - expensesQuarter
    const cashBalanceEnd =
      (await getSetting('opening_cash')) +
      cum.repayTotal +
      cum.income -
      cum.disbursedTotal -
      cum.expensesTotal

    res.json({
      summary: {
        // All-time figures (kept for compatibility with existing callers)
        total_income: a.income + a.interestIncome,
        other_income: a.income,
        interest_income: a.interestIncome,
        total_expenses: a.expensesTotal,
        net_profit: a.netProfit,
        cash_balance: a.cashBalance,
        outstanding_loans: a.outstandingBalance,
        // Selected quarter: flows during the quarter, balance as of period end
        quarter: {
          q: quarter.q,
          year: quarter.year,
          label: quarter.label,
          start: quarter.start,
          end: quarter.end,
          endExclusive: quarter.endExclusive,
          dateRangeLabel: quarter.dateRangeLabel,
        },
        income_quarter: otherIncomeQuarter,
        interest_income_quarter: interestIncomeQuarter,
        total_income_quarter: totalIncomeQuarter,
        expenses_quarter: expensesQuarter,
        net_profit_quarter: netProfitQuarter,
        repayments_received_quarter: period.repayTotal,
        disbursed_quarter: period.disbursedTotal,
        cash_balance_end: cashBalanceEnd,
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Profit & Loss (quarter-scoped with ?q=1-4&year=)
router.get('/pnl', async (req, res) => {
  try {
    const quarter = parseQuarter(req.query.q, req.query.year)
    const a = await financeAggregates({ start: quarter.start, end: quarter.end })
    res.json({
      pnl: {
        other_income: a.income,
        interest_income: a.interestIncome,
        total_income: a.income + a.interestIncome,
        total_expenses: a.expensesTotal,
        net_profit: a.netProfit,
        quarter: {
          q: quarter.q,
          year: quarter.year,
          label: quarter.label,
          start: quarter.start,
          end: quarter.end,
          dateRangeLabel: quarter.dateRangeLabel,
        },
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Cash flow (quarter-scoped with ?q=1-4&year=; cash balance stays "to date")
router.get('/cash-flow', async (req, res) => {
  try {
    const quarter = parseQuarter(req.query.q, req.query.year)
    const { start, end } = quarter
    const a = await financeAggregates({ start, end })
    const [repayByMonth, incomeByMonth, expenseByMonth, disbursedByMonth] = await Promise.all([
      queryAll(
        "SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month, SUM(amount) AS total FROM repayments WHERE payment_date BETWEEN ? AND ? GROUP BY month",
        [start, end],
      ),
      queryAll(
        "SELECT DATE_FORMAT(income_date, '%Y-%m') AS month, SUM(amount) AS total FROM incomes WHERE income_date BETWEEN ? AND ? GROUP BY month",
        [start, end],
      ),
      queryAll(
        "SELECT DATE_FORMAT(expense_date, '%Y-%m') AS month, SUM(amount) AS total FROM expenses WHERE expense_date BETWEEN ? AND ? GROUP BY month",
        [start, end],
      ),
      queryAll(
        `SELECT DATE_FORMAT(disbursement_date, '%Y-%m') AS month, SUM(disbursed_amount) AS total FROM loans
         WHERE disbursement_date IS NOT NULL AND status != 'cancelled' AND disbursement_date BETWEEN ? AND ?
         GROUP BY month`,
        [start, end],
      ),
    ])

    const months = []
    const d = new Date(`${start}T00:00:00Z`)
    const endYm = end.slice(0, 7)
    while (d.toISOString().slice(0, 7) <= endYm) {
      months.push(d.toISOString().slice(0, 7))
      d.setUTCMonth(d.getUTCMonth() + 1)
    }
    const get = (rows, month) => Number(rows.find((r) => r.month === month)?.total || 0)

    const monthly = months.map((m) => {
      const repaymentsIn = get(repayByMonth, m)
      const incomeIn = get(incomeByMonth, m)
      const expensesOut = get(expenseByMonth, m)
      const disbursedOut = get(disbursedByMonth, m)
      return {
        month: m,
        cashIn: repaymentsIn + incomeIn,
        cashOut: expensesOut + disbursedOut,
        net: repaymentsIn + incomeIn - expensesOut - disbursedOut,
      }
    })

    res.json({
      cashFlow: {
        cashIn: a.repayTotal + a.income,
        cashOut: a.expensesTotal + a.disbursedTotal,
        netCashFlow: a.repayTotal + a.income - a.expensesTotal - a.disbursedTotal,
        cashBalance: a.cashBalance,
        monthly,
        quarter: {
          q: quarter.q,
          year: quarter.year,
          label: quarter.label,
          start: quarter.start,
          end: quarter.end,
          dateRangeLabel: quarter.dateRangeLabel,
        },
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Balance sheet
router.get('/balance-sheet', async (req, res) => {
  try {
    const a = await financeAggregates()
    const [openingCash, equipment, ownerCapital, liabilities] = await Promise.all([
      getSetting('opening_cash'),
      getSetting('equipment_value'),
      getSetting('owner_capital'),
      getSetting('liabilities_value'),
    ])

    // Interest not yet earned on active loans (still included in outstanding balance)
    const unearnedInterest = Number(
      (
        await queryOne(
          `SELECT COALESCE(SUM(interest * outstanding_balance / NULLIF(total_payable, 0)), 0) AS s
           FROM loans WHERE status != 'cancelled'`,
        )
      ).s,
    )

    const assets = {
      cash_bank: a.cashBalance,
      loans_receivable: a.outstandingBalance,
      equipment,
      total: a.cashBalance + a.outstandingBalance + equipment,
    }
    const liabilitiesTotal = Number(liabilities) + unearnedInterest
    const equity = {
      owner_capital: ownerCapital,
      retained_earnings: a.netProfit,
      total: ownerCapital + a.netProfit,
    }
    const total = liabilitiesTotal + equity.total

    res.json({
      balanceSheet: {
        assets,
        liabilities: {
          payables: Number(liabilities),
          unearned_interest: unearnedInterest,
          total: liabilitiesTotal,
        },
        equity,
        total_liabilities_equity: total,
        difference: assets.total - total,
        settings: {
          opening_cash: openingCash,
          equipment_value: equipment,
          owner_capital: ownerCapital,
          liabilities_value: liabilitiesTotal,
        },
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

router.get('/settings', async (req, res) => {
  try {
    const [openingCash, equipment, ownerCapital, liabilities] = await Promise.all([
      getSetting('opening_cash'),
      getSetting('equipment_value'),
      getSetting('owner_capital'),
      getSetting('liabilities_value'),
    ])
    res.json({
      settings: {
        opening_cash: openingCash,
        equipment_value: equipment,
        owner_capital: ownerCapital,
        liabilities_value: liabilities,
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/settings', async (req, res) => {
  try {
    const b = req.body || {}
    const clean = {}
    for (const key of ['opening_cash', 'equipment_value', 'owner_capital', 'liabilities_value']) {
      const n = parseFloat(b[key])
      clean[key] = Number.isFinite(n) && n >= 0 ? n : 0
    }
    await setSettings(clean)

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'FINANCE_SETTINGS_CHANGED',
      description: `Updated finance settings: ${Object.entries(clean)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}`,
    })

    const [openingCash, equipment, ownerCapital, liabilities] = await Promise.all([
      getSetting('opening_cash'),
      getSetting('equipment_value'),
      getSetting('owner_capital'),
      getSetting('liabilities_value'),
    ])
    res.json({
      settings: {
        opening_cash: openingCash,
        equipment_value: equipment,
        owner_capital: ownerCapital,
        liabilities_value: liabilities,
      },
    })
  } catch (e) {
    handleError(res, e)
  }
})

// Income CRUD
router.get('/income', async (req, res) => {
  try {
    const where = []
    const params = {}
    const q = req.query
    if (q.search && q.search.trim() !== '') {
      where.push('(i.income_id LIKE @search OR i.description LIKE @search OR i.category LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (q.category && q.category !== '') {
      where.push('i.category = @category')
      params.category = q.category
    }
    if (q.from) {
      where.push('i.income_date >= @from')
      params.from = q.from
    }
    if (q.to) {
      where.push('i.income_date <= @to')
      params.to = q.to
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const rows = await queryAll(
      `SELECT i.*, u.full_name AS recorded_by_name
       FROM incomes i LEFT JOIN users u ON u.id = i.recorded_by
       ${clause} ORDER BY i.income_date DESC, i.id DESC LIMIT 500`,
      params,
    )
    res.json({ incomes: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/income', async (req, res) => {
  try {
    const { description, amount, category = 'Other Income', income_date, payment_method = 'Cash' } =
      req.body || {}
    if (!description || !amount || !income_date) {
      return res.status(400).json({ error: 'Description, amount and date are required.' })
    }
    const value = Number(amount)
    if (!(value > 0)) return res.status(400).json({ error: 'Invalid amount.' })

    const last = await queryOne('SELECT COUNT(*) AS c FROM incomes')
    const income_id = genId('INC', Number(last.c))
    const info = await run(
      `INSERT INTO incomes (income_id, description, amount, category, income_date, payment_method, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [income_id, description, value, category, income_date, payment_method, req.user.sub],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'INCOME_CREATED',
      description: `Recorded income ${income_id} of ${value} RWF (${description})`,
      relatedRecord: `income:${income_id}`,
    })

    const row = await queryOne('SELECT * FROM incomes WHERE id = ?', [info.lastInsertRowid])
    res.status(201).json({ income: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/income/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM incomes WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Income record not found.' })

    const b = req.body || {}
    const description = b.description !== undefined ? b.description : existing.description
    const amount = b.amount !== undefined ? Number(b.amount) : existing.amount
    const category = b.category !== undefined ? b.category : existing.category
    const income_date = b.income_date !== undefined ? b.income_date : existing.income_date
    const payment_method = b.payment_method !== undefined ? b.payment_method : existing.payment_method
    if (!description || !(amount > 0) || !income_date) {
      return res.status(400).json({ error: 'Description, amount and date are required.' })
    }

    await run(
      `UPDATE incomes SET description = ?, amount = ?, category = ?, income_date = ?, payment_method = ?
       WHERE id = ?`,
      [description, amount, category, income_date, payment_method, req.params.id],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'INCOME_UPDATED',
      description: `Updated income ${existing.income_id}`,
      relatedRecord: `income:${existing.income_id}`,
    })

    const row = await queryOne('SELECT * FROM incomes WHERE id = ?', [req.params.id])
    res.json({ income: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.delete('/income/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM incomes WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Income record not found.' })
    await run('DELETE FROM incomes WHERE id = ?', [req.params.id])
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'INCOME_DELETED',
      description: `Deleted income ${existing.income_id} (${existing.description})`,
      relatedRecord: `income:${existing.income_id}`,
    })
    res.json({ success: true })
  } catch (e) {
    handleError(res, e)
  }
})

// Expense CRUD
router.get('/expenses', async (req, res) => {
  try {
    const where = []
    const params = {}
    const q = req.query
    if (q.search && q.search.trim() !== '') {
      where.push('(e.expense_id LIKE @search OR e.description LIKE @search OR e.category LIKE @search)')
      params.search = `%${q.search.trim()}%`
    }
    if (q.category && q.category !== '') {
      where.push('e.category = @category')
      params.category = q.category
    }
    if (q.from) {
      where.push('e.expense_date >= @from')
      params.from = q.from
    }
    if (q.to) {
      where.push('e.expense_date <= @to')
      params.to = q.to
    }
    const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    const rows = await queryAll(
      `SELECT e.*, u.full_name AS recorded_by_name
       FROM expenses e LEFT JOIN users u ON u.id = e.recorded_by
       ${clause} ORDER BY e.expense_date DESC, e.id DESC LIMIT 500`,
      params,
    )
    res.json({ expenses: rows })
  } catch (e) {
    handleError(res, e)
  }
})

router.post('/expenses', async (req, res) => {
  try {
    const { description, amount, category = 'Other Expense', expense_date, payment_method = 'Cash' } =
      req.body || {}
    if (!description || !amount || !expense_date) {
      return res.status(400).json({ error: 'Description, amount and date are required.' })
    }
    const value = Number(amount)
    if (!(value > 0)) return res.status(400).json({ error: 'Invalid amount.' })

    const last = await queryOne('SELECT COUNT(*) AS c FROM expenses')
    const expense_id = genId('EXP', Number(last.c))
    const info = await run(
      `INSERT INTO expenses (expense_id, description, amount, category, expense_date, payment_method, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [expense_id, description, value, category, expense_date, payment_method, req.user.sub],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'EXPENSE_CREATED',
      description: `Recorded expense ${expense_id} of ${value} RWF (${description})`,
      relatedRecord: `expense:${expense_id}`,
    })

    const row = await queryOne('SELECT * FROM expenses WHERE id = ?', [info.lastInsertRowid])
    res.status(201).json({ expense: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.put('/expenses/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM expenses WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Expense record not found.' })

    const b = req.body || {}
    const description = b.description !== undefined ? b.description : existing.description
    const amount = b.amount !== undefined ? Number(b.amount) : existing.amount
    const category = b.category !== undefined ? b.category : existing.category
    const expense_date = b.expense_date !== undefined ? b.expense_date : existing.expense_date
    const payment_method = b.payment_method !== undefined ? b.payment_method : existing.payment_method
    if (!description || !(amount > 0) || !expense_date) {
      return res.status(400).json({ error: 'Description, amount and date are required.' })
    }

    await run(
      `UPDATE expenses SET description = ?, amount = ?, category = ?, expense_date = ?, payment_method = ?
       WHERE id = ?`,
      [description, amount, category, expense_date, payment_method, req.params.id],
    )

    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'EXPENSE_UPDATED',
      description: `Updated expense ${existing.expense_id}`,
      relatedRecord: `expense:${existing.expense_id}`,
    })

    const row = await queryOne('SELECT * FROM expenses WHERE id = ?', [req.params.id])
    res.json({ expense: row })
  } catch (e) {
    handleError(res, e)
  }
})

router.delete('/expenses/:id', async (req, res) => {
  try {
    const existing = await queryOne('SELECT * FROM expenses WHERE id = ?', [req.params.id])
    if (!existing) return res.status(404).json({ error: 'Expense record not found.' })
    await run('DELETE FROM expenses WHERE id = ?', [req.params.id])
    await writeAudit({
      userId: req.user.sub,
      userName: req.user.name,
      action: 'EXPENSE_DELETED',
      description: `Deleted expense ${existing.expense_id} (${existing.description})`,
      relatedRecord: `expense:${existing.expense_id}`,
    })
    res.json({ success: true })
  } catch (e) {
    handleError(res, e)
  }
})

export default router