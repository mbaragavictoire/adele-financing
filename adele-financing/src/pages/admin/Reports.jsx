import { useEffect, useState, useCallback } from 'react'
import { apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'
import { useI18n } from '../../i18n/index.jsx'

const TABS = [
  { key: 'customers', label: 'reports.customers', path: '/reports/customers', cols: ['customer_id','registration_date','full_name','phone_number','gender','status'] },
  { key: 'applications', label: 'reports.applications', path: '/reports/applications', cols: ['application_id','customer_name','product_name','requested_amount','duration','status','application_date'] },
  { key: 'approved', label: 'reports.approved', path: '/reports/approved', cols: ['application_id','customer_name','approved_amount','approved_duration','interest_rate','approved_at'] },
  { key: 'rejected', label: 'reports.rejected', path: '/reports/rejected', cols: ['application_id','customer_name','requested_amount','rejection_reason','rejected_at'] },
  { key: 'loans', label: 'reports.loans', path: '/reports/loans', cols: ['loan_id','customer_name','principal','interest','total_payable','amount_paid','outstanding_balance','status'] },
  { key: 'outstanding', label: 'reports.outstanding', path: '/reports/outstanding', cols: ['loan_id','customer_name','total_payable','amount_paid','outstanding_balance','due_date'] },
  { key: 'completed', label: 'reports.completed', path: '/reports/completed', cols: ['loan_id','customer_name','principal','total_payable','amount_paid','start_date','due_date'] },
  { key: 'repayments', label: 'reports.repayments', path: '/reports/repayments', cols: ['repayment_id','customer_name','loan_id','amount','payment_date','payment_method','reference_number'] },
]

// Neutralises HTML metacharacters so database content is rendered as text.
// Needed because applicant names arrive from the anonymous public form.
function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"'`]/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;',
      })[c],
  )
}

const COLUMN_LABELS = {
  customer_id: 'reports.col.customerId',
  full_name: 'reports.col.fullName',
  phone_number: 'reports.col.phone',
  gender: 'reports.col.gender',
  status: 'ui.status',
  registration_date: 'ui.date',
  application_id: 'reports.col.application',
  customer_name: 'reports.col.customer',
  product_name: 'reports.col.product',
  requested_amount: 'reports.col.requested',
  duration: 'reports.col.period',
  application_date: 'ui.date',
  approved_amount: 'reports.col.approvedAmount',
  approved_duration: 'reports.col.period',
  interest_rate: 'reports.col.interestRate',
  approved_at: 'reports.col.approvedAt',
  rejection_reason: 'reports.col.reason',
  rejected_at: 'reports.col.rejectedAt',
  loan_id: 'reports.col.loanId',
  principal: 'reports.col.principal',
  interest: 'reports.col.interest',
  total_payable: 'reports.col.totalPayable',
  amount_paid: 'status.paid',
  outstanding_balance: 'reports.col.balance',
  start_date: 'reports.col.start',
  due_date: 'reports.col.due',
  repayment_id: 'reports.col.repayment',
  payment_date: 'ui.date',
  payment_method: 'reports.col.method',
  reference_number: 'reports.col.reference',
}

