import { useState } from 'react'
import { Link } from 'react-router-dom'
import moneyBg from '../assets/money-bg.jpg'
import '../pages.css'

const products = [
  {
    name: 'Personal Loans',
    icon: '👤',
    purpose:
      'To support individuals with personal financial needs such as family expenses, emergencies, home improvement, and personal projects.',
    eligible: [
      'Salaried employees',
      'Self-employed individuals',
      'Business owners with stable income',
    ],
    amount:
      'Depending on the applicant’s income, repayment capacity, and financing needs.',
    repayment:
      'Flexible repayment period based on the loan amount and customer capacity but not exceeds 6 months.',
    documents: [
      'National ID',
      'Proof of income',
      'Bank/Mobile Money statements',
      'Loan application form',
      'Collateral or guarantor (where applicable)',
    ],
    apply:
      'Submit a loan application online or visit ADELE offices with the required documents.',
  },
  {
    name: 'SME & Business Loans',
    icon: '🏢',
    purpose:
      'To provide financing for business start-up, expansion, working capital, and business improvement.',
    eligible: [
      'Small and Medium Enterprises (SMEs)',
      'Entrepreneurs',
      'Registered businesses',
    ],
    amount:
      'Based on business performance, financial capacity, and financing requirements.',
    repayment:
      'Designed according to business cash flow and repayment capacity but not exceeds 6 months.',
    documents: [
      'National ID of owner/directors',
      'Business registration documents',
      'Business plan or project proposal',
      'Financial records',
      'Bank statements',
      'Collateral documents (where applicable)',
    ],
    apply:
      'Complete the loan application and submit supporting business documents for assessment.',
  },
  {
    name: 'Salary Loans',
    icon: '💼',
    purpose:
      'To provide quick financial support to employees for personal needs and planned expenses.',
    eligible: [
      'Employees with regular salary income',
      'Employees of approved organizations',
    ],
    amount: 'Determined based on monthly salary and repayment ability.',
    repayment: 'Flexible period agreed according to customer income but not exceeds 6 months.',
    documents: [
      'National ID',
      'CRB',
      'Employment contract or employment confirmation',
      'Recent payslips',
      'Bank statements',
      'Employer confirmation (where applicable)',
    ],
    apply:
      'Apply through ADELE by submitting the required employment and income documents.',
  },
  {
    name: 'Agricultural Loans',
    icon: '🌾',
    purpose:
      'To support farmers and agribusinesses in production, inputs purchase, and agricultural development.',
    eligible: [
      'Individual farmers',
      'Farmer groups',
      'Agribusiness operators',
    ],
    amount:
      'Based on the agricultural project, expected income, and repayment capacity.',
    repayment: 'Aligned with the agricultural production cycle but not exceeds 6 months.',
    documents: [
      'National ID',
      'CRB',
      'Proof of farming activity',
      'Land ownership/lease documents (where applicable)',
      'Project plan or budget',
      'Guarantor or collateral (where applicable)',
    ],
    apply:
      'Submit an application with details of the agricultural activity and financing needs.',
  },
  {
    name: 'Asset Financing',
    icon: '🚗',
    purpose:
      'To help customers acquire productive assets such as equipment, vehicles, and business tools.',
    eligible: [
      'Businesses',
      'Entrepreneurs',
      'Professionals and individuals with stable income',
    ],
    amount:
      "Based on the value of the asset and customer's repayment capacity.",
    repayment: 'Based on the asset type and financing agreement.',
    documents: [
      'National ID',
      'CRB',
      'Income/business documents',
      'Supplier quotation',
      'Asset information',
      'Collateral documents (where applicable)',
    ],
    apply: 'Submit your request with asset details and supporting documents.',
  },
  {
    name: 'Working Capital Loans',
    icon: '💵',
    purpose:
      'To support daily business operations, stock purchases, and cash flow needs.',
    eligible: [
      'Existing businesses',
      'Traders',
      'SMEs with operating history',
    ],
    amount: 'Based on business turnover and financial capacity.',
    repayment: 'Based on business cash flow and loan conditions but not exceeds 6 months.',
    documents: [
      'Business registration documents',
      'Business records',
      'Bank statements',
      'Sales records',
      'Identification documents',
    ],
    apply: 'Apply by providing business information and required supporting documents.',
  },
]

const process = [
  'Submit Application – Complete the loan application form.',
  'Provide Documents – Submit required supporting documents.',
  'Credit Assessment – ADELE evaluates the application and repayment capacity.',
  'Loan Approval – Approved applications proceed for processing.',
  'Disbursement – Funds are released after completion of requirements.',
  'Repayment – Customer repays according to agreed terms.',
]

function LoanProducts() {
  const [open, setOpen] = useState(0)

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
          <h1>Our Loan Products</h1>
          <p>
            ADELE Financing Company Ltd provides various loan products designed
            to support individuals, entrepreneurs, and businesses to achieve
            their financial goals.
          </p>
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
                  <span className="product-title">{p.name}</span>
                  <span className="product-chevron">See more about loan</span>
                </button>

                {isOpen && (
                  <div className="product-body">
                    <div className="product-section">
                      <h4>Loan Purpose</h4>
                      <p>{p.purpose}</p>
                    </div>

                    <div className="product-section">
                      <h4>Eligible Customers</h4>
                      <ul>
                        {p.eligible.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="product-section">
                      <h4>Loan Amount</h4>
                      <p>{p.amount}</p>
                    </div>

                    <div className="product-section">
                      <h4>Repayment Period</h4>
                      <p>{p.repayment}</p>
                    </div>

                    <div className="product-section">
                      <h4>Required Documents</h4>
                      <ul>
                        {p.documents.map((d) => (
                          <li key={d}>{d}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="product-section">
                      <h4>How to Apply</h4>
                      <p>{p.apply}</p>
                    </div>

                    <Link to="/apply" className="btn btn-primary product-cta">
                      Apply for this Loan
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
            <div className="section-label">Get started</div>
            <h2>General Loan Application Process</h2>
          </div>
          <div className="steps">
            {process.map((s, i) => (
              <div className="step-card" key={i}>
                <div className="step-num">{i + 1}</div>
                <p>{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default LoanProducts
