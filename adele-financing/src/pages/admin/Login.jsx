import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../admin/AuthContext.jsx'
import logo from '../../assets/adele-logo-hd.jpg'
import '../../admin/admin.css'

function AdminLogin() {
  const { login, error } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)
  const [localError, setLocalError] = useState('')
  const [forgot, setForgot] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setLocalError('')
    try {
      await login(email.trim(), password)
      navigate('/admin/dashboard', { replace: true })
    } catch (err) {
      setLocalError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-logo-wrap">
          <img src={logo} alt="ADELE Financing" />
        </div>
        <h1 className="admin-login-title" style={{ fontSize: 22 }}>
          Staff Login
        </h1>
        <p className="admin-login-sub">
          Access the ADELE Loan Management System
        </p>

        {forgot ? (
          <div>
            <div className="admin-alert admin-alert-info">
              Enter the email associated with your staff account. Your
              administrator will be notified to reset your password.
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setForgot(false)
                setLocalError('Please contact your administrator to reset your password. (Demo)')
              }}
            >
              <div className="admin-form-group">
                <label htmlFor="reset-email">Email address</label>
                <input
                  id="reset-email"
                  type="email"
                  className="admin-input"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <button type="submit" className="admin-login-btn">
                Request Password Reset
              </button>
            </form>
            <div className="admin-login-link" style={{ marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  setForgot(false)
                  setLocalError('')
                }}
              >
                ← Back to login
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {(error || localError) && (
              <div className="admin-login-alert">{localError || error}</div>
            )}

            <div className="admin-form-group">
              <label htmlFor="login-email">Email or Username</label>
              <input
                id="login-email"
                type="email"
                className="admin-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoComplete="email"
              />
            </div>

            <div className="admin-form-group">
              <label htmlFor="login-password">Password</label>
              <div className="password-wrap">
                <input
                  id="login-password"
                  type={show ? 'text' : 'password'}
                  className="admin-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                >
                  {show ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div className="admin-login-link">
              <button type="button" onClick={() => setForgot(true)}>
                Forgot password?
              </button>
            </div>

            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? 'Signing in…' : 'LOGIN'}
            </button>
          </form>
        )}

        <Link to="/" className="admin-login-back">
          ← Back to Company Website
        </Link>
      </div>
    </div>
  )
}

export default AdminLogin