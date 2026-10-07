import { useEffect, useState, useCallback } from 'react'
import { api, apiGet, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'

const TABS = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'read', label: 'Read' },
  { key: 'archived', label: 'Archived' },
]

function Messages() {
  const [messages, setMessages] = useState([])
  const [counts, setCounts] = useState({ total: 0, new: 0, read: 0, archived: 0 })
  const [tab, setTab] = useState('new')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [open, setOpen] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (tab) params.status = tab
      if (search.trim()) params.search = search.trim()
      const data = await apiGet('/contact', params)
      setMessages(data.messages || [])
      setCounts(data.counts || {})
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [tab, search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  async function setStatus(msg, status) {
    setBusyId(msg.id)
    setError('')
    try {
      await api(`/contact/${msg.id}/status`, { method: 'PUT', body: { status } })
      if (open?.id === msg.id && (status === 'archived' || status === 'new')) {
        setOpen(null)
      }
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusyId(null)
    }
  }

  const openMessage = (msg) => {
    setOpen(msg)
    if (msg.status === 'new') {
      setStatus(msg, 'read')
    }
  }

  const countFor = (key) => (key === '' ? counts.total : counts[key] ?? 0)

  return (
    <>
      <div className="admin-toolbar">
        <div className="admin-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`admin-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label} ({countFor(t.key)})
            </button>
          ))}
        </div>
        <input
          className="admin-input admin-input-sm"
          placeholder="Search name, email, subject…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      {open && (
        <div className="admin-panel message-detail">
          <div className="message-detail-head">
            <div>
              <h3 style={{ margin: 0 }}>{open.subject}</h3>
              <div className="message-detail-meta">
                <strong>{open.name}</strong> &lt;{open.email}&gt; ·{' '}
                {formatDate(open.created_at)}
              </div>
            </div>
            <div className="admin-row-actions">
              <a
                className="admin-btn"
                href={`mailto:${open.email}?subject=Re: ${encodeURIComponent(open.subject)}`}
              >
                ✉️ Reply
              </a>
              {open.status !== 'new' && (
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busyId === open.id}
                  onClick={() => setStatus(open, 'new')}
                >
                  {open.status === 'read' ? 'Mark unread' : 'Restore'}
                </button>
              )}
              {open.status !== 'archived' ? (
                <button
                  type="button"
                  className="admin-btn"
                  disabled={busyId === open.id}
                  onClick={() => setStatus(open, 'archived')}
                >
                  Archive
                </button>
              ) : null}
              <button
                type="button"
                className="admin-btn"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="message-detail-body">{open.message}</div>
        </div>
      )}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : messages.length === 0 ? (
          <Empty message="No messages in this view." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDate(m.created_at)}</td>
                    <td>
                      <strong>{m.name}</strong>
                      <br />
                      <span className="text-muted">{m.email}</span>
                    </td>
                    <td>{m.subject}</td>
                    <td>
                      <span className={`status-badge status-${m.status}`}>
                        {m.status}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn"
                        disabled={busyId === m.id}
                        onClick={() => openMessage(m)}
                      >
                        Open
                      </button>
                    </td>
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

export default Messages