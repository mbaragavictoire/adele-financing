import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'

function Loans() {
  const { user } = useAuth()
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
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
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
          placeholder="Search loan ID, customer…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No loans yet. Disburse an approved application." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Loan ID</th>
                  <th>Customer</th>
                  <th>Principal</th>
                  <th>Total Payable</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Due Date</th>
                  <th>Status</th>
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
                        View
                      </button>
                      {canRecordRepayment && l.status === 'active' && (
                        <button className="admin-btn-ghost" onClick={() => openRepay(l)}>
                          Record Repayment
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
              <h2>Loan {viewing.loan.loan_id}</h2>
              <button className="admin-modal-close" onClick={() => setViewing(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-detail">
                <div>
                  <div className="label">Customer</div>
                  <div className="value">{viewing.loan.customer_name}</div>
                </div>
                <div>
                  <div className="label">Product</div>
                  <div className="value">{viewing.loan.product_name || '-'}</div>
                </div>
                <div>
                  <div className="label">Principal</div>
                  <div className="value">{formatCurrency(viewing.loan.principal)}</div>
                </div>
                <div>
                  <div className="label">Interest</div>
                  <div className="value">{formatCurrency(viewing.loan.interest)}</div>
                </div>
                <div>
                  <div className="label">Total Payable</div>
                  <div className="value">{formatCurrency(viewing.loan.total_payable)}</div>
                </div>
                <div>
                  <div className="label">Amount Paid</div>
                  <div className="value">{formatCurrency(viewing.loan.amount_paid)}</div>
                </div>
                <div>
                  <div className="label">Outstanding Balance</div>
                  <div className="value">{formatCurrency(viewing.loan.outstanding_balance)}</div>
                </div>
                <div>
                  <div className="label">Status</div>
                  <div className="value"><StatusBadge status={viewing.loan.status} /></div>
                </div>
                <div>
                  <div className="label">Start Date</div>
                  <div className="value">{formatDate(viewing.loan.start_date)}</div>
                </div>
                <div>
                  <div className="label">Due Date</div>
                  <div className="value">{formatDate(viewing.loan.due_date)}</div>
                </div>
                <div>
                  <div className="label">Payment Method</div>
                  <div className="value">{viewing.loan.payment_method || '-'}</div>
                </div>
                <div>
                  <div className="label">Reference</div>
                  <div className="value">{viewing.loan.reference_number || '-'}</div>
                </div>
              </div>

              <h3 style={{ margin: '22px 0 10px' }}>Repayment Schedule</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Due Date</th>
                      <th>Amount</th>
                      <th>Status</th>
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
                          No schedule generated.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <h3 style={{ margin: '22px 0 10px' }}>Repayments</h3>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Method</th>
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
                          No repayments recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {repayFor && (
        <div className="admin-modal-overlay" onClick={() => setRepayFor(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>Record Repayment</h2>
              <button className="admin-modal-close" onClick={() => setRepayFor(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-detail" style={{ marginBottom: 18 }}>
                <div>
                  <div className="label">Loan</div>
                  <div className="value">{repayFor.loan_id}</div>
                </div>
                <div>
                  <div className="label">Outstanding Balance</div>
                  <div className="value">{formatCurrency(repayFor.outstanding_balance)}</div>
                </div>
              </div>
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>Amount (RWF)</label>
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
                  <label>Payment Date</label>
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
                  <label>Payment Method</label>
                  <select
                    className="admin-select"
                    value={repayForm.payment_method}
                    onChange={(e) =>
                      setRepayForm((f) => ({ ...f, payment_method: e.target.value }))
                    }
                  >
                    <option>Mobile Money</option>
                    <option>Bank Transfer</option>
                    <option>Cash</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div className="admin-form-group">
                  <label>Reference Number</label>
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
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-primary"
                onClick={recordRepayment}
                disabled={busy || !repayForm.amount}
              >
                {busy ? 'Saving…' : 'Record Repayment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Loans