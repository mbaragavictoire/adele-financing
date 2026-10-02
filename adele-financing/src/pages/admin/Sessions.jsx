import { useCallback, useEffect, useState } from 'react'
import { api, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'

/**
 * Session management, Super Admin only.
 *
 * The backend refuses every call on /api/sessions to any other role, so this
 * page existing or not has no bearing on enforcement. Hiding the nav entry is
 * presentation; the server is the authority.
 */
function Sessions() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setData(await api('/sessions'))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Deferred by a tick, matching the other admin pages: calling load()
    // directly inside the effect body sets state synchronously.
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  async function revokeOne(id) {
    setBusy(id)
    setNotice('')
    setError('')
    try {
      const res = await api(`/sessions/${id}/revoke`, { method: 'POST' })
      setNotice(res.message)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  async function revokeAllFor(accountUserId, fullName, keepOwn) {
    const warning = keepOwn
      ? `Close every other active session for ${fullName}?\n\nYour own session on this device stays signed in.`
      : `Close every active session for ${fullName}?\n\nThis includes your own session, so you will be asked to sign in again.`
    if (!window.confirm(warning)) return

    setBusy(`user:${accountUserId}`)
    setNotice('')
    setError('')
    try {
      const res = await api('/sessions/revoke-all', {
        method: 'POST',
        body: { user_id: accountUserId, keep_own_session: keepOwn },
      })
      setNotice(res.message)
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const policy = data?.policy || {}
  const active = data?.active || []
  const closed = data?.recentlyClosed || []

  return (
    <>
      <div className="admin-toolbar">
        <span className="spacer" />
        <button className="admin-btn" onClick={load} type="button">
          Refresh
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {notice && <div className="admin-alert admin-alert-success">{notice}</div>}

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Currently signed in ({active.length})</h2>
          <small>
            Idle timeout {policy.idleMinutes ?? '—'} min · maximum{' '}
            {policy.absoluteHours ?? '—'} h · up to {policy.maxSessionsPerUser ?? '—'}{' '}
            simultaneous sessions per account
          </small>
        </div>
        <div className="admin-panel-body">
        {loading ? (
          <Loading />
        ) : active.length === 0 ? (
          <Empty message="Nobody is currently signed in." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th>Device</th>
                  <th>IP address</th>
                  <th>Signed in</th>
                  <th>Last activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.full_name}</strong>
                      <br />
                      <small>{s.email}</small>
                      {s.status !== 'active' && (
                        <>
                          {' '}
                          <span className="status-badge status-pending">
                            {s.status === 'suspended' ? 'Suspended' : 'Inactive'}
                          </span>
                        </>
                      )}
                    </td>
                    <td>
                      <span className="status-badge status-active">
                        {String(s.role || '').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{s.device}</td>
                    <td>
                      <code>{s.ip || 'unknown'}</code>
                    </td>
                    <td>{formatDate(s.created_at)}</td>
                    <td>{formatDate(s.last_seen_at)}</td>
                    <td>
                      <button
                        className="admin-btn-ghost admin-btn-danger"
                        type="button"
                        disabled={busy === s.id}
                        onClick={() => revokeOne(s.id)}
                      >
                        {busy === s.id ? 'Closing…' : 'Revoke'}
                      </button>{' '}
                      <button
                        className="admin-btn-ghost"
                        type="button"
                        disabled={busy === `user:${s.user_id}`}
                        onClick={() =>
                          revokeAllFor(
                            s.user_id,
                            s.full_name,
                            s.user_id !== user?.id,
                          )
                        }
                      >
                        Close all for this account
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>Recently closed</h2>
        </div>
        <div className="admin-panel-body">
        {closed.length === 0 ? (
          <Empty message="No sessions have been closed yet." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Role</th>
                  <th>IP address</th>
                  <th>Closed</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {closed.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.full_name}</strong>
                      <br />
                      <small>{s.email}</small>
                    </td>
                    <td>{String(s.role || '').replace(/_/g, ' ')}</td>
                    <td>
                      <code>{s.ip || 'unknown'}</code>
                    </td>
                    <td>{formatDate(s.revoked_at)}</td>
                    <td>{s.revoke_reason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </>
  )
}

export default Sessions