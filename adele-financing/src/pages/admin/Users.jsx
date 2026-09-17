import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatDate } from '../../admin/api.js'
import { RoleChip, StatusBadge, Empty, Loading, PhoneInput } from '../../admin/ui.jsx'

const ROLES = ['super_admin', 'loan_officer', 'finance_officer', 'manager']

const emptyUser = {
  full_name: '',
  email: '',
  phone: '',
  role: 'loan_officer',
  status: 'active',
  password: '',
}

function Users() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(emptyUser)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/users')
      setRows(data.users)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  function openNew() {
    setForm(emptyUser)
    setEditing(true)
    setError('')
  }

  function openEdit(u) {
    setForm({
      id: u.id,
      full_name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      status: u.status,
      password: '',
    })
    setEditing(true)
    setError('')
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      if (form.id) {
        await api(`/users/${form.id}`, { method: 'PUT', body: form })
      } else {
        await api('/users', { method: 'POST', body: form })
      }
      setEditing(false)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus(u) {
    try {
      await api(`/users/${u.id}`, {
        method: 'PUT',
        body: { status: u.status === 'active' ? 'inactive' : 'active' },
      })
      await load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function doDelete(u) {
    setBusy(true)
    setError('')
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' })
      setConfirmDelete(null)
      await load()
    } catch (e) {
      setError(e.message)
      setConfirmDelete(null)
    } finally {
      setBusy(false)
    }
  }

  function change(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const isNew = !form.id

  return (
    <>
      <div className="admin-toolbar">
        <div className="spacer" />
        <button className="admin-btn admin-btn-primary" onClick={openNew}>
          + Add Staff
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No staff users." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.email}</td>
                    <td>{u.phone || '-'}</td>
                    <td><RoleChip role={u.role} /></td>
                    <td><StatusBadge status={u.status} /></td>
                    <td>{formatDate(u.created_at)}</td>
                    <td>
                      <button className="admin-btn-ghost" onClick={() => openEdit(u)}>
                        Edit
                      </button>
                      <button className="admin-btn-ghost" onClick={() => toggleStatus(u)}>
                        {u.status === 'active' ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        className="admin-btn-ghost"
                        style={{ color: '#dc2626' }}
                        onClick={() => setConfirmDelete(u)}
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
              <h2>{isNew ? 'Add Staff User' : 'Edit Staff User'}</h2>
              <button className="admin-modal-close" onClick={() => setEditing(false)}>
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
                  />
                </div>
                <div className="admin-form-group">
                  <label>Email</label>
                  <input
                    className="admin-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => change('email', e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label>Phone</label>
                  <PhoneInput
                    className="admin-input"
                    value={form.phone}
                    onChange={(v) => change('phone', v)}
                    placeholder="78XXXXXXX"
                  />
                </div>
                <div className="admin-form-group">
                  <label>Role</label>
                  <select
                    className="admin-select"
                    value={form.role}
                    onChange={(e) => change('role', e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, ' ')}
                      </option>
                    ))}
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
                <div className="admin-form-group">
                  <label>{isNew ? 'Password' : 'New Password (optional)'}</label>
                  <input
                    className="admin-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => change('password', e.target.value)}
                    placeholder={isNew ? 'Set password' : 'Leave blank to keep'}
                  />
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
                disabled={
                  busy ||
                  !form.full_name ||
                  !form.email ||
                  (isNew && !form.password)
                }
              >
                {busy ? 'Saving…' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>Delete User</h2>
              <button className="admin-modal-close" onClick={() => setConfirmDelete(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                Are you sure you want to delete{' '}
                <strong>{confirmDelete.full_name}</strong> ({confirmDelete.email})?
                This cannot be undone.
              </p>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-danger"
                onClick={() => doDelete(confirmDelete)}
                disabled={busy}
              >
                {busy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Users