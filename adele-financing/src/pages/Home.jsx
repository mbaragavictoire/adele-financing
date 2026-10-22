import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import { useI18n } from '../i18n/index.jsx'
import '../pages.css'

// Stored as message-key pairs so the text follows the selected language.
const benefits = [
  { title: 'home.benefit.responsible.title', text: 'home.benefit.responsible.text' },
  { title: 'home.benefit.fast.title', text: 'home.benefit.fast.text' },
  { title: 'home.benefit.customer.title', text: 'home.benefit.customer.text' },
  { title: 'home.benefit.credit.title', text: 'home.benefit.credit.text' },
  { title: 'home.benefit.confidential.title', text: 'home.benefit.confidential.text' },
]

function Home() {
  const { t } = useI18n()

  return (
    <div
      className="home-bg"
      style={{
        backgroundImage: `linear-gradient(rgba(246, 248, 251, 0.94), rgba(246, 248, 251, 0.94)), url(${moneyBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <section className="hero-home">
        <div className="container">
          <div>
            <h1>
              {t('home.heroTitle1')}
              <span>{t('home.heroTitle2')}</span>
            </h1>
            <p>
              {t('home.heroBody1')}
              <br />
              <br />
              {t('home.heroBody2')} <br />
              <br />
              {t('home.heroBody3')}
            </p>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>NDTFS</strong>
              <span>{t('home.statLabel')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('home.whyLabel')}</div>
            <h2>{t('home.whyHeading')}</h2>
          </div>
          <div className="steps">
            {benefits.map((b) => (
              <div className="step-card" key={b.title}>
                <div className="step-num">✓</div>
                <h3>{t(b.title)}</h3>
                <p>{t(b.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        className="cta-band"
        style={{
          // Navy overlay keeps the image legible and matches the one dark
          // section in the page rhythm.
          backgroundImage: `linear-gradient(rgba(11, 127, 140, 0.9), rgba(8, 95, 107, 0.94)), url(${moneyBg})`,
        }}
      >
        <div className="container">
          <h2>{t('home.ctaHeading')}</h2>
          <p>{t('home.ctaText')}</p>
          <Link to="/apply" className="btn btn-gold">
            {t('nav.apply')}
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Home
