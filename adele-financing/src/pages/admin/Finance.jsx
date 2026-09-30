import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { currentQuarter, quarterLabel } from '../../admin/quarters.js'
import { QuarterPicker } from '../../admin/QuarterPicker.jsx'

const INCOME_CATEGORIES = [
  'Loan Interest',
  'Application Fees',
  'Service Fees',
  'Penalties',
  'Other Income',
]
const EXPENSE_CATEGORIES = [
  'Salaries',
  'Rent',
  'Electricity',
  'Internet',
  'Transport',
  'Office Supplies',
  'Bank Charges',
  'Other Expense',
]
const EXPENSE_DESCRIPTIONS = [
  'Staff salaries',
  'Rent – office',
  'Electricity bill',
  'Internet fees',
  'Transport / fuel',
  'Office supplies',
  'Printing & stationery',
  'Bank charges',
  'Mobile money fees',
  'Cleaning',
  'Security',
  'Other Expense',
]
const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Mobile Money', 'Cheque']

const TABS = [
  { key: 'income', label: 'Income' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'cashflow', label: 'Cash Flow' },
  { key: 'pnl', label: 'Profit & Loss' },
  { key: 'balance', label: 'Balance Sheet' },
]

function LedgerTab({ kind }) {
  const isIncome = kind === 'income'
  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(false)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (category) params.category = category
      const data = await apiGet(`/finance/${kind}`, params)
      setRows(isIncome ? data.incomes || [] : data.expenses || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [kind, isIncome, search, category])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  function openNew() {
    setCurrent(false)
    setForm({
      description: isIncome ? '' : EXPENSE_DESCRIPTIONS[0],
      amount: '',
      category: categories[0],
      date: '',
      payment_method: 'Cash',
    })
    setError('')
    setEditing(true)
  }

  function openEdit(row) {
    setCurrent(row)
    setForm({
      description: row.description,
      amount: row.amount,
      category: row.category,
      date: isIncome ? row.income_date : row.expense_date,
      payment_method: row.payment_method,
    })
    setError('')
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const payload = { ...form, [isIncome ? 'income_date' : 'expense_date']: form.date }
      if (current) {
        await api(`/finance/${kind === 'income' ? 'income' : 'expenses'}/${current.id}`, {
          method: 'PUT',
          body: payload,
        })
      } else {
        await api(`/finance/${kind === 'income' ? 'income' : 'expenses'}`, {
          method: 'POST',
          body: payload,
        })
      }
      setEditing(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove(row) {
    if (!window.confirm(`Delete this ${kind.slice(0, -1)} record?`)) return
    try {
      await api(`/finance/${kind === 'income' ? 'income' : 'expenses'}/${row.id}`, {
        method: 'DELETE',
      })
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder={`Search ${kind}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          + Record {isIncome ? 'Income' : 'Expense'}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={`No ${kind} recorded yet.`} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Recorded By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row[isIncome ? 'income_id' : 'expense_id']}</td>
                    <td>{row.description}</td>
                    <td>{row.category}</td>
                    <td>{formatCurrency(row.amount)}</td>
                    <td>{formatDate(row[isIncome ? 'income_date' : 'expense_date'])}</td>
                    <td>{row.payment_method}</td>
                    <td>{row.recorded_by_name || '-'}</td>
                    <td>
                      <button
                        className="admin-btn-ghost"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        className="admin-btn-ghost admin-btn-danger"
                        onClick={() => remove(row)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div className="admin-modal-overlay" onClick={() => setEditing(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{current ? `Edit ${isIncome ? 'Income' : 'Expense'}` : `Record ${isIncome ? 'Income' : 'Expense'}`}</h2>
              <button className="admin-modal-close" onClick={() => setEditing(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>Description</label>
                  {isIncome ? (
                    <input
                      className="admin-input"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      required
                    />
                  ) : (() => {
                    const isPreset = EXPENSE_DESCRIPTIONS.includes(form.description)
                    const selectValue = isPreset ? form.description : '_custom'
                    return (
                      <>
                        <select
                          className="admin-select"
                          value={selectValue}
                          onChange={(e) => {
                            const v = e.target.value
                            setForm((f) => ({
                              ...f,
                              description: v === '_custom' ? '' : v,
                            }))
                          }}
                        >
                          {EXPENSE_DESCRIPTIONS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          <option value="_custom">Other…</option>
                        </select>
                        {!isPreset && (
                          <input
                            className="admin-input"
                            style={{ marginTop: 8 }}
                            placeholder="Type a custom description…"
                            value={form.description}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                description: e.target.value,
                              }))
                            }
                            required
                          />
                        )}
                      </>
                    )
                  })()}
                </div>
                <div className="admin-form-group">
                  <label>Amount (RWF)</label>
                  <input
                    className="admin-input"
                    type="number"
                    min="0"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Category</label>
                  <select
                    className="admin-select"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>Date</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Payment Method</label>
                  <select
                    className="admin-select"
                    value={form.payment_method}
                    onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={save}
                disabled={saving || !form.description || !form.amount || !form.date}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CashFlowTab({ quarter }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet(`/finance/cash-flow?q=${quarter.q}&year=${quarter.year}`)
      setData(res.cashFlow)
    } catch (e) {
      setError(e.message)
    }
  }, [quarter.q, quarter.year])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (error) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!data) return <Loading />

  const qLabel = data.quarter ? data.quarter.label : quarterLabel(quarter.q, quarter.year)

  const cards = [
    { label: `Cash In · ${qLabel}`, value: data.cashIn, accent: 'accent-green', icon: '⬇️' },
    { label: `Cash Out · ${qLabel}`, value: data.cashOut, accent: 'accent-red', icon: '⬆️' },
    { label: `Net Cash Flow · ${qLabel}`, value: data.netCashFlow, accent: 'accent-teal', icon: '🌊' },
    { label: 'Cash Balance (to date)', value: data.cashBalance, accent: 'accent-gold', icon: '🏦' },
  ]

  return (
    <>
      <div className="admin-cards">
        {cards.map((c) => (
          <div className="admin-card" key={c.label}>
            <div className={`admin-card-accent ${c.accent}`}>{c.icon}</div>
            <div className="admin-card-label">{c.label}</div>
            <div className="admin-card-value">{formatCurrency(c.value)}</div>
          </div>
        ))}
      </div>
      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>
            Monthly Cash Flow
            {data.quarter && (
              <span className="quarter-range">
                {data.quarter.label} · {data.quarter.dateRangeLabel}
              </span>
            )}
          </h2>
        </div>
        <div className="admin-panel-body" style={{ padding: 0 }}>
          {data.monthly.length === 0 ? (
            <Empty message="No cash activity yet." />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Cash In</th>
                    <th>Cash Out</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthly.map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td>{formatCurrency(m.cashIn)}</td>
                      <td>{formatCurrency(m.cashOut)}</td>
                      <td>{formatCurrency(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PnlTab({ quarter }) {
  const [pnl, setPnl] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await apiGet(`/finance/pnl?q=${quarter.q}&year=${quarter.year}`)
      setPnl(res.pnl)
    } catch (e) {
      setError(e.message)
    }
  }, [quarter.q, quarter.year])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (error) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!pnl) return <Loading />

  const rows = [
    { label: 'Other Income', value: pnl.other_income, note: 'Application fees, service fees, penalties, etc.' },
    { label: 'Loan Interest Received', value: pnl.interest_income, note: 'Interest portion of loan repayments.' },
    { label: 'Total Income', value: pnl.total_income, total: true },
    { label: 'Total Expenses', value: pnl.total_expenses, total: true },
    { label: 'Net Profit / Loss', value: pnl.net_profit, net: true },
  ]

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h2>
          Profit &amp; Loss Statement
          {pnl.quarter && (
            <span className="quarter-range">
              {pnl.quarter.label} · {pnl.quarter.dateRangeLabel}
            </span>
          )}
        </h2>
      </div>
      <div className="admin-panel-body" style={{ padding: 0 }}>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Line Item</th>
                <th>Amount (RWF)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} style={r.total ? { background: '#f8fafc', fontWeight: 600 } : undefined}>
                  <td>
                    {r.label}
                    {r.note && (
                      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>{r.note}</div>
                    )}
                  </td>
                  <td style={r.net ? { color: pnl.net_profit < 0 ? '#dc2626' : '#0f9d8f' } : undefined}>
                    {formatCurrency(r.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function BalanceSheetTab() {
  const [data, setData] = useState(null)
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiGet('/finance/balance-sheet')
      setData(res.balanceSheet)
      setForm(res.balanceSheet.settings)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  async function saveSettings() {
    setSaving(true)
    setError('')
    try {
      await api('/finance/settings', { method: 'PUT', body: form })
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (error && !data) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!data) return <Loading />

  const { assets, liabilities, equity } = data
  const settingsLabels = [
    { key: 'opening_cash', label: 'Opening Cash / Bank (RWF)' },
    { key: 'equipment_value', label: 'Equipment Value (RWF)' },
    { key: 'owner_capital', label: "Owner's Capital (RWF)" },
    { key: 'liabilities_value', label: 'Company Payables (RWF)' },
  ]

  return (
    <>
      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-grid-2">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Assets <span className="quarter-range">as of today</span></h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>Cash / Bank</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.cash_bank)}</td>
                  </tr>
                  <tr>
                    <td>Loans Receivable</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.loans_receivable)}</td>
                  </tr>
                  <tr>
                    <td>Equipment</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.equipment)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                    <td>Total Assets</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Liabilities &amp; Equity <span className="quarter-range">as of today</span></h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>Company Payables</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(liabilities.payables)}</td>
                  </tr>
                  <tr>
                    <td>Unearned Interest</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(liabilities.unearned_interest)}</td>
                  </tr>
                  <tr>
                    <td>Owner's Capital</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(equity.owner_capital)}</td>
                  </tr>
                  <tr>
                    <td>Retained Earnings</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(equity.retained_earnings)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                    <td>Total Liabilities + Equity</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatCurrency(data.total_liabilities_equity)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div
        className={`admin-alert ${
          Math.abs(data.difference) < 0.005
            ? 'admin-alert-success'
            : 'admin-alert-warning'
        }`}
      >
        <strong>Balance check:</strong>{' '}
        {Math.abs(data.difference) < 0.005
          ? 'Assets = Liabilities + Equity ✓'
          : `Assets − (Liabilities + Equity) = ${formatCurrency(data.difference)}. Adjust opening balances below so the equation balances.`}
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Balance Sheet Settings</h2>
        </div>
        <div className="admin-panel-body">
          <div className="admin-form-grid">
            {settingsLabels.map((f) => (
              <div className="admin-form-group" key={f.key}>
                <label>{f.label}</label>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={form[f.key] ?? 0}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <button
            className="admin-btn admin-btn-primary"
            onClick={saveSettings}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Opening Balances'}
          </button>
        </div>
      </div>
    </>
  )
}

function Finance() {
  const defaultQuarter = currentQuarter()
  const [tab, setTab] = useState('income')
  const [quarterQ, setQuarterQ] = useState(defaultQuarter.q)
  const [quarterYear, setQuarterYear] = useState(defaultQuarter.year)
  const isQuarterTab = tab === 'cashflow' || tab === 'pnl'

  return (
    <>
      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isQuarterTab && (
        <div className="quarter-bar" style={{ marginTop: 18 }}>
          <div>
            <strong>Reporting Quarter</strong>
            <span className="quarter-range">{quarterLabel(quarterQ, quarterYear)}</span>
          </div>
          <QuarterPicker
            q={quarterQ}
            year={quarterYear}
            onChange={(q, y) => {
              setQuarterQ(q)
              setQuarterYear(y)
            }}
          />
        </div>
      )}

      {tab === 'income' && <LedgerTab kind="income" />}
      {tab === 'expenses' && <LedgerTab kind="expenses" />}
      {tab === 'cashflow' && <CashFlowTab quarter={{ q: quarterQ, year: quarterYear }} />}
      {tab === 'pnl' && <PnlTab quarter={{ q: quarterQ, year: quarterYear }} />}
      {tab === 'balance' && <BalanceSheetTab />}
    </>
  )
}

export default Finance