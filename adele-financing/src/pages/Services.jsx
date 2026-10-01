import moneyBg from '../assets/money-bg.jpg'
import ambientBg from '../assets/adele-ambient-1.jpg'
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
          backgroundImage: `linear-gradient(rgba(18, 59, 102, 0.9), rgba(12, 42, 75, 0.94)), url(${ambientBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
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