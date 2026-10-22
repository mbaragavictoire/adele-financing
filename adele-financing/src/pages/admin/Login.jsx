import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../admin/AuthContext.jsx'
import LanguageSelector from '../../components/LanguageSelector'
import { useI18n } from '../../i18n/index.jsx'
import logo from '../../assets/adele-logo-hd.jpg'
import '../../admin/admin.css'

function AdminLogin() {
  const { login, error } = useAuth()
  const { t } = useI18n()
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
      <div className="admin-login-lang">
        <LanguageSelector variant="admin" />
      </div>
      <div className="admin-login-card">
        <div className="admin-login-logo-wrap">
          <img src={logo} alt="ADELE Financing" />
        </div>
        <h1 className="admin-login-title" style={{ fontSize: 22 }}>
          {t('login.title')}
        </h1>
        <p className="admin-login-sub">{t('login.subtitle')}</p>

        {forgot ? (
          <div>
            <div className="admin-alert admin-alert-info">
              {t('login.forgotInfo')}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                setForgot(false)
                setLocalError(t('login.contactAdmin'))
              }}
            >
              <div className="admin-form-group">
                <label htmlFor="reset-email">{t('login.email')}</label>
                <input
                  id="reset-email"
                  type="email"
                  className="admin-input"
                  placeholder={t('login.enterEmail')}
                  required
                />
              </div>
              <button type="submit" className="admin-login-btn">
                {t('login.requestReset')}
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
                {t('login.backToLogin')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            {(error || localError) && (
              <div className="admin-login-alert">{localError || error}</div>
            )}

            <div className="admin-form-group">
              <label htmlFor="login-email">{t('login.emailOrUsername')}</label>
              <input
                id="login-email"
                type="email"
                className="admin-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.enterEmail')}
                required
                autoComplete="email"
              />
            </div>

            <div className="admin-form-group">
              <label htmlFor="login-password">{t('login.password')}</label>
              <div className="password-wrap">
                <input
                  id="login-password"
                  type={show ? 'text' : 'password'}
                  className="admin-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('login.enterPassword')}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? t('login.hide') : t('login.show')}
                >
                  {show ? t('login.hide') : t('login.show')}
                </button>
              </div>
            </div>

            <div className="admin-login-link">
              <button type="button" onClick={() => setForgot(true)}>
                {t('login.forgot')}
              </button>
            </div>

            <button type="submit" className="admin-login-btn" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.login')}
            </button>
          </form>
        )}

        <Link to="/" className="admin-login-back">
          {t('login.backToSite')}
        </Link>
      </div>
    </div>
  )
}

export default AdminLogin
