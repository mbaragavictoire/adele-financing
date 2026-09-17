import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatCurrency } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'

const emptyProduct = {
  name: '',
  description: '',
  min_amount: '',
  max_amount: '',
  interest_rate: '',
  max_duration: '',
  repayment_frequency: 'Monthly',
  status: 'active',
}

function LoanProducts() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'super_admin'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(emptyProduct)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (status) params.status = status
      const data = await apiGet('/loan-products', params)
      setRows(data.loanProducts)
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

  function openNew() {
    setForm(emptyProduct)
    setEditing(true)
    setError('')
  }

  function openEdit(p) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description || '',
      min_amount: p.min_amount,
      max_amount: p.max_amount,
      interest_rate: p.interest_rate,
      max_duration: p.max_duration,
      repayment_frequency: p.repayment_frequency,
      status: p.status,
    })
    setEditing(true)
    setError('')
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const payload = {
        ...form,
        min_amount: Number(form.min_amount || 0),
        max_amount: Number(form.max_amount || 0),
        interest_rate: Number(form.interest_rate || 0),
        max_duration: Number(form.max_duration || 0),
      }
      if (form.id) {
        await api(`/loan-products/${form.id}`, { method: 'PUT', body: payload })
      } else {
        await api('/loan-products', { method: 'POST', body: payload })
      }
      setEditing(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(p) {
    try {
      await api(`/loan-products/${p.id}`, {
        method: 'PUT',
        body: { status: p.status === 'active' ? 'inactive' : 'active' },
      })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  function change(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder="Search products…"
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
        {isAdmin && (
          <button className="admin-btn admin-btn-primary" onClick={openNew}>
            + New Loan Product
          </button>
        )}
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No loan products." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Min Amount</th>
                  <th>Max Amount</th>
                  <th>Interest Rate</th>
                  <th>Max Period</th>
                  <th>Frequency</th>
                  <th>Status</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.description && (
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                          {p.description}
                        </div>
                      )}
                    </td>
                    <td>{formatCurrency(p.min_amount)}</td>
                    <td>{formatCurrency(p.max_amount)}</td>
                    <td>{p.interest_rate}%</td>
                    <td>{p.max_duration} mo</td>
                    <td>{p.repayment_frequency}</td>
                    <td><StatusBadge status={p.status} /></td>
                    {isAdmin && (
                      <td>
                        <button className="admin-btn-ghost" onClick={() => openEdit(p)}>
                          Edit
                        </button>
                        <button className="admin-btn-ghost" onClick={() => toggleStatus(p)}>
                          {p.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <div
          className="admin-modal-overlay"
          onClick={() => {
            setEditing(false)
            setForm(emptyProduct)
          }}
        >
          <div className="admin-modal admin-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{form.id ? 'Edit Loan Product' : 'New Loan Product'}</h2>
              <button
                className="admin-modal-close"
                onClick={() => {
                  setEditing(false)
                  setForm(emptyProduct)
                }}
              >
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Product Name</label>
                  <input
                    className="admin-input"
                    value={form.name}
                    onChange={(e) => change('name', e.target.value)}
                  />
                </div>
                <div className="admin-form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Description</label>
                  <textarea
                    className="admin-textarea"
                    rows="2"
                    value={form.description}
                    onChange={(e) => change('description', e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Minimum Amount (RWF)</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.min_amount}
                    onChange={(e) => change('min_amount', e.target.value.replace(/[^\d]/g, ''))}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Maximum Amount (RWF)</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.max_amount}
                    onChange={(e) => change('max_amount', e.target.value.replace(/[^\d]/g, ''))}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Interest Rate (%)</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.interest_rate}
                    onChange={(e) => change('interest_rate', e.target.value.replace(/[^\d.]/g, ''))}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Maximum Period (months)</label>
                  <input
                    className="admin-input"
                    inputMode="numeric"
                    value={form.max_duration}
                    onChange={(e) => change('max_duration', e.target.value.replace(/[^\d]/g, ''))}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Repayment Frequency</label>
                  <select
                    className="admin-select"
                    value={form.repayment_frequency}
                    onChange={(e) => change('repayment_frequency', e.target.value)}
                  >
                    <option>Monthly</option>
                    <option>Weekly</option>
                    <option>Bi-Weekly</option>
                  </select>
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
                disabled={busy || !form.name}
              >
                {busy ? 'Saving…' : 'Save Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default LoanProducts