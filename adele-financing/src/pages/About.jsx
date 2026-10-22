import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import { useI18n } from '../i18n/index.jsx'
import '../pages.css'

// Each title/text below holds a message key resolved with `t()` at render
// time; the translated strings live in src/i18n/messages/public-about.js.
const values = [
  {
    title: 'about.values.integrity.title',
    text: 'about.values.integrity.text',
  },
  {
    title: 'about.values.responsibility.title',
    text: 'about.values.responsibility.text',
  },
  {
    title: 'about.values.clientCentricity.title',
    text: 'about.values.clientCentricity.text',
  },
  {
    title: 'about.values.innovation.title',
    text: 'about.values.innovation.text',
  },
  {
    title: 'about.values.excellence.title',
    text: 'about.values.excellence.text',
  },
  {
    title: 'about.values.compliance.title',
    text: 'about.values.compliance.text',
  },
  {
    title: 'about.values.sustainability.title',
    text: 'about.values.sustainability.text',
  },
]

function About() {
  const { t } = useI18n()

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>{t('nav.about')}</h1>
          <p>{t('about.subtitle')}</p>
        </div>  
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('about.whoWeAre')}</div>
            <h2>{t('about.heading')}</h2>
            <p>{t('about.p1')}</p>
            <p>{t('about.p2')}</p>
            <p>{t('about.p3')}</p>
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="contact-grid">
            <div className="value-card" style={{ textAlign: 'left' }}>
              <div className="section-label">{t('about.missionLabel')}</div>
              <p style={{ fontStyle: 'italic', fontSize: 17 }}>
                {t('about.mission')}
              </p>
            </div>
            <div className="value-card" style={{ textAlign: 'left' }}>
              <div className="section-label">{t('about.visionLabel')}</div>
              <p style={{ fontStyle: 'italic', fontSize: 17 }}>
                {t('about.vision')}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('about.valuesLabel')}</div>
            <h2>{t('about.valuesHeading')}</h2>
          </div>
          <div className="features">
            {values.map((v) => (
              <div className="feature-card" key={v.title}>
                <div className="feature-icon">✓</div>
                <h3>{t(v.title)}</h3>
                <p>{t(v.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('about.commitmentLabel')}</div>
            <h2>{t('about.commitmentHeading')}</h2>
            <p>{t('about.commitment')}</p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link to="/contact" className="btn btn-primary">
              {t('nav.contact')}
            </Link>
          </div>
        </div>
      </section>

      <section
        className="cta-band"
        style={{
          backgroundImage: `linear-gradient(rgba(11, 127, 140, 0.9), rgba(8, 95, 107, 0.94)), url(${moneyBg})`,
        }}
      >
        <div className="container">
          <h2>{t('about.cta.title')}</h2>
          <p>{t('about.cta.text')}</p>
          <Link to="/apply" className="btn btn-gold">
            {t('nav.apply')}
          </Link>
        </div>
      </section>
    </>
  )
}

export default About
