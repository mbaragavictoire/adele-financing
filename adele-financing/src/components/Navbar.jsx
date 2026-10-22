import { useEffect, useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import logo from '../assets/adele-logo-hd.jpg'
import LanguageSelector from './LanguageSelector'
import { useI18n } from '../i18n/index.jsx'

function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const { t } = useI18n()

  // Adds the shadowed, slightly translucent treatment once the page moves.
  // Passive listener so scrolling is never blocked by this handler.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`navbar ${scrolled ? 'scrolled' : ''}`}>
      <div className="container navbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img src={logo} alt="Adele Financing logo" className="brand-logo" />
          <span>
            Adele<span>Financing</span>
          </span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label={t('nav.toggle')}
        >
          {open ? '✕' : '☰'}
        </button>

        <div className="navbar-right">
          <nav className={`nav-links ${open ? 'open' : ''}`}>
            <NavLink to="/" end onClick={() => setOpen(false)}>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/loan-products" onClick={() => setOpen(false)}>
              {t('nav.loanProducts')}
            </NavLink>
            <NavLink to="/services" onClick={() => setOpen(false)}>
              {t('nav.services')}
            </NavLink>
            <NavLink to="/about" onClick={() => setOpen(false)}>
              {t('nav.about')}
            </NavLink>
            <NavLink to="/team" onClick={() => setOpen(false)}>
              {t('nav.team')}
            </NavLink>
            <NavLink to="/contact" onClick={() => setOpen(false)}>
              {t('nav.contact')}
            </NavLink>
            <Link
              to="/apply"
              className="btn btn-gold nav-cta"
              onClick={() => setOpen(false)}
            >
              {t('nav.apply')}
            </Link>
            <div className="nav-lang">
              <LanguageSelector variant="public" />
            </div>
          </nav>

          <div className="navbar-lang-desktop">
            <LanguageSelector variant="public" />
          </div>
        </div>
      </div>
    </header>
  )
}

export default Navbar
