import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { currentQuarter, quarterLabel } from '../../admin/quarters.js'
import { QuarterPicker } from '../../admin/QuarterPicker.jsx'
import { useI18n } from '../../i18n/index.jsx'

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
  { key: 'income', label: 'finance.income' },
  { key: 'expenses', label: 'finance.expenses' },
  { key: 'cashflow', label: 'finance.tab.cashflow' },
  { key: 'pnl', label: 'finance.tab.pnl' },
  { key: 'balance', label: 'finance.tab.balance' },
]

function LedgerTab({ kind }) {
  const { t } = useI18n()
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
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
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
    if (!window.confirm(t('finance.confirmDelete', { item: t(isIncome ? 'finance.income' : 'finance.expense') })))
      return
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
          placeholder={t(isIncome ? 'finance.searchIncome' : 'finance.searchExpenses')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t('finance.allCategories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          + {t('finance.recordTitle', { item: t(isIncome ? 'finance.income' : 'finance.expense') })}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t(isIncome ? 'finance.emptyIncome' : 'finance.emptyExpenses')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('finance.col.id')}</th>
                  <th>{t('finance.description')}</th>
                  <th>{t('finance.category')}</th>
                  <th>{t('ui.amount')}</th>
                  <th>{t('ui.date')}</th>
                  <th>{t('finance.method')}</th>
                  <th>{t('finance.recordedBy')}</th>
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
                        {t('finance.edit')}
                      </button>
                      <button
                        className="admin-btn-ghost admin-btn-danger"
                        onClick={() => remove(row)}
                      >
                        {t('finance.delete')}
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
              <h2>
                {current
                  ? t('finance.editTitle', { item: t(isIncome ? 'finance.income' : 'finance.expense') })
                  : t('finance.recordTitle', { item: t(isIncome ? 'finance.income' : 'finance.expense') })}
              </h2>
              <button className="admin-modal-close" onClick={() => setEditing(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>{t('finance.description')}</label>
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
                          <option value="_custom">{t('finance.other')}</option>
                        </select>
                        {!isPreset && (
                          <input
                            className="admin-input"
                            style={{ marginTop: 8 }}
                            placeholder={t('finance.customDescription')}
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
                  <label>{t('finance.amountRwf')}</label>
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
                  <label>{t('finance.category')}</label>
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
                  <label>{t('ui.date')}</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('finance.paymentMethod')}</label>
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
                {t('ui.cancel')}
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={save}
                disabled={saving || !form.description || !form.amount || !form.date}
              >
                {saving ? t('finance.saving') : t('ui.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CashFlowTab({ quarter }) {
  const { t } = useI18n()
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
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  if (error) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!data) return <Loading />

  const qLabel = data.quarter ? data.quarter.label : quarterLabel(quarter.q, quarter.year)

  const cards = [
    { label: t('finance.cashInQ', { q: qLabel }), value: data.cashIn, accent: 'accent-green', icon: '⬇️' },
    { label: t('finance.cashOutQ', { q: qLabel }), value: data.cashOut, accent: 'accent-red', icon: '⬆️' },
    { label: t('finance.netCashFlowQ', { q: qLabel }), value: data.netCashFlow, accent: 'accent-teal', icon: '🌊' },
    { label: t('finance.cashBalance'), value: data.cashBalance, accent: 'accent-gold', icon: '🏦' },
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
            {t('finance.monthlyCashFlow')}
            {data.quarter && (
              <span className="quarter-range">
                {data.quarter.label} · {data.quarter.dateRangeLabel}
              </span>
            )}
          </h2>
        </div>
        <div className="admin-panel-body" style={{ padding: 0 }}>
          {data.monthly.length === 0 ? (
            <Empty message={t('finance.noCash')} />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{t('finance.month')}</th>
                    <th>{t('finance.cashInCol')}</th>
                    <th>{t('finance.cashOutCol')}</th>
                    <th>{t('finance.net')}</th>
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
  const { t } = useI18n()
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
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  if (error) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!pnl) return <Loading />

  const rows = [
    { label: t('finance.otherIncome'), value: pnl.other_income, note: t('finance.otherIncomeNote') },
    { label: t('finance.interestReceived'), value: pnl.interest_income, note: t('finance.interestNote') },
    { label: t('finance.totalIncome'), value: pnl.total_income, total: true },
    { label: t('finance.totalExpenses'), value: pnl.total_expenses, total: true },
    { label: t('finance.netProfitLoss'), value: pnl.net_profit, net: true },
  ]

  return (
    <div className="admin-panel">
      <div className="admin-panel-head">
        <h2>
          {t('finance.pnlTitle')}
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
                <th>{t('finance.lineItem')}</th>
                <th>{t('finance.amountRwf')}</th>
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
  const { t } = useI18n()
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
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
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
    { key: 'opening_cash', label: 'finance.openingCash' },
    { key: 'equipment_value', label: 'finance.equipmentValue' },
    { key: 'owner_capital', label: 'finance.ownerCapitalSetting' },
    { key: 'liabilities_value', label: 'finance.liabilitiesValue' },
  ]

  return (
    <>
      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-grid-2">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>{t('finance.assets')} <span className="quarter-range">{t('finance.asOfToday')}</span></h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>{t('finance.cashBank')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.cash_bank)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.loansReceivable')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.loans_receivable)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.equipment')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.equipment)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                    <td>{t('finance.totalAssets')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(assets.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>{t('finance.liabilitiesEquity')} <span className="quarter-range">{t('finance.asOfToday')}</span></h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <tbody>
                  <tr>
                    <td>{t('finance.payables')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(liabilities.payables)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.unearnedInterest')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(liabilities.unearned_interest)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.ownerCapital')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(equity.owner_capital)}</td>
                  </tr>
                  <tr>
                    <td>{t('finance.retainedEarnings')}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(equity.retained_earnings)}</td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 600 }}>
                    <td>{t('finance.totalLiabilitiesEquity')}</td>
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
        <strong>{t('finance.balanceCheck')}</strong>{' '}
        {Math.abs(data.difference) < 0.005
          ? t('finance.balanceOk')
          : t('finance.balanceOff', { amount: formatCurrency(data.difference) })}
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>{t('finance.balanceSettings')}</h2>
        </div>
        <div className="admin-panel-body">
          <div className="admin-form-grid">
            {settingsLabels.map((f) => (
              <div className="admin-form-group" key={f.key}>
                <label>{t(f.label)}</label>
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
            {saving ? t('finance.saving') : t('finance.saveBalances')}
          </button>
        </div>
      </div>
    </>
  )
}

function Finance() {
  const { t } = useI18n()
  const defaultQuarter = currentQuarter()
  const [tab, setTab] = useState('income')
  const [quarterQ, setQuarterQ] = useState(defaultQuarter.q)
  const [quarterYear, setQuarterYear] = useState(defaultQuarter.year)
  const isQuarterTab = tab === 'cashflow' || tab === 'pnl'

  return (
    <>
      <div className="admin-tabs">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.key}
            className={`admin-tab ${tab === tabItem.key ? 'active' : ''}`}
            onClick={() => setTab(tabItem.key)}
          >
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      {isQuarterTab && (
        <div className="quarter-bar" style={{ marginTop: 18 }}>
          <div>
            <strong>{t('finance.quarter')}</strong>
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