import { useEffect, useState } from 'react'
import { apiGet, formatCurrency, formatDate } from '../../admin/api.js'
import { StatusBadge, Empty, Loading } from '../../admin/ui.jsx'
import { useAuth } from '../../admin/AuthContext.jsx'
import { currentQuarter } from '../../admin/quarters.js'
import { QuarterPicker } from '../../admin/QuarterPicker.jsx'

function Dashboard() {
  const { user } = useAuth()
  const canFinance = ['super_admin', 'manager', 'finance_officer'].includes(user?.role)
  const defaultQuarter = currentQuarter()
  const [quarterQ, setQuarterQ] = useState(defaultQuarter.q)
  const [quarterYear, setQuarterYear] = useState(defaultQuarter.year)
  const [summary, setSummary] = useState(null)
  const [activity, setActivity] = useState(null)
  const [finance, setFinance] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([
      apiGet(`/reports/summary?q=${quarterQ}&year=${quarterYear}`),
      apiGet(`/dashboard/activity?q=${quarterQ}&year=${quarterYear}`),
      canFinance ? apiGet(`/finance/summary?q=${quarterQ}&year=${quarterYear}`) : Promise.resolve(null),
    ])
      .then(([sum, act, fin]) => {
        if (!active) return
        setSummary(sum.summary)
        setActivity(act)
        setFinance(fin ? fin.summary : null)
      })
      .catch((e) => active && setError(e.message))
    return () => {
      active = false
    }
  }, [canFinance, quarterQ, quarterYear])

  if (error) return <div className="admin-alert admin-alert-error">{error}</div>
  if (!summary || !activity) return <Loading />

  const quarter = summary.quarter
  const qLabel = quarter ? quarter.label : `Q${quarterQ} ${quarterYear}`
  const endLabel = quarter ? formatDate(quarter.end) : ''

  // Snapshot figures — current stock, not period activity. Always "to date".
  const snapshotCards = [
    {
      label: 'Total Customers',
      value: summary.total_customers,
      icon: '👥',
      accent: 'accent-teal',
    },
    {
      label: 'Active Customers',
      value: summary.active_customers ?? 0,
      icon: '✅',
      accent: 'accent-green',
    },
    {
      label: 'Inactive Customers',
      value: summary.inactive_customers ?? 0,
      icon: '📭',
      accent: 'accent-navy',
    },
    {
      label: 'Active Loans',
      value: summary.active_loans,
      icon: '💰',
      accent: 'accent-gold',
    },
    {
      label: 'Inactive Loans',
      value: summary.inactive_loans,
      icon: '📭',
      accent: 'accent-navy',
    },
  ]

  // Quarter KPI cards: flows that actually happened during the period, each on
  // its own transaction date, plus the outstanding balance *as of the period
  // end* (opening balances + earlier transactions included).
  const quarterCards = [
    {
      label: `Applications · ${qLabel}`,
      value: summary.applications_total_quarter ?? 0,
      icon: '📝',
      accent: 'accent-teal',
    },
    {
      label: `Approved · ${qLabel}`,
      value: summary.applications_approved_quarter ?? 0,
      icon: '✅',
      accent: 'accent-green',
    },
    {
      label: `Rejected · ${qLabel}`,
      value: summary.applications_rejected_quarter ?? 0,
      icon: '🚫',
      accent: 'accent-red',
    },
    {
      label: `Loans Disbursed · ${qLabel}`,
      value: summary.loans_disbursed_quarter,
      icon: '🏦',
      accent: 'accent-gold',
    },
    {
      label: `Disbursed Amount · ${qLabel}`,
      value: formatCurrency(summary.total_disbursed_quarter),
      icon: '💵',
      accent: 'accent-green',
    },
    {
      label: `Repayments Received · ${qLabel}`,
      value: formatCurrency(summary.repayments_received_quarter ?? 0),
      icon: '↩️',
      accent: 'accent-teal',
    },
    {
      label: `Interest Received · ${qLabel}`,
      value: formatCurrency(summary.interest_received_quarter),
      icon: '📈',
      accent: 'accent-green',
    },
    {
      label: `Capital Repaid · ${qLabel}`,
      value: formatCurrency(summary.capital_repaid_quarter),
      icon: '💳',
      accent: 'accent-navy',
    },
    {
      label: `Outstanding · as of ${endLabel}`,
      value: formatCurrency(summary.outstanding_balance_end ?? 0),
      icon: '💳',
      accent: 'accent-red',
    },
  ]

  const maxStatus = activity.statusOverview.reduce(
    (m, s) => Math.max(m, s.count),
    1,
  )

  const financeCards = finance
    ? [
        {
          label: `Income · ${qLabel}`,
          value: formatCurrency(finance.total_income_quarter ?? 0),
          icon: '💵',
          accent: 'accent-green',
        },
        {
          label: `Expenses · ${qLabel}`,
          value: formatCurrency(finance.expenses_quarter ?? 0),
          icon: '📤',
          accent: 'accent-red',
        },
        {
          label: `Net Profit · ${qLabel}`,
          value: formatCurrency(finance.net_profit_quarter ?? 0),
          icon: '📈',
          accent: 'accent-teal',
        },
        {
          label: `Cash Balance · as of ${endLabel}`,
          value: formatCurrency(finance.cash_balance_end ?? 0),
          icon: '🏦',
          accent: 'accent-gold',
        },
      ]
    : []

  return (
    <>
      <div className="quarter-bar">
        <div>
          <strong>Quarterly Performance</strong>
          {quarter && (
            <span className="quarter-range">
              {quarter.label} — {quarter.dateRangeLabel}
            </span>
          )}
        </div>
        <QuarterPicker
          q={quarterQ}
          year={quarterYear}
          onChange={(q, y) => {
            setQuarterQ(q)
            setQuarterYear(y)
          }}
        />
      </div>

      {activity.alerts?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {activity.alerts.map((a, i) => (
            <div key={i} className={`admin-alert admin-alert-${a.level}`}>
              <strong>{a.title}</strong> — {a.detail}
            </div>
          ))}
        </div>
      )}

      <div className="admin-panel-head" style={{ marginTop: 8 }}>
        <h2>Snapshot (to date)</h2>
      </div>
      <div className="admin-cards">
        {snapshotCards.map((c) => (
          <div className="admin-card" key={c.label}>
            <div className={`admin-card-accent ${c.accent}`}>{c.icon}</div>
            <div className="admin-card-label">{c.label}</div>
            <div className="admin-card-value">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="admin-panel-head" style={{ marginTop: 8 }}>
        <h2>{qLabel} — {quarter?.dateRangeLabel}</h2>
      </div>
      <div className="admin-cards">
        {quarterCards.map((c) => (
          <div className="admin-card" key={c.label}>
            <div className={`admin-card-accent ${c.accent}`}>{c.icon}</div>
            <div className="admin-card-label">{c.label}</div>
            <div className="admin-card-value">{c.value}</div>
          </div>
        ))}
      </div>

      {financeCards.length > 0 && (
        <>
          <div className="admin-panel-head" style={{ marginTop: 8 }}>
            <h2>Financial Summary · {qLabel}</h2>
          </div>
          <div className="admin-cards">
            {financeCards.map((c) => (
              <div className="admin-card" key={c.label}>
                <div className={`admin-card-accent ${c.accent}`}>{c.icon}</div>
                <div className="admin-card-label">{c.label}</div>
                <div className="admin-card-value">{c.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="admin-grid-2">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Recent Loan Applications</h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            {activity.recentApplications.length === 0 ? (
              <Empty message="No applications yet." />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Application</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recentApplications.map((a) => (
                      <tr key={a.application_id}>
                        <td>{a.application_id}</td>
                        <td>{a.customer_name}</td>
                        <td>{formatCurrency(a.requested_amount)}</td>
                        <td><StatusBadge status={a.status} /></td>
                        <td>{formatDate(a.application_date)}</td>
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
            <h2>Recent Repayments</h2>
          </div>
          <div className="admin-panel-body" style={{ padding: 0 }}>
            {activity.recentRepayments.length === 0 ? (
              <Empty message="No repayments yet." />
            ) : (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Repayment</th>
                      <th>Customer</th>
                      <th>Amount</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recentRepayments.map((r) => (
                      <tr key={r.repayment_id}>
                        <td>{r.repayment_id}</td>
                        <td>{r.customer_name}</td>
                        <td>{formatCurrency(r.amount)}</td>
                        <td>{formatDate(r.payment_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Applications by Status · {qLabel}</h2>
          </div>
          <div className="admin-panel-body">
            {activity.statusOverview.map((s) => (
              <div
                key={s.status}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <span style={{ width: 140 }}>
                  <StatusBadge status={s.status} />
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 10,
                    background: '#f1f5f9',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${(s.count / maxStatus) * 100}%`,
                      height: '100%',
                      background: '#0f9d8f',
                    }}
                  />
                </div>
                <strong>{s.count}</strong>
              </div>
            ))}
            {activity.statusOverview.length === 0 && (
              <Empty message="No applications yet." />
            )}
          </div>
        </div>

        <div className="admin-panel">
          <div className="admin-panel-head">
            <h2>Payment Activity · {qLabel}</h2>
          </div>
          <div className="admin-panel-body">
            {activity.paymentActivity.length === 0 ? (
              <Empty message="No payment activity yet." />
            ) : (
              <>
                {activity.paymentActivity.map((p) => (
                  <div
                    key={p.month}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '10px 0',
                      borderBottom: '1px solid #f1f5f9',
                      fontSize: 14,
                    }}
                  >
                    <span>{p.month}</span>
                    <strong>{formatCurrency(p.total)}</strong>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

export default Dashboard