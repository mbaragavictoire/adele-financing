import { Link } from 'react-router-dom'
import logo from '../assets/adele-logo-hd.jpg'

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src={logo} alt="Adele Financing logo" className="footer-logo" />
              <h4>ADELE Financing Company Ltd</h4>
            </div>
            <p>
             
            </p>
          </div>
          <div>
            <h4>Company</h4>
            <ul>
              <li>
                <Link to="/about">About Us</Link>
              </li>
              <li>
                <Link to="/team">Our Team</Link>
              </li>
              <li>
                <Link to="/loan-products">Loan Products</Link>
              </li>
              <li>
                <Link to="/services">Services We Offer</Link>
              </li>
              <li>
                <Link to="/contact">Contact</Link>
              </li>
              <li>
                <Link to="/apply">Apply</Link>
              </li>
              <li>
                <Link to="/admin/login">Staff Login</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Get in Touch</h4>
            <ul>
              <li>adele1company@gmail.com</li>
              <li>+250 788 739 764</li>
              <li>Kicukiro – Nyarugunga, Kigali</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} Adele Financing Company Ltd. All
          rights reserved. &nbsp;|&nbsp; TIN: 148702359
        </div>
      </div>
    </footer>
  )
}

export default Footer
