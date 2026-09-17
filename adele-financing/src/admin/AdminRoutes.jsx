import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { ADMIN_PERMISSIONS } from './api.js'
import AdminLayout from './AdminLayout.jsx'

export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="admin-loader">Loading…</div>
  }

  if (!user) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />
  }

  return children
}

export function AdminLayoutRoute() {
  const { user } = useAuth()
  const location = useLocation()

  const access = ADMIN_PERMISSIONS[user?.role] || []
  const allowed = access.includes(location.pathname)

  if (!allowed) {
    return <Navigate to="/admin/dashboard" replace />
  }

  return <AdminLayout />
}