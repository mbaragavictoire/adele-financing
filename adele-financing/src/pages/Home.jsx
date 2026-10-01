import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import '../pages.css'

const benefits = [
  {
    title: 'Responsible Lending',
    text: 'We assess each loan application carefully to provide suitable financing solutions.',
  },
  {
    title: 'Fast and Transparent Process',
    text: 'We provide clear loan conditions and efficient application procedures.',
  },
  {
    title: 'Customer-Focused Solutions',
    text: 'Our products are designed to respond to the real financial needs of our customers.',
  },
  {
    title: 'Professional Credit Management',
    text: 'Our experienced team ensures proper loan assessment and monitoring.',
  },
  {
    title: 'Confidentiality and Compliance',
    text: 'We protect customer information and operate according to regulatory requirements.',
  },
]

function Home() {
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
              Your Trusted Partner for <span>Financial Growth</span>
            </h1>
            <p>
            ADELE Financing Company Ltd is a Non-Deposit Taking Financial Service Provider (NDTFS)
licensed by BNR which providing reliable and responsible financing solutions to individuals,
entrepreneurs, and businesses.<br /><br/>

We offer affordable loan products designed to support personal needs, business growth, and productive
activities through transparent, professional, and customer-focused services.
ADELE is committed to promoting financial inclusion by providing accessible financing, responsible
lending, and quality customer support while complying with applicable regulations. <br/><br/>

Our goal is to empower customers, support business development, and contribute to sustainable
economic growth.
            </p>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>NDTFS</strong>
              <span>Licensed by BNR</span>
            </div>
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">Why choose ADELE</div>
            <h2>Reasons to work with us</h2>
          </div>
          <div className="steps">
            {benefits.map((b) => (
              <div className="step-card" key={b.title}>
                <div className="step-num">✓</div>
                <h3>{b.title}</h3>
                <p>{b.text}</p>
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
          backgroundImage: `linear-gradient(rgba(18, 59, 102, 0.9), rgba(12, 42, 75, 0.94)), url(${moneyBg})`,
        }}
      >
        <div className="container">
          <h2>Ready to get started?</h2>
          <p>
            Complete your loan application and let us help you reach your
            financial goals. Your trusted partner for responsible financing.
          </p>
          <Link to="/apply" className="btn btn-gold">
            Apply Now
          </Link>
        </div>
      </section>
    </div>
  )
}

export default Home
