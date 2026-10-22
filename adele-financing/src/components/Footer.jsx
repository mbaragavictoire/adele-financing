import { Link } from 'react-router-dom'
import logo from '../assets/adele-logo-hd.jpg'
import { useI18n } from '../i18n/index.jsx'

function Footer() {
  const { t } = useI18n()

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src={logo} alt="Adele Financing logo" className="footer-logo" />
              <h4>{t('footer.companyName')}</h4>
            </div>
            <p></p>
          </div>
          <div>
            <h4>{t('footer.companyHeading')}</h4>
            <ul>
              <li>
                <Link to="/about">{t('footer.about')}</Link>
              </li>
              <li>
                <Link to="/team">{t('footer.team')}</Link>
              </li>
              <li>
                <Link to="/loan-products">{t('footer.loanProducts')}</Link>
              </li>
              <li>
                <Link to="/services">{t('footer.services')}</Link>
              </li>
              <li>
                <Link to="/contact">{t('footer.contact')}</Link>
              </li>
              <li>
                <Link to="/apply">{t('footer.apply')}</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>{t('footer.getInTouch')}</h4>
            <ul>
              <li>adele1company@gmail.com</li>
              <li>+250 788 739 764</li>
              <li>Kicukiro – Nyarugunga, Kigali</li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          &copy; {new Date().getFullYear()} {t('footer.companyName')}{' '}
          {t('footer.rights')} &nbsp;|&nbsp; {t('footer.tin')}
        </div>
      </div>
    </footer>
  )
}

export default Footer
