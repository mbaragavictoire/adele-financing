import moneyBg from '../assets/money-bg.jpg'
import ambientBg from '../assets/adele-ambient-1.jpg'
import { useI18n } from '../i18n/index.jsx'
import '../pages.css'

// Items hold message keys resolved with `t()` at render time; the translated
// strings live in src/i18n/messages/public-services.js.
const services = [
  'services.items.schoolFees',
  'services.items.emergency',
  'services.items.tradeFinance',
  'services.items.invoiceFinancing',
  'services.items.topUp',
  'services.items.financialAdvisory',
  'services.items.taxAdvisory',
  'services.items.creditAssessment',
  'services.items.businessTraining',
  'services.items.recovery',
  'services.items.digital',
]

function Services() {
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
      <section
        className="page-head"
        style={{
          // Same navy wash used on the closing call-to-action: the photo adds
          // texture behind the heading while the text stays fully legible.
          backgroundImage: `linear-gradient(rgba(11, 127, 140, 0.9), rgba(8, 95, 107, 0.94)), url(${ambientBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="container">
          <h1>{t('services.title')}</h1>
          <p>{t('services.subtitle')}</p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('services.label')}</div>
            <h2>{t('services.heading')}</h2>
          </div>
          <div className="features">
            {services.map((s) => (
              <div className="feature-card" key={s}>
                <div className="feature-icon">✓</div>
                <h3>{t(s)}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Services
