import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { ADMIN_PERMISSIONS, ROLE_LABELS } from './api.js'
import AdminLayout from './AdminLayout.jsx'

export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="admin-loader">Loading…</div>
  }

  // Unauthenticated visitors are sent to Staff Login. This only hides the UI;
  // the backend independently enforces authentication on every API.
  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}

export function Forbidden() {
  const { user } = useAuth()
  return (
    <div className="admin-loader">
      <div className="admin-alert admin-alert-error" style={{ maxWidth: '32rem' }}>
        <h2 style={{ marginTop: 0 }}>403 — Access denied</h2>
        <p>
          Your role ({ROLE_LABELS[user?.role] || user?.role || 'unknown'}) does not have
          permission to open this page.
        </p>
        <p>If you believe this is wrong, ask a Super Admin to review your access level.</p>
        <Link className="btn btn-primary" to="/admin/dashboard">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}

export function AdminLayoutRoute() {
  const { user } = useAuth()
  const location = useLocation()

  // Prefix matching: a nested path such as /admin/customers/12 must be judged by
  // the section it belongs to, otherwise every child route is wrongly refused.
  const access = ADMIN_PERMISSIONS[user?.role] || []
  const allowed = access.some(
    (route) => location.pathname === route || location.pathname.startsWith(`${route}/`),
  )

  // Previously this redirected to the dashboard with no explanation, which left
  // staff wondering why the page they clicked did not open.
  if (!allowed) {
    return <Forbidden />
  }

  return <AdminLayout />
}