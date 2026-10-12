import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading, PhoneInput } from '../../admin/ui.jsx'
import { isValidRwPhone } from '../../admin/phone.js'

const emptyCustomer = {
  full_name: '',
  phone_number: '',
  email: '',
  gender: '',
  amount: '',
  duration: '',
  status: 'active',
  registration_date: new Date().toISOString().slice(0, 10),
}

const normHeader = (h) =>
  String(h ?? '').toLowerCase().replace(/[\s_-]+/g, '').trim()

function toIsoDate(value) {
  if (value == null || value === '') return ''
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10)
  let s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (s.length === 10 && s[4] === '/' && s[7] === '/' && /^\d{10}$/.test(s.split('/').join(''))) {
    return `${s.slice(0, 4)}-${s.slice(5, 7)}-${s.slice(8, 10)}`
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const ms = Math.round((Number(s) - 25569) * 86400 * 1000)
    const d = new Date(ms)
    return isNaN(d) ? '' : d.toISOString().slice(0, 10)
  }
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (m) {
    let [, day, mon, year] = m
    if (year.length === 2) year = Number(year) > 50 ? '19' + year : '20' + year
    return `${year}-${mon.padStart(2, '0')}-${day.padStart(2, '0')}`
  }
  const d = new Date(s)
  return isNaN(d) ? '' : d.toISOString().slice(0, 10)
}

function mapSheetRows(json) {
  const out = []
  for (const obj of json) {
    const keys = Object.keys(obj)
    if (keys.length > 0 && keys.every((k) => /^[A-Z]+$/.test(k))) {
      const cell = (name) => obj[name] ?? ''
      const full_name = String(cell('A')).trim()
      const phone_number = String(cell('B')).replace(/[^\d+]/g, '')
      const gender = String(cell('C')).trim()
      const email = String(cell('D')).trim()
      const amount = Number(cell('E'))
      const duration = Number(cell('F'))
      const status = String(cell('G')).trim().toLowerCase()
      const registration_date = toIsoDate(cell('H')) || new Date().toISOString().slice(0, 10)
      if (full_name || phone_number || gender || email || cell('E') || cell('F')) {
        out.push({
          full_name,
          phone_number,
          gender,
          email,
          amount: Number.isFinite(amount) ? amount : 0,
          duration: Number.isFinite(duration) ? duration : 0,
          status: status === 'inactive' ? 'inactive' : 'active',
          registration_date,
        })
      }
      continue
    }
    const lower = {}
    for (const key of keys) lower[normHeader(key)] = key
    const get = (aliases) => {
      for (const a of aliases) {
        const k = normHeader(a)
        if (k in lower) return obj[lower[k]]
      }
      return ''
    }
    const full_name = String(get(['full_name', 'name'])).trim()
    const phone_number = String(get(['phone_number', 'phone', 'mobile', 'tel'])).replace(/[^\d+]/g, '')
    const gender = String(get(['gender'])).trim()
    const email = String(get(['email', 'mail'])).trim()
    const amount = Number(get(['amount']))
    const duration = Number(get(['duration', 'months', 'period', 'periodmonths', 'periodmonth', 'term']))
    const status = String(get(['status'])).trim().toLowerCase()
    const registration_date = toIsoDate(get(['registration_date', 'date', 'regdate', 'registered'])) || new Date().toISOString().slice(0, 10)
    if (!full_name && !phone_number) continue
    out.push({
      full_name,
      phone_number,
      gender,
      email,
      amount: Number.isFinite(amount) ? amount : 0,
      duration: Number.isFinite(duration) ? duration : 0,
      status: status === 'inactive' ? 'inactive' : 'active',
      registration_date,
    })
  }
  return out
}

