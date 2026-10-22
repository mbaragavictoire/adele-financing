import { useState } from 'react'
import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import { useI18n } from '../i18n/index.jsx'
import '../pages.css'

// Each text field below holds a message key that is resolved with `t()` at
// render time; the translated strings live in
// src/i18n/messages/public-loanproducts.js.
const products = [
  {
    name: 'loanProducts.personal.name',
    icon: '👤',
    purpose: 'loanProducts.personal.purpose',
    eligible: [
      'loanProducts.personal.eligible.salaried',
      'loanProducts.personal.eligible.selfEmployed',
      'loanProducts.personal.eligible.businessOwners',
    ],
    amount: 'loanProducts.personal.amount',
    repayment: 'loanProducts.personal.repayment',
    documents: [
      'loanProducts.personal.documents.nationalId',
      'loanProducts.personal.documents.income',
      'loanProducts.personal.documents.bank',
      'loanProducts.personal.documents.application',
      'loanProducts.personal.documents.collateral',
    ],
    apply: 'loanProducts.personal.apply',
  },
  {
    name: 'loanProducts.sme.name',
    icon: '🏢',
    purpose: 'loanProducts.sme.purpose',
    eligible: [
      'loanProducts.sme.eligible.smes',
      'loanProducts.sme.eligible.entrepreneurs',
      'loanProducts.sme.eligible.registered',
    ],
    amount: 'loanProducts.sme.amount',
    repayment: 'loanProducts.sme.repayment',
    documents: [
      'loanProducts.sme.documents.ownerId',
      'loanProducts.sme.documents.registration',
      'loanProducts.sme.documents.plan',
      'loanProducts.sme.documents.financial',
      'loanProducts.sme.documents.bank',
      'loanProducts.sme.documents.collateral',
    ],
    apply: 'loanProducts.sme.apply',
  },
  {
    name: 'loanProducts.salary.name',
    icon: '💼',
    purpose: 'loanProducts.salary.purpose',
    eligible: [
      'loanProducts.salary.eligible.regular',
      'loanProducts.salary.eligible.approvedOrgs',
    ],
    amount: 'loanProducts.salary.amount',
    repayment: 'loanProducts.salary.repayment',
    documents: [
      'loanProducts.salary.documents.nationalId',
      'loanProducts.salary.documents.crb',
      'loanProducts.salary.documents.contract',
      'loanProducts.salary.documents.payslips',
      'loanProducts.salary.documents.bank',
      'loanProducts.salary.documents.employer',
    ],
    apply: 'loanProducts.salary.apply',
  },
  {
    name: 'loanProducts.agriculture.name',
    icon: '🌾',
    purpose: 'loanProducts.agriculture.purpose',
    eligible: [
      'loanProducts.agriculture.eligible.farmers',
      'loanProducts.agriculture.eligible.groups',
      'loanProducts.agriculture.eligible.agribusiness',
    ],
    amount: 'loanProducts.agriculture.amount',
    repayment: 'loanProducts.agriculture.repayment',
    documents: [
      'loanProducts.agriculture.documents.nationalId',
      'loanProducts.agriculture.documents.crb',
      'loanProducts.agriculture.documents.farming',
      'loanProducts.agriculture.documents.land',
      'loanProducts.agriculture.documents.plan',
      'loanProducts.agriculture.documents.guarantor',
    ],
    apply: 'loanProducts.agriculture.apply',
  },
  {
    name: 'loanProducts.asset.name',
    icon: '🚗',
    purpose: 'loanProducts.asset.purpose',
    eligible: [
      'loanProducts.asset.eligible.businesses',
      'loanProducts.asset.eligible.entrepreneurs',
      'loanProducts.asset.eligible.professionals',
    ],
    amount: 'loanProducts.asset.amount',
    repayment: 'loanProducts.asset.repayment',
    documents: [
      'loanProducts.asset.documents.nationalId',
      'loanProducts.asset.documents.crb',
      'loanProducts.asset.documents.income',
      'loanProducts.asset.documents.quotation',
      'loanProducts.asset.documents.assetInfo',
      'loanProducts.asset.documents.collateral',
    ],
    apply: 'loanProducts.asset.apply',
  },
  {
    name: 'loanProducts.workingCapital.name',
    icon: '💵',
    purpose: 'loanProducts.workingCapital.purpose',
    eligible: [
      'loanProducts.workingCapital.eligible.existing',
      'loanProducts.workingCapital.eligible.traders',
      'loanProducts.workingCapital.eligible.smes',
    ],
    amount: 'loanProducts.workingCapital.amount',
    repayment: 'loanProducts.workingCapital.repayment',
    documents: [
      'loanProducts.workingCapital.documents.registration',
      'loanProducts.workingCapital.documents.records',
      'loanProducts.workingCapital.documents.bank',
      'loanProducts.workingCapital.documents.sales',
      'loanProducts.workingCapital.documents.identification',
    ],
    apply: 'loanProducts.workingCapital.apply',
  },
]

const process = [
  'loanProducts.process.step1',
  'loanProducts.process.step2',
  'loanProducts.process.step3',
  'loanProducts.process.step4',
  'loanProducts.process.step5',
  'loanProducts.process.step6',
]

function LoanProducts() {
  const [open, setOpen] = useState(0)
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
      <section className="page-head">
        <div className="container">
          <h1>{t('loanProducts.title')}</h1>
          <p>{t('loanProducts.subtitle')}</p>
        </div>
      </section>

      <section>
        <div className="container">
          {products.map((p, i) => {
            const isOpen = open === i
            return (
              <div className="product-card" key={p.name}>
                <button
                  type="button"
                  className="product-header"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span className="product-icon">{p.icon}</span>
                  <span className="product-title">{t(p.name)}</span>
                  <span className="product-chevron">
                    {t('loanProducts.seeMore')}
                  </span>
                </button>

                {isOpen && (
                  <div className="product-body">
                    <div className="product-section">
                      <h4>{t('loanProducts.purpose')}</h4>
                      <p>{t(p.purpose)}</p>
                    </div>

                    <div className="product-section">
                      <h4>{t('loanProducts.eligible')}</h4>
                      <ul>
                        {p.eligible.map((e) => (
                          <li key={e}>{t(e)}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="product-section">
                      <h4>{t('loanProducts.amountLabel')}</h4>
                      <p>{t(p.amount)}</p>
                    </div>

                    <div className="product-section">
                      <h4>{t('loanProducts.repayment')}</h4>
                      <p>{t(p.repayment)}</p>
                    </div>

                    <div className="product-section">
                      <h4>{t('loanProducts.documents')}</h4>
                      <ul>
                        {p.documents.map((d) => (
                          <li key={d}>{t(d)}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="product-section">
                      <h4>{t('loanProducts.howToApply')}</h4>
                      <p>{t(p.apply)}</p>
                    </div>

                    <Link to="/apply" className="btn btn-primary product-cta">
                      {t('loanProducts.applyCta')}
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <section className="alt-bg">
        <div className="container">
          <div className="section-head">
            <div className="section-label">{t('loanProducts.getStarted')}</div>
            <h2>{t('loanProducts.processTitle')}</h2>
          </div>
          <div className="steps">
            {process.map((s, i) => (
              <div className="step-card" key={i}>
                <div className="step-num">{i + 1}</div>
                <p>{t(s)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default LoanProducts
