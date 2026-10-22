import { useCallback, useEffect, useState } from 'react'
import { api, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'
import { useI18n } from '../../i18n/index.jsx'

/**
 * Session management, Super Admin only.
 *
 * The backend refuses every call on /api/sessions to any other role, so this
 * page existing or not has no bearing on enforcement. Hiding the nav entry is
 * presentation; the server is the authority.
 */
function Sessions() {
  const { user } = useAuth()
  const { t } = useI18n()
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
    const timer = setTimeout(load, 0)
    return () => clearTimeout(timer)
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
      ? t('sessions.confirmRevokeOthers', { name: fullName })
      : t('sessions.confirmRevokeAll', { name: fullName })
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
          {t('sessions.refresh')}
        </button>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {notice && <div className="admin-alert admin-alert-success">{notice}</div>}

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>{t('sessions.activeHeading', { count: active.length })}</h2>
          <small>
            {t('sessions.policy', {
              idle: policy.idleMinutes ?? '—',
              absolute: policy.absoluteHours ?? '—',
              max: policy.maxSessionsPerUser ?? '—',
            })}
          </small>
        </div>
        <div className="admin-panel-body">
        {loading ? (
          <Loading />
        ) : active.length === 0 ? (
          <Empty message={t('sessions.emptyActive')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('sessions.staffMember')}</th>
                  <th>{t('sessions.role')}</th>
                  <th>{t('sessions.device')}</th>
                  <th>{t('sessions.ipAddress')}</th>
                  <th>{t('sessions.signedIn')}</th>
                  <th>{t('sessions.lastActivity')}</th>
                  <th>{t('ui.actions')}</th>
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
                            {s.status === 'suspended'
                              ? t('sessions.suspended')
                              : t('status.inactive')}
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
                      <code>{s.ip || t('sessions.unknownIp')}</code>
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
                        {busy === s.id ? t('sessions.closing') : t('sessions.revoke')}
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
                        {t('sessions.closeAllForAccount')}
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
          <h2>{t('sessions.recentlyClosed')}</h2>
        </div>
        <div className="admin-panel-body">
        {closed.length === 0 ? (
          <Empty message={t('sessions.emptyClosed')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('sessions.staffMember')}</th>
                  <th>{t('sessions.role')}</th>
                  <th>{t('sessions.ipAddress')}</th>
                  <th>{t('sessions.closed')}</th>
                  <th>{t('sessions.reason')}</th>
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
                      <code>{s.ip || t('sessions.unknownIp')}</code>
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