function Customers() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [viewing, setViewing] = useState(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(emptyCustomer)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importedRows, setImportedRows] = useState([])
  const [importFileName, setImportFileName] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (status) params.status = status
      const data = await apiGet('/customers', params)
      setRows(data.customers)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function openNew() {
    setForm(emptyCustomer)
    setEditing(true)
    setError('')
  }

  async function openEdit(c) {
    setForm({
      full_name: c.full_name,
      phone_number: c.phone_number,
      email: c.email || '',
      gender: c.gender || '',
      amount: c.amount ?? '',
      duration: c.duration ?? '',
      status: c.status,
      registration_date: c.registration_date || new Date().toISOString().slice(0, 10),
    })
    setViewing(c)
    setEditing(true)
    setError('')
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      if (viewing?.id) {
        await api(`/customers/${viewing.id}`, { method: 'PUT', body: form })
      } else {
        await api('/customers', { method: 'POST', body: form })
      }
      setEditing(false)
      setViewing(null)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function viewCustomer(c) {
    try {
      const data = await apiGet(`/customers/${c.id}`)
      setViewing({
        ...data.customer,
        loans: data.loans || [],
        current_loans: data.current_loans || [],
        previous_loans: data.previous_loans || [],
        completed_loans: data.completed_loans || [],
        applications: data.applications || [],
        repayments: data.repayments || [],
        outstanding_balance: data.outstanding_balance ?? 0,
      })
      setForm({
        full_name: data.customer.full_name,
        phone_number: data.customer.phone_number,
        email: data.customer.email || '',
        gender: data.customer.gender || '',
        amount: data.customer.amount ?? '',
        duration: data.customer.duration ?? '',
        status: data.customer.status,
        registration_date: data.customer.registration_date || new Date().toISOString().slice(0, 10),
      })
    } catch (e) {
      setError(e.message)
    }
  }

  async function removeCustomer(c) {
    if (!window.confirm(`Delete customer ${c.full_name}? This cannot be undone.`)) return
    try {
      await api(`/customers/${c.id}`, { method: 'DELETE' })
      if (viewing?.id === c.id) {
        setViewing(null)
        setEditing(false)
      }
      await load()
    } catch (e) {
      alert(e.message)
    }
  }

  function change(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function parseWorkbook(file) {
    try {
      const XLSX = await import('xlsx')
      const isCsv = /\.csv$/i.test(file.name)
      const data = isCsv ? await file.text() : await file.arrayBuffer()
      const wb = XLSX.read(data, isCsv ? { type: 'string' } : { type: 'array', cellDates: true })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
      setImportedRows(mapSheetRows(json))
      setImportResult(null)
    } catch (err) {
      setImportResult({ error: 'Could not read this file: ' + err.message })
    }
  }

  async function doImport() {
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api('/customers/bulk', {
        method: 'POST',
        body: { customers: importedRows },
      })
      setImportResult(res)
      await load()
      if (res.imported.length > 0) setImportedRows([])
    } catch (e) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder="Search name, phone, gender…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 140 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <div className="spacer" />
        <button
          className="admin-btn"
          onClick={() => {
            setImportedRows([])
            setImportResult(null)
            setImportFileName('')
            setImportOpen(true)
          }}
        >
          ⬆ Import Excel
        </button>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          + Add Customer
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No customers found." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
<tr>
                    <th>Customer ID</th>
                    <th>Full Name</th>
                    <th>Phone</th>
                    <th>Gender</th>
                    <th>Amount</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Date</th>
                    <th></th>
                  </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td>{c.customer_id}</td>
                    <td>{c.full_name}</td>
                    <td>{c.phone_number}</td>
                    <td>{c.gender || '-'}</td>
                    <td>{formatCurrency(c.amount ?? 0)}</td>
                    <td>{c.duration ? `${c.duration} mo` : '-'}</td>
                    <td><StatusBadge status={c.status} /></td>
                    <td>{formatDate(c.registration_date)}</td>
                    <td>
                      <button
                        className="admin-btn-ghost"
                        onClick={() => viewCustomer(c)}
                      >
                        View / History
                      </button>
                      <button
                        className="admin-btn-ghost"
                        onClick={() => openEdit(c)}
                      >
                        Edit
                      </button>
                      <button
                        className="admin-btn-ghost admin-btn-danger"
                        onClick={() => removeCustomer(c)}
                        title="Delete customer"
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

      {viewing && !editing && (
        <div className="admin-modal-overlay" onClick={() => setViewing(null)}>
          <div
            className="admin-modal admin-modal-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-head">
              <h2>{viewing.full_name}</h2>
              <button className="admin-modal-close" onClick={() => setViewing(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-detail">
                <div>
                  <div className="label">Customer ID</div>
                  <div className="value">{viewing.customer_id}</div>
                </div>
                <div>
                  <div className="label">Phone</div>
                  <div className="value">{viewing.phone_number}</div>
                </div>
                <div>
                  <div className="label">Email</div>
                   <div className="value">{viewing.email || '-'}</div>
                 </div>
                 <div>
                   <div className="label">Gender</div>
                  <div className="value">{viewing.gender || '-'}</div>
                </div>
                <div>
                  <div className="label">Amount</div>
                  <div className="value">{formatCurrency(viewing.amount ?? 0)}</div>
                </div>
                <div>
                  <div className="label">Period</div>
                  <div className="value">{viewing.duration ? `${viewing.duration} month(s)` : '-'}</div>
                </div>
                <div>
                  <div className="label">Status</div>
                  <div className="value"><StatusBadge status={viewing.status} /></div>
                </div>
                <div>
                  <div className="label">Date</div>
                  <div className="value">{formatDate(viewing.registration_date)}</div>
                </div>
              </div>

              <div className="admin-cards" style={{ marginTop: 20, marginBottom: 0 }}>
                <div className="admin-card">
                  <div className="admin-card-label">Current loan(s)</div>
                  <div className="admin-card-value">{viewing.current_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">Previous / closed loan(s)</div>
                  <div className="admin-card-value">{viewing.previous_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">Completed loan(s)</div>
                  <div className="admin-card-value">{viewing.completed_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">Outstanding balance</div>
                  <div className="admin-card-value">
                    {formatCurrency(viewing.outstanding_balance ?? 0)}
                  </div>
                </div>
              </div>

              <h3 style={{ margin: '24px 0 12px' }}>Loan History</h3>
              {!viewing.loans?.length ? (
                <Empty message="No loans yet." />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Loan ID</th>
                        <th>Product</th>
                        <th>Amount</th>
                        <th>Interest Rate</th>
                        <th>Period</th>
                        <th>Application Date</th>
                        <th>Approval Date</th>
                        <th>Disbursement Date</th>
                        <th>Amount Paid</th>
                        <th>Outstanding</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.loans.map((l) => (
                        <tr key={l.id}>
                          <td>{l.loan_id}</td>
                          <td>{l.product_name || '-'}</td>
                          <td>{formatCurrency(l.principal)}</td>
                          <td>{l.interest_rate != null ? `${l.interest_rate}%` : '-'}</td>
                          <td>{l.duration ? `${l.duration} mo` : '-'}</td>
                          <td>{l.application_date ? formatDate(l.application_date) : '-'}</td>
                          <td>{l.approved_at ? formatDate(l.approved_at) : '-'}</td>
                          <td>{l.disbursement_date ? formatDate(l.disbursement_date) : '-'}</td>
                          <td>{formatCurrency(l.amount_paid)}</td>
                          <td>{formatCurrency(l.outstanding_balance)}</td>
                          <td><StatusBadge status={l.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ margin: '24px 0 12px' }}>Loan Application History</h3>
              {!viewing.applications?.length ? (
                <Empty message="No linked applications yet." />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Application</th>
                        <th>Product</th>
                        <th>Requested</th>
                        <th>Approved</th>
                        <th>Period</th>
                        <th>Purpose / note</th>
                        <th>Status</th>
                        <th>Applied</th>
                        <th>Decision</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.applications.map((application) => (
                        <tr key={application.id}>
                          <td>{application.application_id}</td>
                          <td>{application.product_name || '-'}</td>
                          <td>{formatCurrency(application.requested_amount ?? 0)}</td>
                          <td>
                            {application.approved_amount != null
                              ? formatCurrency(application.approved_amount)
                              : '-'}
                          </td>
                          <td>
                            {application.approved_duration || application.requested_duration
                              ? `${application.approved_duration || application.requested_duration} mo`
                              : '-'}
                          </td>
                          <td>
                            {[application.purpose, application.rejection_reason].filter(Boolean).join(' — ') || '-'}
                          </td>
                          <td><StatusBadge status={application.status} /></td>
                          <td>{formatDate(application.application_date)}</td>
                          <td>
                            {application.approved_at || application.rejected_at
                              ? formatDate(application.approved_at || application.rejected_at)
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 style={{ margin: '24px 0 12px' }}>Repayment History</h3>
              {!viewing.repayments?.length ? (
                <Empty message="No repayments recorded yet." />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Repayment</th>
                        <th>Loan</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Method</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.repayments.map((repayment) => (
                        <tr key={repayment.id}>
                          <td>{repayment.repayment_id}</td>
                          <td>{repayment.loan_reference || repayment.loan_id}</td>
                          <td>{formatDate(repayment.payment_date)}</td>
                          <td>{formatCurrency(repayment.amount)}</td>
                          <td>{repayment.payment_method || '-'}</td>
                          <td>{repayment.reference_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => openEdit(viewing)}>
                Edit Customer
              </button>
              <button className="admin-btn admin-btn-danger" onClick={() => removeCustomer(viewing)}>
                Delete Customer
              </button>
              <button className="admin-btn" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setEditing(false)
            setViewing(null)
          }}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-head">
              <h2>{viewing?.id ? 'Edit Customer' : 'Add Customer'}</h2>
              <button
                className="admin-modal-close"
                onClick={() => {
                  setEditing(false)
                  setViewing(null)
                }}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>Full Name</label>
                  <input
                    className="admin-input"
                    value={form.full_name}
                    onChange={(e) => change('full_name', e.target.value)}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Phone Number</label>
                  <PhoneInput
                    className="admin-input"
                    value={form.phone_number}
                    onChange={(v) => change('phone_number', v)}
                    placeholder="78XXXXXXX"
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Email address</label>
                   <input
                     className="admin-input"
                     type="email"
                     value={form.email}
                     onChange={(e) => change('email', e.target.value)}
                   />
                 </div>
                 <div className="admin-form-group">
                   <label>Gender</label>
                  <select
                    className="admin-select"
                    value={form.gender}
                    onChange={(e) => change('gender', e.target.value)}
                    required
                  >
                    <option value="">Select gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>Date</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={form.registration_date}
                    onChange={(e) => change('registration_date', e.target.value)}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Amount (RWF)</label>
                  <input
                    className="admin-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={form.amount}
                    onChange={(e) => change('amount', e.target.value)}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>Period (months)</label>
                  <input
                    className="admin-input"
                    type="number"
                    min="0"
                    max="6"
                    inputMode="numeric"
                    value={form.duration}
                    onChange={(e) => change('duration', e.target.value)}
                    required
                  />
                  <small className="field-hint">Maximum 6 months.</small>
                </div>
                <div className="admin-form-group">
                  <label>Status</label>
                  <select
                    className="admin-select"
                    value={form.status}
                    onChange={(e) => change('status', e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
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
                disabled={saving || !form.full_name || !isValidRwPhone(form.phone_number) || !form.gender || !(Number(form.amount) >= 0) || !(Number(form.duration) >= 0)}
              >
                {saving ? 'Saving…' : 'Save Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="admin-modal-overlay" onClick={() => setImportOpen(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>Import Customers from Excel</h2>
              <button className="admin-modal-close" onClick={() => setImportOpen(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <p style={{ fontSize: 14 }}>
                Upload a <strong>.xlsx</strong>, <strong>.xls</strong> or <strong>.csv</strong> file.
                Expected columns:{' '}
                <strong>
                  Full Name, Phone, Gender, Email, Amount, Period (max 6 months), Status,
                  Date Registered
                </strong>
                . Phones are saved with +250 (9 digits). If "Date Registered" is left empty, today's
                date is used. Extra columns in the file are ignored.
              </p>
              <label className="admin-btn" style={{ cursor: 'pointer' }}>
                {importFileName || 'Choose file…'}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      setImportFileName(file.name)
                      parseWorkbook(file)
                    }
                    e.target.value = ''
                  }}
                />
              </label>

              {importResult?.error && (
                <div className="admin-alert admin-alert-error">{importResult.error}</div>
              )}
              {importResult && !importResult.error && (
                <div
                  className={
                    importResult.errors.length
                      ? 'admin-alert admin-alert-warning'
                      : 'admin-alert admin-alert-success'
                  }
                >
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 8 }}>
                    <div>
                      <strong>Total records:</strong> {importResult.imported.length + importResult.errors.length}
                    </div>
                    <div>
                      <strong>Successfully imported:</strong> {importResult.imported.length}
                    </div>
                    <div>
                      <strong>Failed records:</strong> {importResult.errors.length}
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Reason for failed records:</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {importResult.errors.slice(0, 50).map((er) => (
                          <li key={er.row} style={{ fontSize: 13 }}>
                            Row {er.row}: {er.error}
                          </li>
                        ))}
                      </ul>
                      {importResult.errors.length > 50 && (
                        <small>…and {importResult.errors.length - 50} more.</small>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importedRows.length > 0 && (
                <>
                  <div className="admin-panel-head" style={{ marginTop: 14 }}>
                    <h2>Preview ({importedRows.length} rows)</h2>
                  </div>
                  <div style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
<th>Full Name</th>
                          <th>Phone</th>
                          <th>Gender</th>
                          <th>Email</th>
                          <th>Amount</th>
                          <th>Period</th>
                          <th>Date Registered</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importedRows.slice(0, 100).map((r, i) => (
                          <tr key={i}>
                            <td>{r.full_name}</td>
                            <td>{r.phone_number}</td>
                            <td>{r.gender || '-'}</td>
                            <td>{r.email || '-'}</td>
                            <td>{formatCurrency(r.amount)}</td>
                            <td>{r.duration} mo</td>
                            <td>{r.registration_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importedRows.length > 100 && (
                    <small>Showing first 100 of {importedRows.length} rows.</small>
                  )}
                </>
              )}
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setImportOpen(false)}>
                Close
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={doImport}
                disabled={importing || importedRows.length === 0}
              >
                {importing
                  ? 'Importing…'
                  : `Import ${importedRows.length} Customer${importedRows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Customers