import { Link } from 'react-router-dom'
import chairperson from '../assets/chairperson.jpeg'
import gahamanyiImg from '../assets/gahamanyi-edouard.jpg'
import mukundeImg from '../assets/mukunde-denyse.jpg'
import divineImg from '../assets/Uwamahoro divine.jpeg'
import '../pages.css'

const team = [
  {
    name: 'Gahamanyi Edouard',
    role: 'Managing Director',
    photo: gahamanyiImg,
  },
  { name: 'Mukunde Denyse', role: 'Loan Officer', photo: mukundeImg },
  { name: 'UWAMAHORO Divine', role: 'Accountant', photo: divineImg },
]

function Team() {
  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>Meet Our Team</h1>
          <p>The people behind ADELE Financing Company Ltd.</p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="team-row">
            {team.map((m) => (
              <div
                className={`team-member${m.photo ? ' featured' : ''}`}
                key={m.name}
              >
                {m.photo ? (
                  <img src={m.photo} alt={m.name} className="team-member-photo" />
                ) : (
                  <div className="team-member-photo team-initials">
                    {m.initials}
                  </div>
                )}
                <h3>{m.name}</h3>
                <p className="team-role">{m.role}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">Message from the Chairperson</div>
            
            <div className="chairperson-message-top">
              <img
                src={chairperson}
                alt="MASENGESHO Amouram, Chairperson"
                className="chairperson-message-photo"
              />
              <h3 style={{ marginBottom: 0 }}> CPA.MASENGESHO Amouram</h3>
              <p className="team-role">Chairperson</p>
            </div>
          </div>

          <div className="chairperson-message-text">
            <p>
              Welcome to ADELE Financing Company Ltd, your trusted partner in
              responsible financing.
            </p>
            <p>
              We are committed to providing simple, transparent, and accessible
              financial solutions that support individuals, entrepreneurs, and
              businesses to achieve their goals.
            </p>
            <p>
              As a Non-Deposit Taking Financial Service Provider (NDTFS), we
              focus on responsible lending, professional services, and customer
              satisfaction while maintaining integrity, confidentiality, and
              compliance.
            </p>
            <p>
              Together with our customers and partners, we aim to create
              opportunities, promote financial inclusion, and contribute to
              sustainable economic growth.
            </p>
            <p>Thank you for choosing ADELE Financing Company Ltd.</p>
          </div>
        </div>
      </section>

      <section className="cta-band">
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

export default Team