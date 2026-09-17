import { useEffect, useState, useCallback } from 'react'
import { apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { Empty, Loading } from '../../admin/ui.jsx'

function Repayments() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      const data = await apiGet('/repayments', params)
      setRows(data.repayments)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [load])

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <>
      <div className="admin-toolbar">
        <input
          className="admin-input admin-input-sm"
          placeholder="Search repayments…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="spacer" />
        <strong style={{ fontSize: 15 }}>
          Total: {formatCurrency(total)}
        </strong>
      </div>

      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-panel">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty message="No repayments recorded." />
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Repayment ID</th>
                  <th>Loan ID</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.repayment_id}</td>
                    <td>{r.loan_id}</td>
                    <td>{r.customer_name}</td>
                    <td>{formatCurrency(r.amount)}</td>
                    <td>{formatDate(r.payment_date)}</td>
                    <td>{r.payment_method}</td>
                    <td>{r.reference_number || '-'}</td>
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

export default Repayments