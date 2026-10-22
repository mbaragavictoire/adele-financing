import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { navItemsFor, canAccess } from './api.js'
import { ROLE_LABELS, ROLE_LABEL_KEYS } from './api.js'
import LanguageSelector from '../components/LanguageSelector'
import { useI18n } from '../i18n/index.jsx'
import logo from '../assets/adele-logo-hd.jpg'
import './admin.css'

function useRoleLabel() {
  const { t } = useI18n()
  return (role) => {
    const key = ROLE_LABEL_KEYS[role]
    return key ? t(key) : ROLE_LABELS[role] || role
  }
}

function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useI18n()
  const roleLabel = useRoleLabel()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const items = navItemsFor(user?.role)

  async function handleLogout() {
    setLoggingOut(true)
    await logout()
    navigate('/admin/login')
  }

  const initials = (user?.full_name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div className="admin-shell">
      {open && (
        <div className="admin-mobile-backdrop" onClick={() => setOpen(false)} />
      )}
      <aside className={`admin-sidebar ${open ? 'open' : ''}`}>
        <div className="admin-sidebar-brand">
          <img src={logo} alt="Adele Financing" />
          <div>
            <h3>{t('admin.brand')}</h3>
            <span>{t('admin.subtitle')}</span>
          </div>
        </div>

        <nav className="admin-nav">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setOpen(false)}
            >
              <span className="nav-dot" />
              <span> {item.labelKey ? t(item.labelKey) : item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <div className="admin-sidebar-avatar">{initials}</div>
            <div>
              <div className="admin-sidebar-user-name">
                {user?.full_name || t('admin.staff')}
              </div>
              <div className="admin-sidebar-user-role">{roleLabel(user?.role)}</div>
            </div>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? t('admin.loggingOut') : t('admin.logout')}
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <button
            type="button"
            className="admin-btn admin-mobile-toggle"
            onClick={() => setOpen(true)}
          >
            ☰ {t('admin.menu')}
          </button>
          <h1>{t('admin.headerTitle')}</h1>
          <div className="admin-header-right">
            <LanguageSelector variant="admin" />
            <span className="admin-badge">{roleLabel(user?.role)}</span>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function RequireRole({ children, role, path }) {
  const { t } = useI18n()
  if (!canAccess(role, path)) {
    return <div className="admin-empty">{t('admin.noAccess')}</div>
  }
  return children
}

export default AdminLayout
