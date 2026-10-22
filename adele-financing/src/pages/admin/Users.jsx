import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatDate } from '../../admin/api.js'
import { RoleChip, StatusBadge, Empty, Loading, PhoneInput } from '../../admin/ui.jsx'
import { useI18n } from '../../i18n/index.jsx'

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
  const { t } = useI18n()
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
          {t('users.add')}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('users.empty')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('users.name')}</th>
                  <th>{t('users.email')}</th>
                  <th>{t('users.phone')}</th>
                  <th>{t('users.role')}</th>
                  <th>{t('ui.status')}</th>
                  <th>{t('users.created')}</th>
                  <th>{t('ui.actions')}</th>
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
                        {t('users.edit')}
                      </button>
                      <button className="admin-btn-ghost" onClick={() => toggleStatus(u)}>
                        {u.status === 'active' ? t('users.deactivate') : t('users.activate')}
                      </button>
                      <button
                        className="admin-btn-ghost"
                        style={{ color: '#dc2626' }}
                        onClick={() => setConfirmDelete(u)}
                      >
                        {t('users.delete')}
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
              <h2>{isNew ? t('users.addTitle') : t('users.editTitle')}</h2>
              <button className="admin-modal-close" onClick={() => setEditing(false)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              {error && <div className="admin-alert admin-alert-error">{error}</div>}
              <div className="admin-form-grid">
                <div className="admin-form-group">
                  <label>{t('users.fullName')}</label>
                  <input
                    className="admin-input"
                    value={form.full_name}
                    onChange={(e) => change('full_name', e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('users.email')}</label>
                  <input
                    className="admin-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => change('email', e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('users.phone')}</label>
                  <PhoneInput
                    className="admin-input"
                    value={form.phone}
                    onChange={(v) => change('phone', v)}
                    placeholder="78XXXXXXX"
                  />
                </div>
                <div className="admin-form-group">
                  <label>{t('users.role')}</label>
                  <select
                    className="admin-select"
                    value={form.role}
                    onChange={(e) => change('role', e.target.value)}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {t(`role.${r}`)}
                      </option>
                    ))}
                  </select>
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
                <div className="admin-form-group">
                  <label>{isNew ? t('users.password') : t('users.newPassword')}</label>
                  <input
                    className="admin-input"
                    type="password"
                    value={form.password}
                    onChange={(e) => change('password', e.target.value)}
                    placeholder={isNew ? t('users.setPassword') : t('users.keepPassword')}
                  />
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
                disabled={
                  busy ||
                  !form.full_name ||
                  !form.email ||
                  (isNew && !form.password)
                }
              >
                {busy ? t('users.saving') : t('users.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <h2>{t('users.deleteTitle')}</h2>
              <button className="admin-modal-close" onClick={() => setConfirmDelete(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal-body">
              <p>
                {t('users.deleteConfirmPrefix')}{' '}
                <strong>{confirmDelete.full_name}</strong> ({confirmDelete.email})?{' '}
                {t('users.deleteConfirmSuffix')}
              </p>
            </div>
            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={() => setConfirmDelete(null)}>
                {t('ui.cancel')}
              </button>
              <button
                className="admin-btn admin-btn-danger"
                onClick={() => doDelete(confirmDelete)}
                disabled={busy}
              >
                {busy ? t('users.deleting') : t('users.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default Users