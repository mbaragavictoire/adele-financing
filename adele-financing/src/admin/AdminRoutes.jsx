import { Navigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { ADMIN_PERMISSIONS, ROLE_LABELS, ROLE_LABEL_KEYS } from './api.js'
import AdminLayout from './AdminLayout.jsx'
import { useI18n } from '../i18n/index.jsx'

function useRoleLabel() {
  const { t } = useI18n()
  return (role) => {
    const key = ROLE_LABEL_KEYS[role]
    if (key) return t(key)
    return ROLE_LABELS[role] || role || t('admin.unknownRole')
  }
}

export function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  const { t } = useI18n()
  const location = useLocation()

  if (loading) {
    return <div className="admin-loader">{t('ui.loading')}</div>
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
  const { t } = useI18n()
  const roleLabel = useRoleLabel()
  return (
    <div className="admin-loader">
      <div className="admin-alert admin-alert-error" style={{ maxWidth: '32rem' }}>
        <h2 style={{ marginTop: 0 }}>{t('admin.forbiddenTitle')}</h2>
        <p>{t('admin.forbiddenRole', { role: roleLabel(user?.role) })}</p>
        <p>{t('admin.forbiddenHint')}</p>
        <Link className="btn btn-primary" to="/admin/dashboard">
          {t('admin.backToDashboard')}
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
