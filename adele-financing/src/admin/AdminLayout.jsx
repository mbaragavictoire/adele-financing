import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { navItemsFor, canAccess } from './api.js'
import { ROLE_LABELS } from './api.js'
import logo from '../assets/adele-logo-hd.jpg'
import './admin.css'

function AdminLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
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
            <h3>ADELE Financing</h3>
            <span>Loan Management System</span>
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
              <span> {item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-sidebar-user">
            <div className="admin-sidebar-avatar">{initials}</div>
            <div>
              <div className="admin-sidebar-user-name">
                {user?.full_name || 'Staff'}
              </div>
              <div className="admin-sidebar-user-role">
                {ROLE_LABELS[user?.role] || user?.role}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Logging out…' : 'Logout'}
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
            ☰ Menu
          </button>
          <h1>Loan Management System</h1>
          <div className="admin-header-right">
            <span className="admin-badge">
              {ROLE_LABELS[user?.role] || user?.role}
            </span>
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
  if (!canAccess(role, path)) {
    return <div className="admin-empty">You do not have access to this page.</div>
  }
  return children
}

export default AdminLayout