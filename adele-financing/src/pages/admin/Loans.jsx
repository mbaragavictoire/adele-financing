import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'
import { useI18n } from '../../i18n/index.jsx'

function Loans() {
  const { user } = useAuth()
  const { t } = useI18n()
  const canRecordRepayment = ['super_admin', 'finance_officer'].includes(user?.role)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [viewing, setViewing] = useState(null)
  const [repayFor, setRepayFor] = useState(null)
  const [repayForm, setRepayForm] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (status) params.status = status
      const data = await apiGet('/loans', params)
      setRows(data.loans)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  async function viewLoan(l) {
    try {
      const data = await apiGet(`/loans/${l.id}`)
      setViewing(data)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  function openRepay(l) {
    setRepayFor(l)
    setRepayForm({
      amount: '',
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: 'Mobile Money',
      reference_number: '',
    })
    setError('')
  }

  async function recordRepayment() {
    setBusy(true)
    setError('')
    try {
      await api('/repayments', {
        method: 'POST',
        body: {
          loan_id: repayFor.id,
          amount: Number(repayForm.amount),
          payment_date: repayForm.payment_date,
          payment_method: repayForm.payment_method,
          reference_number: repayForm.reference_number,
        },
      })
      const fresh = await apiGet(`/loans/${repayFor.id}`)
      setRepayFor(null)
      setViewing(fresh)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder={t('loans.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('loans.allStatuses')}</option>
          <option value="active">{t('status.active')}</option>
          <option value="completed">{t('status.completed')}</option>
        </select>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('loans.empty')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('loans.loanId')}</th>
                  <th>{t('loans.customer')}</th>
                  <th>{t('loans.principal')}</th>
                  <th>{t('loans.totalPayable')}</th>
                  <th>{t('loans.paid')}</th>
                  <th>{t('loans.balance')}</th>
                  <th>{t('loans.dueDate')}</th>
                  <th>{t('ui.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td>{l.loan_id}</td>
                    <td>{l.customer_name}</td>
                    <td>{formatCurrency(l.principal)}</td>
                    <td>{formatCurrency(l.total_payable)}</td>
                    <td>{formatCurrency(l.amount_paid)}</td>
                    <td>{formatCurrency(l.outstanding_balance)}</td>
                    <td>{formatDate(l.due_date)}</td>
                    <td><StatusBadge status={l.status} /></td>
                    <td>
                      <button className="admin-btn-ghost" onClick={() => viewLoan(l)}>
                        {t('loans.view')}
                      </button>
                      {canRecordRepayment && l.status === 'active' && (
                        <button className="admin-btn-ghost" onClick={() => openRepay(l)}>
                          {t('loans.recordRepayment')}
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

      {viewing && (
        <div className="admin-modal-overlay" onClick={() => setViewing(null)}>
          <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{t('loans.loanTitle', { id: viewing.loan.loan_id })}</h2>
              <button className="admin-modal-close" onClick={() => setViewing(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-detail">
                <div>
                  <div className="label">{t('loans.customer')}</div>
                  <div className="value">{viewing.loan.customer_name}</div>
                </div>
                <div>
                  <div className="label">{t('loans.product')}</div>
                  <div className="value">{viewing.loan.product_name || '-'}</div>
                </div>
                <div>
                  <div className="label">{t('loans.principal')}</div>
                  <div className="value">{formatCurrency(viewing.loan.principal)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.interest')}</div>
                  <div className="value">{formatCurrency(viewing.loan.interest)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.totalPayable')}</div>
                  <div className="value">{formatCurrency(viewing.loan.total_payable)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.amountPaid')}</div>
                  <div className="value">{formatCurrency(viewing.loan.amount_paid)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.outstandingBalance')}</div>
                  <div className="value">{formatCurrency(viewing.loan.outstanding_balance)}</div>
                </div>
                <div>
                  <div className="label">{t('ui.status')}</div>
                  <div className="value"><StatusBadge status={viewing.loan.status} /></div>
                </div>
                <div>
                  <div className="label">{t('loans.startDate')}</div>
                  <div className="value">{formatDate(viewing.loan.start_date)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.dueDate')}</div>
                  <div className="value">{formatDate(viewing.loan.due_date)}</div>
                </div>
                <div>
                  <div className="label">{t('loans.paymentMethod')}</div>
                  <div className="value">{viewing.loan.payment_method || '-'}</div>
                </div>
                <div>
                  <div className="label">{t('loans.reference')}</div>
                  <div className="value">{viewing.loan.reference_number || '-'}</div>
                </div>
              </div>

              <h3 style={{ margin: '22px 0 10px' }}>{t('loans.schedule')}</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('loans.dueDate')}</th>
                      <th>{t('ui.amount')}</th>
                      <th>{t('ui.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.schedule.map((s, i) => (
                      <tr key={i}>
                        <td>{formatDate(s.due_date)}</td>
                        <td>{formatCurrency(s.amount)}</td>
                        <td><StatusBadge status={s.status} /></td>
                      </tr>
                    ))}
                    {viewing.schedule.length === 0 && (
                      <tr>
                        <td colSpan={3} className="admin-empty">
                          {t('loans.noSchedule')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ margin: '22px 0 10px' }}>{t('loans.repayments')}</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('loans.id')}</th>
                      <th>{t('ui.amount')}</th>
                      <th>{t('ui.date')}</th>
                      <th>{t('loans.method')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.repayments.map((r) => (
                      <tr key={r.id}>
                        <td>{r.repayment_id}</td>
                        <td>{formatCurrency(r.amount)}</td>
                        <td>{formatDate(r.payment_date)}</td>
                        <td>{r.payment_method}</td>
                      </tr>
                    ))}
                    {viewing.repayments.length === 0 && (
                      <tr>
                        <td colSpan={4} className="admin-empty">
                          {t('loans.noRepayments')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setViewing(null)}>
                {t('loans.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {repayFor && (
        <div className="admin-modal-overlay" onClick={() => setRepayFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{t('loans.recordRepayment')}</h2>
              <button className="admin-modal-close" onClick={() => setRepayFor(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-detail" style={{ marginBottom: 18 }}>
                <div>
                  <div className="label">{t('loans.loan')}</div>
                  <div className="value">{repayFor.loan_id}</div>
                </div>
                <div>
                  <div className="label">{t('loans.outstandingBalance')}</div>
                  <div className="value">{formatCurrency(repayFor.outstanding_balance)}</div>
                </div>
              </div>
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>{t('loans.amountRwf')}</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={repayForm.amount}
                    onChange={(e) =>
                      setRepayForm((f) => ({
                        ...f,
                        amount: e.target.value.replace(/[^\d]/g, ''),
                      }))
                    }
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('loans.paymentDate')}</label>
                  <input
                    className="admin-input"
                    type="date"
                    value={repayForm.payment_date}
                    onChange={(e) =>
                      setRepayForm((f) => ({ ...f, payment_date: e.target.value }))
                    }
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('loans.paymentMethod')}</label>
                  <select
                    className="admin-select"
                    value={repayForm.payment_method}
                    onChange={(e) =>
                      setRepayForm((f) => ({ ...f, payment_method: e.target.value }))
                    }
                  >
                    <option value="Mobile Money">{t('loans.mobileMoney')}</option>
                    <option value="Bank Transfer">{t('loans.bankTransfer')}</option>
                    <option value="Cash">{t('loans.cash')}</option>
                    <option value="Cheque">{t('loans.cheque')}</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>{t('loans.referenceNumber')}</label>
                  <input
                    className="admin-input"
                    value={repayForm.reference_number}
                    onChange={(e) =>
                      setRepayForm((f) => ({ ...f, reference_number: e.target.value }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setRepayFor(null)}>
                {t('ui.cancel')}
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={recordRepayment}
                disabled={busy || !repayForm.amount}
              >
                {busy ? t('loans.saving') : t('loans.recordRepayment')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Loans
