import { useEffect, useState, useCallback } from 'react'
import { apiGet, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'
import { useI18n } from '../../i18n/index.jsx'

function AuditLogs() {
  const { t } = useI18n()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [action, setAction] = useState('')
  const [error, setError] = useState('')

  const actionCounts = rows.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1
    return acc
  }, {})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (action) params.action = action
      const data = await apiGet('/audit-logs', params)
      setRows(data.logs)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, action])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder={t('auditlogs.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 200 }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="">{t('auditlogs.allActions')}</option>
          {Object.keys(actionCounts).sort().map((a) => (
            <option key={a} value={a}>
              {a} ({actionCounts[a]})
            </option>
          ))}
        </select>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('auditlogs.empty')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('auditlogs.dateTime')}</th>
                  <th>{t('auditlogs.user')}</th>
                  <th>{t('auditlogs.action')}</th>
                  <th>{t('auditlogs.description')}</th>
                  <th>{t('auditlogs.record')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.created_at)}</td>
                    <td>{r.user_name}</td>
                    <td>
                      <span className="status-badge status-active">
                        {r.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{r.description}</td>
                    <td>{r.related_record || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

export default AuditLogs