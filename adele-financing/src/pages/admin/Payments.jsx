import { useEffect, useState, useCallback } from 'react'
import { apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useI18n } from '../../i18n/index.jsx'

function Payments() {
  const { t } = useI18n()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (type) params.type = type
      const data = await apiGet('/payments', params)
      setRows(data.payments)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search, type])

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [load])

  const total = rows.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder={t('payments.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="admin-select"
          style={{ width: 150 }}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">{t('payments.allTypes')}</option>
          <option value="disbursement">{t('status.disbursement')}</option>
          <option value="repayment">{t('status.repayment')}</option>
        </select>
        <div className="spacer" />
        <strong style={{ fontSize: 15 }}>
          {t('payments.total', { amount: formatCurrency(total) })}
        </strong>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message={t('payments.empty')} />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('payments.paymentId')}</th>
                  <th>{t('payments.type')}</th>
                  <th>{t('payments.customer')}</th>
                  <th>{t('ui.amount')}</th>
                  <th>{t('ui.date')}</th>
                  <th>{t('payments.method')}</th>
                  <th>{t('payments.reference')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.payment_id}</td>
                    <td><StatusBadge status={p.type} /></td>
                    <td>{p.customer_name}</td>
                    <td>{formatCurrency(p.amount)}</td>
                    <td>{formatDate(p.payment_date)}</td>
                    <td>{p.payment_method}</td>
                    <td>{p.reference_number || '-'}</td>
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

export default Payments
