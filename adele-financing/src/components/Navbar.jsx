import { useState } from 'react'
import { NavLink, Link } from 'react-router-dom'
import logo from '../assets/adele-logo-hd.jpg'

function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img src={logo} alt="Adele Financing logo" className="brand-logo" />
          <span>Adele<span>Financing</span></span>
        </Link>

        <button
          type="button"
          className="nav-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle navigation"
        >
          {open ? '✕' : '☰'}
        </button>

        <nav className={`nav-links ${open ? 'open' : ''}`}>
          <NavLink to="/" end onClick={() => setOpen(false)}>
            Home
          </NavLink>
          <NavLink to="/loan-products" onClick={() => setOpen(false)}>
            Loan Products
          </NavLink>
          <NavLink to="/services" onClick={() => setOpen(false)}>
            Other services
          </NavLink>
          <NavLink to="/about" onClick={() => setOpen(false)}>
            About Us
          </NavLink>
          <NavLink to="/team" onClick={() => setOpen(false)}>
            Our Team
          </NavLink>
          <NavLink to="/contact" onClick={() => setOpen(false)}>
            Contact Us
          </NavLink>
          <Link to="/apply" className="btn btn-gold nav-cta" onClick={() => setOpen(false)}>
            Apply Now
          </Link>
          <NavLink
            to="/admin/login"
            className="nav-staff-login"
            onClick={() => setOpen(false)}
          >
            Staff Login
          </NavLink>
        </nav>
      </div>
    </header>
  )
}

export default Navbar
