import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import '../pages.css'

const values = [
  {
    title: 'Integrity',
    text: 'Conduct all activities ethically, transparently, and honestly.',
  },
  {
    title: 'Responsibility',
    text: 'Take accountability for all services to benefit clients and stakeholders.',
  },
  {
    title: 'Client-Centricity',
    text: 'Prioritize client needs with tailored financial solutions.',
  },
  {
    title: 'Innovation',
    text: 'Embrace creative, efficient, and forward-thinking solutions.',
  },
  {
    title: 'Excellence',
    text: 'Deliver the highest standards in service, operations, and compliance.',
  },
  {
    title: 'Compliance',
    text: 'Strictly adhere to BNR regulations and best industry practices.',
  },
  {
    title: 'Sustainability',
    text: 'Ensure services contribute to long-term economic and social growth.',
  },
]

function About() {
  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>About Us</h1>
          <p>
            ADELE Financing Company Ltd — your trusted partner for responsible
            financing.
          </p>
        </div>  
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">Who we are</div>
            <h2>About ADELE Financing</h2>
            <p>
              ADELE Financing Company Ltd is a Non-Deposit Taking Financial
              Service Provider (NDTFS) licensed by BNR which provides reliable
              and responsible financing solutions to individuals, entrepreneurs,
              and businesses.
            </p>
            <p>
              We offer affordable loan products designed to support personal
              needs, business growth, and productive activities through
              transparent, professional, and customer-focused services.
            </p>
            <p>
              ADELE is committed to promoting financial inclusion by providing
              accessible financing, responsible lending, and quality customer
              support while complying with applicable regulations. Our goal is
              to empower customers, support business development, and contribute
              to sustainable economic growth.
            </p>
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="contact-grid">
            <div className="value-card" style={{ textAlign: 'left' }}>
              <div className="section-label">Our Mission</div>
              <p style={{ fontStyle: 'italic', fontSize: 17 }}>
                “To provide responsible, transparent, and innovative financial
                solutions that empower individuals and businesses, promote
                sustainable economic growth, and uphold the highest standards of
                integrity and regulatory compliance.”
              </p>
            </div>
            <div className="value-card" style={{ textAlign: 'left' }}>
              <div className="section-label">Our Vision</div>
              <p style={{ fontStyle: 'italic', fontSize: 17 }}>
                “To be Rwanda’s most trusted and innovative financial service
                provider, empowering clients and businesses with ethical,
                transparent, and sustainable financial solutions.”
              </p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="section-head">
            <div className="section-label">Our core values</div>
            <h2>What guides everything we do</h2>
          </div>
          <div className="features">
            {values.map((v) => (
              <div className="feature-card" key={v.title}>
                <div className="feature-icon">✓</div>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">Our commitment</div>
            <h2>How we serve our clients</h2>
            <p>
              “Providing responsible, innovative, and client-focused financial
              services to individuals and businesses, including credit
              facilities, financial advisory, and tailored financial solutions,
              while ensuring full compliance with regulatory requirements.”
            </p>
          </div>
          <div style={{ textAlign: 'center' }}>
            <Link to="/contact" className="btn btn-primary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      <section
        className="cta-band"
        style={{
          backgroundImage: `linear-gradient(rgba(18, 59, 102, 0.9), rgba(12, 42, 75, 0.94)), url(${moneyBg})`,
        }}
      >
        <div className="container">
          <h2>Want to work with us?</h2>
          <p>
            Start your loan application today and see how responsible financing
            can help you grow.
          </p>
          <Link to="/apply" className="btn btn-gold">
            Apply Now
          </Link>
        </div>
      </section>
    </>
  )
}

export default About