function Reports() {
  const { user } = useAuth()
  const { t } = useI18n()
  const canFinance = ['super_admin', 'finance_officer'].includes(user?.role)
  const [tab, setTab] = useState(canFinance ? 'repayments' : 'customers')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')

  const visibleTabs = canFinance ? TABS : TABS.filter((tabItem) => tabItem.key !== 'repayments')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const active = visibleTabs.find((tabItem) => tabItem.key === tab)
      const params = {}
      if (from) params.from = from
      if (to) params.to = to
      const data = await apiGet(active.path, params)
      setRows(data.rows || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [tab, from, to, visibleTabs])

  useEffect(() => {
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
  }, [load])

  const activeTab = visibleTabs.find((tabItem) => tabItem.key === tab)

  function printReport() {
    const win = window.open('', '_blank')
    if (!win) return
    // Every value below originates from the database, and applicant names can be
    // submitted by anonymous visitors through the public form. Escaping is what
    // stops a crafted name from executing as script in this same-origin window.
    const head = `<h1>ADELE Financing — ${escapeHtml(t('reports.printTitle', { tab: t(activeTab.label) }))}</h1>`
    const dateRange =
      from || to
        ? `<p>${escapeHtml(t('reports.period'))}: ${escapeHtml(from || t('reports.periodStart'))} → ${escapeHtml(to || t('reports.periodToday'))}</p>`
        : ''
    const printCss = `
      @media print {
        @page { margin: 0; }
        body { padding: 15mm 18mm; font-family: 'Segoe UI', sans-serif; color: #111; }
        h1 { margin-top: 0; font-size: 18pt; }
        p { margin: 2px 0 6px; }
        table { border-collapse: collapse; width: 100%; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { text-align: left; background: #f1f5f9; }
      }
    `
    const table = `
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">
        <thead>
          <tr>${activeTab.cols
            .map((c) => `<th>${escapeHtml(COLUMN_LABELS[c] ? t(COLUMN_LABELS[c]) : c)}</th>`)
            .join('')}</tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) =>
                `<tr>${activeTab.cols
                  .map((c) => {
                    let v = r[c]
                    if (['amount','requested_amount','approved_amount','principal','interest','total_payable','amount_paid','outstanding_balance'].includes(c)) {
                      v = formatCurrency(v)
                    }
                    if (['registration_date','application_date','approved_at','rejected_at','start_date','due_date','payment_date'].includes(c)) {
                      v = formatDate(v)
                    }
                    return `<td>${escapeHtml(v ?? '-')}</td>`
                  })
                  .join('')}
                </tr>`,
            )
            .join('')}
        </tbody>
      </table>`
    win.document.write(`
      <html><head><title>${escapeHtml(t('reports.printTitle', { tab: t(activeTab.label) }))}</title>
      <style>${printCss}</style></head>
      <body>${head}${dateRange}${table}
      <script>window.print()</script></body></html>`)
    win.document.close()
  }

  function exportCsv() {
    // A leading =, +, -, @ or control char makes spreadsheet software treat the
    // cell as a formula, so those values are prefixed with an apostrophe.
    const csvCell = (raw) => {
      let value = String(raw ?? '')
      if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`
      return `"${value.replace(/"/g, '""')}"`
    }
    const header = activeTab.cols.map((c) => csvCell(COLUMN_LABELS[c] ? t(COLUMN_LABELS[c]) : c)).join(',')
    const lines = rows.map((r) => activeTab.cols.map((c) => csvCell(r[c])).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t(activeTab.label)}-report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="admin-tabs">
        {visibleTabs.map((tabItem) => (
          <button
            key={tabItem.key}
            className={`admin-tab ${tab === tabItem.key ? 'active' : ''}`}
            onClick={() => setTab(tabItem.key)}
          >
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      <div className="admin-toolbar">
        <input
          type="date"
          className="admin-input"
          style={{ width: 160 }}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span>→</span>
        <input
          type="date"
          className="admin-input"
          style={{ width: 160 }}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <div className="spacer" />
        <button className="admin-btn" onClick={exportCsv} disabled={rows.length === 0}>
          ⬇ {t('reports.exportCsv')}
        </button>
        <button className="admin-btn" onClick={printReport} disabled={rows.length === 0}>
          🖨 {t('reports.print')}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('reports.empty')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {activeTab.cols.map((c) => (
                    <th key={c}>{COLUMN_LABELS[c] ? t(COLUMN_LABELS[c]) : c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {activeTab.cols.map((c) => {
                      let v = r[c]
                      if (
                        [
                          'amount',
                          'requested_amount',
                          'approved_amount',
                          'principal',
                          'interest',
                          'total_payable',
                          'amount_paid',
                          'outstanding_balance',
                        ].includes(c)
                      ) {
                        v = formatCurrency(v)
                      }
                      if (
                        [
                          'registration_date',
                          'application_date',
                          'approved_at',
                          'rejected_at',
                          'start_date',
                          'due_date',
                          'payment_date',
                        ].includes(c)
                      ) {
                        v = formatDate(v)
                      }
                      return <td key={c}>{v ?? '-'}</td>
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default Reports