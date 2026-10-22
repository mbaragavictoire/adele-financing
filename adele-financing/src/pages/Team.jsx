import { Link } from 'react-router-dom'
import chairperson from '../assets/chairperson.jpeg'
import gahamanyiImg from '../assets/gahamanyi-edouard.jpg'
import mukundeImg from '../assets/mukunde-denyse.jpg'
import divineImg from '../assets/Uwamahoro divine.jpeg'
import { useI18n } from '../i18n/index.jsx'
import '../pages.css'

// `role` holds a message key resolved with `t()` at render time; `name` is a
// proper noun and stays as-is. Translations live in
// src/i18n/messages/public-team.js.
const team = [
  {
    name: 'Gahamanyi Edouard',
    role: 'team.role.director',
    photo: gahamanyiImg,
  },
  { name: 'Mukunde Denyse', role: 'team.role.loanOfficer', photo: mukundeImg },
  {
    name: 'UWAMAHORO Divine',
    role: 'team.role.accountant',
    photo: divineImg,
  },
]

function Team() {
  const { t } = useI18n()

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>{t('team.title')}</h1>
          <p>{t('team.subtitle')}</p>
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
                <p className="team-role">{t(m.role)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('team.chairLabel')}</div>
            
            <div className="chairperson-message-top">
              <img
                src={chairperson}
                alt={t('team.chairAlt')}
                className="chairperson-message-photo"
              />
              <h3 style={{ marginBottom: 0 }}> CPA.MASENGESHO Amouram</h3>
              <p className="team-role">{t('team.role.chairperson')}</p>
            </div>
          </div>

          <div className="chairperson-message-text">
            <p>{t('team.message.p1')}</p>
            <p>{t('team.message.p2')}</p>
            <p>{t('team.message.p3')}</p>
            <p>{t('team.message.p4')}</p>
            <p>{t('team.message.p5')}</p>
          </div>
        </div>
      </section>

      <section className="cta-band">
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

export default Team
