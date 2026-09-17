import moneyBg from '../assets/money-bg.jpg'
import '../pages.css'

const services = [
  'School Fees Loans',
  'Emergency Loans',
  'Trade Finance',
  'Invoice Financing',
  'Loan Top-Up & Restructuring',
  'Financial Advisory',
  'Tax Advisory',
  'Credit Assessment',
  'Business Training',
  'Loan Recovery Services',
  'Digital Loan Application & Repayment',
]

function Services() {
  return (
    <div
      className="home-bg"
      style={{
        backgroundImage: `linear-gradient(rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.92)), url(${moneyBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      <section className="page-head">
        <div className="container">
          <h1>Other Services</h1>
          <p>
            From personal needs to business growth, ADELE provides accessible
            and affordable financing tailored to you.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">What we offer</div>
            <h2>Financing solutions for every need</h2>
          </div>
          <div className="features">
            {services.map((s) => (
              <div className="feature-card" key={s}>
                <div className="feature-icon">✓</div>
                <h3>{s}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Services