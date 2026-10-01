import { useEffect, useState, useCallback } from 'react'
import { apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'

const TABS = [
  { key: 'customers', label: 'Customers', path: '/reports/customers', cols: ['customer_id','registration_date','full_name','phone_number','gender','status'] },
  { key: 'applications', label: 'Applications', path: '/reports/applications', cols: ['application_id','customer_name','product_name','requested_amount','duration','status','application_date'] },
  { key: 'approved', label: 'Approved', path: '/reports/approved', cols: ['application_id','customer_name','approved_amount','approved_duration','interest_rate','approved_at'] },
  { key: 'rejected', label: 'Rejected', path: '/reports/rejected', cols: ['application_id','customer_name','requested_amount','rejection_reason','rejected_at'] },
  { key: 'loans', label: 'Loans', path: '/reports/loans', cols: ['loan_id','customer_name','principal','interest','total_payable','amount_paid','outstanding_balance','status'] },
  { key: 'outstanding', label: 'Outstanding', path: '/reports/outstanding', cols: ['loan_id','customer_name','total_payable','amount_paid','outstanding_balance','due_date'] },
  { key: 'completed', label: 'Completed', path: '/reports/completed', cols: ['loan_id','customer_name','principal','total_payable','amount_paid','start_date','due_date'] },
  { key: 'repayments', label: 'Repayments', path: '/reports/repayments', cols: ['repayment_id','customer_name','loan_id','amount','payment_date','payment_method','reference_number'] },
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
  customer_id: 'Customer ID',
  full_name: 'Full Name',
  phone_number: 'Phone',
  gender: 'Gender',
  status: 'Status',
  registration_date: 'Date',
  application_id: 'Application',
  customer_name: 'Customer',
  product_name: 'Product',
  requested_amount: 'Requested',
  duration: 'Period',
  application_date: 'Date',
  approved_amount: 'Approved Amount',
  approved_duration: 'Period',
  interest_rate: 'Interest %',
  approved_at: 'Approved Date',
  rejection_reason: 'Reason',
  rejected_at: 'Rejected Date',
  loan_id: 'Loan ID',
  principal: 'Principal',
  interest: 'Interest',
  total_payable: 'Total Payable',
  amount_paid: 'Paid',
  outstanding_balance: 'Balance',
  start_date: 'Start',
  due_date: 'Due',
  repayment_id: 'Repayment',
  payment_date: 'Date',
  payment_method: 'Method',
  reference_number: 'Reference',
}

function Reports() {
  const { user } = useAuth()
  const canFinance = ['super_admin', 'finance_officer'].includes(user?.role)
  const [tab, setTab] = useState(canFinance ? 'repayments' : 'customers')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')

  const visibleTabs = canFinance ? TABS : TABS.filter((t) => t.key !== 'repayments')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const active = visibleTabs.find((t) => t.key === tab)
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
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  const activeTab = visibleTabs.find((t) => t.key === tab)

  function printReport() {
    const win = window.open('', '_blank')
    if (!win) return
    // Every value below originates from the database, and applicant names can be
    // submitted by anonymous visitors through the public form. Escaping is what
    // stops a crafted name from executing as script in this same-origin window.
    const head = `<h1>ADELE Financing — ${escapeHtml(activeTab.label)} Report</h1>`
    const dateRange =
      from || to
        ? `<p>Period: ${escapeHtml(from || 'start')} → ${escapeHtml(to || 'today')}</p>`
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
            .map((c) => `<th>${escapeHtml(COLUMN_LABELS[c] || c)}</th>`)
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
      <html><head><title>${escapeHtml(activeTab.label)} Report</title>
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
    const header = activeTab.cols.map((c) => csvCell(COLUMN_LABELS[c] || c)).join(',')
    const lines = rows.map((r) => activeTab.cols.map((c) => csvCell(r[c])).join(','))
    const csv = [header, ...lines].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTab.label}-report.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="admin-tabs">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
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
          ⬇ Export CSV
        </button>
        <button className="admin-btn" onClick={printReport} disabled={rows.length === 0}>
          🖨 Print
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No data for this report." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  {activeTab.cols.map((c) => (
                    <th key={c}>{COLUMN_LABELS[c] || c}</th>
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