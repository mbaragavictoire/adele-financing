import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, apiUrl, formatCurrency, formatDate, CREDENTIALS } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'
import { useI18n } from '../../i18n/index.jsx'

const emptyApp = {
  customer_id: '',
  loan_product_id: '',
  requested_amount: '',
  duration: '',
  purpose: '',
}

function LoanApplications() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyApp)
  const [action, setAction] = useState(null)
  const [approveForm, setApproveForm] = useState({})
  const [rejectReason, setRejectReason] = useState('')
  const [disburseForm, setDisburseForm] = useState({})
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const canManage = ['super_admin', 'loan_officer', 'manager'].includes(user?.role)
  const canApprove = ['super_admin', 'manager'].includes(user?.role)
  const canDisburse = ['super_admin', 'finance_officer', 'manager'].includes(user?.role)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (status) params.status = status
      const data = await apiGet('/loan-applications', params)
      setRows(data.applications)
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

  useEffect(() => {
    async function loadOptions() {
      try {
        const [c, p] = await Promise.all([
          apiGet('/customers', { status: 'active' }),
          apiGet('/loan-products', { status: 'active' }),
        ])
        setCustomers(c.customers)
        setProducts(p.loanProducts)
      } catch (e) {
        setError(e.message)
      }
    }
    loadOptions()
  }, [])

  function openCreate() {
    setForm(emptyApp)
    setShowCreate(true)
    setError('')
  }

  async function createApp() {
    setBusy(true)
    setError('')
    try {
      await api('/loan-applications', {
        method: 'POST',
        body: {
          customer_id: Number(form.customer_id),
          loan_product_id: Number(form.loan_product_id),
          requested_amount: Number(form.requested_amount),
          duration: Number(form.duration),
          purpose: form.purpose,
        },
      })
      setShowCreate(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function runAction(kind) {
    setBusy(true)
    setError('')
    try {
      if (kind === 'review') {
        await api(`/loan-applications/${action.id}/review`, {
          method: 'PUT',
          body: { status: 'under_review' },
        })
      } else if (kind === 'approve') {
        await api(`/loan-applications/${action.id}/approve`, {
          method: 'PUT',
          body: {
            approved_amount: Number(approveForm.approved_amount || action.requested_amount),
            approved_duration: Number(approveForm.approved_duration || action.duration),
            interest_rate:
              approveForm.interest_rate === '' || approveForm.interest_rate == null
                ? action.interest_rate ?? undefined
                : Number(approveForm.interest_rate),
          },
        })
      } else if (kind === 'reject') {
        await api(`/loan-applications/${action.id}/reject`, {
          method: 'PUT',
          body: { reason: rejectReason },
        })
      } else if (kind === 'disburse') {
        await api('/loans/disburse', {
          method: 'POST',
          body: {
            application_id: action.id,
            payment_method: disburseForm.payment_method || 'Bank Transfer',
            reference_number: disburseForm.reference_number,
            approved_amount:
              disburseForm.approved_amount === '' || disburseForm.approved_amount == null
                ? undefined
                : Number(disburseForm.approved_amount),
            disbursement_date: disburseForm.disbursement_date || new Date().toISOString().slice(0, 10),
          },
        })
      }
      setAction(null)
      setRejectReason('')
      setDisburseForm({})
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function openAction(app, kind) {
    setError('')
    setAction({ ...app, _kind: kind })
    loadDocs(app)
    if (kind === 'approve') {
      setApproveForm({
        approved_amount: app.requested_amount,
        approved_duration: app.duration,
        interest_rate: app.interest_rate || '',
      })
    }
    if (kind === 'disburse') {
      setDisburseForm({
        payment_method: 'Bank Transfer',
        reference_number: '',
        approved_amount: app.approved_amount || app.requested_amount,
        disbursement_date: new Date().toISOString().slice(0, 10),
      })
    }
  }

  async function loadDocs(app) {
    setDocs([])
    try {
      const data = await apiGet('/apply/documents', {
        application_id: app.application_id,
      })
      setDocs(data.documents || [])
    } catch {
      setDocs([])
    }
  }

  async function downloadDoc(doc) {
    // No Authorization header: the HttpOnly session cookie is attached by the
    // browser, which is why credentials must be set explicitly here.
    const res = await fetch(apiUrl(`/apply/documents/${doc.id}/file`), {
      credentials: CREDENTIALS,
    })
    if (!res.ok) {
      throw new Error('Download failed.')
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = doc.file_name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  function change(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder={t('loanapplications.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('loanapplications.allStatuses')}</option>
          <option value="pending">{t('status.pending')}</option>
          <option value="under_review">{t('status.under_review')}</option>
          <option value="approved">{t('status.approved')}</option>
          <option value="rejected">{t('status.rejected')}</option>
          <option value="cancelled">{t('status.cancelled')}</option>
        </select>
        <div className="spacer" />
        {canManage && (
          <button className="admin-btn admin-btn-primary" onClick={openCreate}>
            + {t('loanapplications.newApplication')}
          </button>
        )}
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('loanapplications.noApplications')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('loanapplications.application')}</th>
                  <th>{t('loanapplications.customer')}</th>
                  <th>{t('loanapplications.product')}</th>
                  <th>{t('loanapplications.amount')}</th>
                  <th>{t('loanapplications.period')}</th>
                  <th>{t('loanapplications.status')}</th>
                  <th>{t('loanapplications.date')}</th>
                  <th>{t('loanapplications.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td>{a.application_id}</td>
                    <td>{a.customer_name}</td>
                    <td>{a.product_name}</td>
                    <td>{formatCurrency(a.requested_amount)}</td>
                    <td>{a.duration} mo</td>
                    <td><StatusBadge status={a.status} /></td>
                    <td>{formatDate(a.application_date)}</td>
                    <td>
                      {canManage && a.status === 'pending' && (
                        <button className="admin-btn admin-btn-sm" onClick={() => openAction(a, 'review')}>
                          Review
                        </button>
                      )}
                      {canApprove && a.status === 'under_review' && (
                        <button className="admin-btn admin-btn-sm admin-btn-primary" onClick={() => openAction(a, 'approve')}>
                          Approve
                        </button>
                      )}
                      {canManage && ['pending', 'under_review'].includes(a.status) && (
                        <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => openAction(a, 'reject')}>
                          Reject
                        </button>
                      )}
                      {canDisburse && a.status === 'approved' && (
                        <button className="admin-btn admin-btn-sm admin-btn-gold" onClick={() => openAction(a, 'disburse')}>
                          Disburse
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New application modal */}
      {showCreate && (
        <div className="admin-modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{t('loanapplications.newLoanApplication')}</h2>
              <button className="admin-modal-close" onClick={() => setShowCreate(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>{t('loanapplications.customer')}</label>
                  <select
                    className="admin-select"
                    value={form.customer_id}
                    onChange={(e) => change('customer_id', e.target.value)}
                  >
                    <option value="">{t('loanapplications.customerSelect')}</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.full_name} ({c.customer_id})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>{t('loanapplications.loanProduct')}</label>
                  <select
                    className="admin-select"
                    value={form.loan_product_id}
                    onChange={(e) => change('loan_product_id', e.target.value)}
                  >
                    <option value="">{t('loanapplications.productSelect')}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>{t('loanapplications.requestedAmount')}</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.requested_amount}
                    onChange={(e) =>
                      change('requested_amount', e.target.value.replace(/[^\d]/g, ''))
                    }
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('loanapplications.periodMonths')}</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.duration}
                    onChange={(e) =>
                      change('duration', e.target.value.replace(/[^\d]/g, ''))
                    }
                  />
                </div>
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>{t('loanapplications.purpose')}</label>
                  <textarea
                    className="admin-textarea"
                    rows="3"
                    value={form.purpose}
                    onChange={(e) => change('purpose', e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setShowCreate(false)}>
                {t('loanapplications.cancel')}
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={createApp}
                disabled={busy || !form.customer_id || !form.loan_product_id || !form.requested_amount || !form.duration}
              >
                {busy ? t('loanapplications.saving') : t('loanapplications.createApplication')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workflow modals */}
      {action && (
        <div className="admin-modal-overlay" onClick={() => setAction(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>
                {action._kind === 'review' && t('loanapplications.reviewApplication')}
                {action._kind === 'approve' && t('loanapplications.approveApplication')}
                {action._kind === 'reject' && t('loanapplications.rejectApplication')}
                {action._kind === 'disburse' && t('loanapplications.disburseLoan')}
              </h2>
              <button className="admin-modal-close" onClick={() => setAction(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-detail" style={{ marginBottom: 18 }}>
                <div>
                  <div className="label">{t('loanapplications.application')}</div>
                  <div className="value">{action.application_id}</div>
                </div>
                <div>
                  <div className="label">{t('loanapplications.customer')}</div>
                  <div className="value">{action.customer_name}</div>
                </div>
                <div>
                  <div className="label">{t('loanapplications.product')}</div>
                  <div className="value">{action.product_name}</div>
                </div>
                <div>
                  <div className="label">{t('loanapplications.requested')}</div>
                  <div className="value">{formatCurrency(action.requested_amount)}</div>
                </div>
              </div>

              <div style={{ marginBottom: 18 }}>
                <div className="label" style={{ marginBottom: 8 }}>
                  Documents
                </div>
                {docs.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>
                    No documents attached.
                  </div>
                ) : (
                  <ul
                    style={{
                      listStyle: 'none',
                      padding: 0,
                      margin: 0,
                    }}
                  >
                    {docs.map((d) => (
                      <li
                        key={d.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          padding: '8px 0',
                          borderBottom: '1px solid #f1f5f9',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ wordBreak: 'break-all' }}>
                          📄 {d.file_name}{' '}
                          <em style={{ color: '#94a3b8', fontStyle: 'normal' }}>
                            ({(d.size / 1024).toFixed(1)} KB)
                          </em>
                        </span>
                        <button
                          className="admin-btn admin-btn-sm"
                          onClick={() => downloadDoc(d)}
                        >
                          Download
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {action._kind === 'review' && (
                <div className="admin-alert admin-alert-info">
                  Moving this application to “Under Review” for credit assessment.
                </div>
              )}

              {(action._kind === 'approve' || action._kind === 'disburse') && (
                <div className="admin-form-grid">
                  <div className="admin-form-group">
                    <label>Approved Amount (RWF)</label>
                    <input
                      className="admin-input"
                      inputMode="numeric"
                      value={
                        action._kind === 'approve'
                          ? approveForm.approved_amount
                          : disburseForm.approved_amount
                      }
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d]/g, '')
                        if (action._kind === 'approve')
                          setApproveForm((f) => ({ ...f, approved_amount: v }))
                        else setDisburseForm((f) => ({ ...f, approved_amount: v }))
                      }}
                    />
                  </div>
                  {action._kind === 'approve' && (
                    <>
                      <div className="admin-form-group">
                        <label>{t('loanapplications.approvedPeriod')}</label>
                        <input
                          className="admin-input"
                          inputMode="numeric"
                          value={approveForm.approved_duration}
                          onChange={(e) =>
                            setApproveForm((f) => ({
                              ...f,
                              approved_duration: e.target.value.replace(/[^\d]/g, ''),
                            }))
                          }
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>{t('loanapplications.interestRate')}</label>
                        <input
                          className="admin-input"
                          inputMode="numeric"
                          value={approveForm.interest_rate}
                          onChange={(e) =>
                            setApproveForm((f) => ({
                              ...f,
                              interest_rate: e.target.value.replace(/[^\d.]/g, ''),
                            }))
                          }
                        />
                      </div>
                    </>
                  )}
                  {action._kind === 'disburse' && (
                    <>
                      <div className="admin-form-group">
                        <label>{t('loanapplications.dateOfLoan')}</label>
                        <input
                          className="admin-input"
                          type="date"
                          value={disburseForm.disbursement_date}
                          onChange={(e) =>
                            setDisburseForm((f) => ({
                              ...f,
                              disbursement_date: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="admin-form-group">
                        <label>{t('loanapplications.paymentMethod')}</label>
                        <select
                          className="admin-select"
                          value={disburseForm.payment_method}
                          onChange={(e) =>
                            setDisburseForm((f) => ({
                              ...f,
                              payment_method: e.target.value,
                            }))
                          }
                        >
                          <option value="Bank Transfer">{t('loanapplications.bankTransfer')}</option>
                          <option value="Mobile Money">{t('loanapplications.mobileMoney')}</option>
                          <option value="Cash">{t('loanapplications.cash')}</option>
                          <option value="Cheque">{t('loanapplications.cheque')}</option>
                        </select>
                      </div>
                      <div className="admin-form-group">
                        <label>{t('loanapplications.referenceNumber')}</label>
                        <input
                          className="admin-input"
                          value={disburseForm.reference_number}
                          onChange={(e) =>
                            setDisburseForm((f) => ({
                              ...f,
                              reference_number: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </>
                  )}
                </div>
              )}

              {action._kind === 'reject' && (
                <div className="admin-form-group">
                  <label>{t('loanapplications.rejectionReason')}</label>
                  <textarea
                    className="admin-textarea"
                    rows="3"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder={t('loanapplications.explainReject')}
                  />
                </div>
              )}
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setAction(null)}>
                Cancel
              </button>
              {action._kind === 'review' && (
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => runAction('review')}
                  disabled={busy}
                >
                  {busy ? '…' : 'Move to Review'}
                </button>
              )}
              {action._kind === 'approve' && (
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={() => runAction('approve')}
                  disabled={busy}
                >
                  {busy ? '…' : 'Approve Application'}
                </button>
              )}
              {action._kind === 'reject' && (
                <button
                  className="admin-btn admin-btn-danger"
                  onClick={() => runAction('reject')}
                  disabled={busy || !rejectReason}
                >
                  {busy ? '…' : 'Reject Application'}
                </button>
              )}
              {action._kind === 'disburse' && (
                <button
                  className="admin-btn admin-btn-gold"
                  onClick={() => runAction('disburse')}
                  disabled={busy || !disburseForm.approved_amount}
                >
                  {busy ? '…' : 'Disburse Loan'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default LoanApplications