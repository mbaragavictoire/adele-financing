import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading, PhoneInput } from '../../admin/ui.jsx'
import { isValidRwPhone } from '../../admin/phone.js'
import { useI18n } from '../../i18n/index.jsx'

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
  const { t } = useI18n()
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
    if (!window.confirm(t('customers.deleteConfirm', { name: c.full_name }))) return
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
          placeholder={t('customers.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 140 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('customers.allStatuses')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="inactive">{t('status.inactive')}</option>
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
          ⬆ {t('customers.importExcel')}
        </button>
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          + {t('customers.addCustomer')}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('customers.noCustomers')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
<tr>
                    <th>{t('customers.customerId')}</th>
                    <th>{t('customers.fullName')}</th>
                    <th>{t('customers.phone')}</th>
                    <th>{t('customers.gender')}</th>
                    <th>{t('ui.amount')}</th>
                    <th>{t('customers.period')}</th>
                    <th>{t('ui.status')}</th>
                    <th>{t('ui.date')}</th>
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
                        {t('customers.viewHistory')}
                      </button>
                      <button
                        className="admin-btn-ghost"
                        onClick={() => openEdit(c)}
                      >
                        {t('customers.edit')}
                      </button>
                      <button
                        className="admin-btn-ghost admin-btn-danger"
                        onClick={() => removeCustomer(c)}
                        title={t('customers.deleteCustomerTitle')}
                      >
                        {t('customers.delete')}
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
                  <div className="label">{t('customers.customerId')}</div>
                  <div className="value">{viewing.customer_id}</div>
                </div>
                <div>
                  <div className="label">{t('customers.phone')}</div>
                  <div className="value">{viewing.phone_number}</div>
                </div>
                <div>
                  <div className="label">{t('customers.email')}</div>
                   <div className="value">{viewing.email || '-'}</div>
                 </div>
                 <div>
                   <div className="label">{t('customers.gender')}</div>
                  <div className="value">{viewing.gender || '-'}</div>
                </div>
                <div>
                  <div className="label">{t('customers.amount')}</div>
                  <div className="value">{formatCurrency(viewing.amount ?? 0)}</div>
                </div>
                <div>
                  <div className="label">{t('customers.period')}</div>
                  <div className="value">{viewing.duration ? t('customers.monthsLabel', { n: viewing.duration }) : '-'}</div>
                </div>
                <div>
                  <div className="label">{t('customers.status')}</div>
                  <div className="value"><StatusBadge status={viewing.status} /></div>
                </div>
                <div>
                  <div className="label">{t('customers.date')}</div>
                  <div className="value">{formatDate(viewing.registration_date)}</div>
                </div>
              </div>

              <div className="admin-cards" style={{ marginTop: 20, marginBottom: 0 }}>
                <div className="admin-card">
                  <div className="admin-card-label">{t('customers.currentLoans')}</div>
                  <div className="admin-card-value">{viewing.current_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">{t('customers.previousLoans')}</div>
                  <div className="admin-card-value">{viewing.previous_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">{t('customers.completedLoans')}</div>
                  <div className="admin-card-value">{viewing.completed_loans?.length || 0}</div>
                </div>
                <div className="admin-card">
                  <div className="admin-card-label">{t('customers.outstandingBalance')}</div>
                  <div className="admin-card-value">
                    {formatCurrency(viewing.outstanding_balance ?? 0)}
                  </div>
                </div>
              </div>

              <h3 style={{ margin: '24px 0 12px' }}>{t('customers.loanHistory')}</h3>
              {!viewing.loans?.length ? (
                <Empty message={t('customers.noLoansYet')} />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('customers.loanId')}</th>
                        <th>{t('customers.product')}</th>
                        <th>{t('customers.amount')}</th>
                        <th>{t('customers.interestRate')}</th>
                        <th>{t('customers.period')}</th>
                        <th>{t('customers.applicationDate')}</th>
                        <th>{t('customers.approvalDate')}</th>
                        <th>{t('customers.disbursementDate')}</th>
                        <th>{t('customers.amountPaid')}</th>
                        <th>{t('customers.outstanding')}</th>
                        <th>{t('customers.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewing.loans.map((l) => (
                        <tr key={l.id}>
                          <td>{l.loan_id}</td>
                          <td>{l.product_name || '-'}</td>
                          <td>{formatCurrency(l.principal)}</td>
                          <td>{l.interest_rate != null ? `${l.interest_rate}%` : '-'}</td>
                          <td>{l.duration ? t('customers.months', { n: l.duration }) : '-'}</td>
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

              <h3 style={{ margin: '24px 0 12px' }}>{t('customers.loanApplicationHistory')}</h3>
              {!viewing.applications?.length ? (
                <Empty message={t('customers.noLinkedApplications')} />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('customers.application')}</th>
                        <th>{t('customers.product')}</th>
                        <th>{t('customers.requested')}</th>
                        <th>{t('customers.approved')}</th>
                        <th>{t('customers.period')}</th>
                        <th>{t('customers.purposeNote')}</th>
                        <th>{t('customers.status')}</th>
                        <th>{t('customers.applied')}</th>
                        <th>{t('customers.decision')}</th>
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
                              ? t('customers.months', {
                                  n: application.approved_duration || application.requested_duration,
                                })
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

              <h3 style={{ margin: '24px 0 12px' }}>{t('customers.repaymentHistory')}</h3>
              {!viewing.repayments?.length ? (
                <Empty message={t('customers.noRepayments')} />
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t('customers.repayment')}</th>
                        <th>{t('customers.loan')}</th>
                        <th>{t('customers.date')}</th>
                        <th>{t('customers.amount')}</th>
                        <th>{t('customers.method')}</th>
                        <th>{t('customers.reference')}</th>
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
              <h2>{viewing?.id ? t('customers.editCustomer') : t('customers.addCustomerTitle')}</h2>
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
                  <label>{t('customers.fullName')}</label>
                  <input
                    className="admin-input"
                    value={form.full_name}
                    onChange={(e) => change('full_name', e.target.value)}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('customers.phone')}</label>
                  <PhoneInput
                    className="admin-input"
                    value={form.phone_number}
                    onChange={(v) => change('phone_number', v)}
                    placeholder="78XXXXXXX"
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('customers.email')}</label>
                   <input
                     className="admin-input"
                     type="email"
                     value={form.email}
                     onChange={(e) => change('email', e.target.value)}
                   />
                 </div>
                 <div className="admin-form-group">
                   <label>{t('customers.gender')}</label>
                  <select
                    className="admin-select"
                    value={form.gender}
                    onChange={(e) => change('gender', e.target.value)}
                    required
                  >
                    <option value="">{t('customers.selectGender')}</option>
                    <option value="Male">{t('customers.male')}</option>
                    <option value="Female">{t('customers.female')}</option>
                    <option value="Other">{t('customers.other')}</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>{t('customers.date')}</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={form.registration_date}
                    onChange={(e) => change('registration_date', e.target.value)}
                    required
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('customers.amountRwf')}</label>
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
                  <label>{t('customers.periodMonths')}</label>
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
                  <small className="field-hint">{t('customers.max6Months')}</small>
                </div>
                <div className="admin-form-group">
                  <label>{t('ui.status')}</label>
                  <select
                    className="admin-select"
                    value={form.status}
                    onChange={(e) => change('status', e.target.value)}
                  >
                    <option value="active">{t('status.active')}</option>
                    <option value="inactive">{t('status.inactive')}</option>
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
              <h2>{t('customers.importCustomersTitle')}</h2>
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
                {importFileName || t('customers.chooseFile')}
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
                      <strong>{t('customers.totalRecords')}</strong> {importResult.imported.length + importResult.errors.length}
                    </div>
                    <div>
                      <strong>{t('customers.successfullyImported')}</strong> {importResult.imported.length}
                    </div>
                    <div>
                      <strong>{t('customers.failedRecords')}</strong> {importResult.errors.length}
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('customers.failedReason')}</div>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>
                        {importResult.errors.slice(0, 50).map((er) => (
                          <li key={er.row} style={{ fontSize: 13 }}>
                            {t('customers.rowLabel', { n: er.row })} {er.error}
                          </li>
                        ))}
                      </ul>
                      {importResult.errors.length > 50 && (
                        <small>{t('customers.andMore', { n: importResult.errors.length - 50 })}</small>
                      )}
                    </div>
                  )}
                </div>
              )}

              {importedRows.length > 0 && (
                <>
                  <div className="admin-panel-head" style={{ marginTop: 14 }}>
                    <h2>{t('customers.preview', { n: importedRows.length })}</h2>
                  </div>
                  <div style={{ maxHeight: 260, overflow: 'auto' }}>
                    <table className="admin-table">
                      <thead>
                        <tr>
<th>{t('customers.fullName')}</th>
                          <th>{t('customers.phone')}</th>
                          <th>{t('customers.gender')}</th>
                          <th>{t('customers.email')}</th>
                          <th>{t('ui.amount')}</th>
                          <th>{t('customers.period')}</th>
                          <th>{t('customers.dateRegistered')}</th>
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
                            <td>{r.duration ? t('customers.months', { n: r.duration }) : '-'}</td>
                            <td>{r.registration_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importedRows.length > 100 && (
                    <small>{t('customers.showingFirst', { n: importedRows.length })}</small>
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