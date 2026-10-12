import { useState } from 'react'
import '../pages.css'
import { PhoneInput } from '../admin/ui.jsx'
import { isValidRwPhone, rwPhoneFull } from '../admin/phone.js'
import { isValidName, stripInvalidNameChars } from '../admin/name.js'
import { apiUrl } from '../admin/api.js'

const initialForm = {
  first: '',
  last: '',
  email: '',
  phone: '',
  amount: '',
  loanType: '',
  date: new Date().toISOString().slice(0, 10),
  monthly: '',
  message: '',
}

function Apply() {
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState([])
  const [submitted, setSubmitted] = useState(false)
  const [reference, setReference] = useState('')
  const [sending, setSending] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState({})

  const numericOnly = (value) => value.replace(/[^\d]/g, '')

  function handleChange(e) {
    const { name, value } = e.target
    const next = { ...form }

    if (name === 'phone') {
      next.phone = rwPhoneFull(value)
    } else if (name === 'amount') {
      next.amount = numericOnly(value).slice(0, 12)
    } else if (name === 'first' || name === 'last') {
      // Names are letters only: drop digits and symbols as they are typed so a
      // pasted phone number or ID cannot land in a name field.
      next[name] = stripInvalidNameChars(value)
    } else {
      next[name] = value
    }

    setForm(next)
    setErrors((prev) => ({
      ...prev,
      [name]: '',
      submitted: false,
    }))
  }

  function handleFiles(e) {
    const selected = Array.from(e.target.files).filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf'),
    )
    setFiles(selected)
    e.target.value = ''
  }

  function validate() {
    const next = {}

    if (!form.first.trim()) {
      next.first = 'First name is required.'
    } else if (!isValidName(form.first)) {
      next.first = 'First name may only contain letters (no numbers or symbols).'
    }
    if (!form.last.trim()) {
      next.last = 'Last name is required.'
    } else if (!isValidName(form.last)) {
      next.last = 'Last name may only contain letters (no numbers or symbols).'
    }

    if (!form.email.trim()) {
      next.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Please enter a valid email address.'
    }

    if (!form.phone.trim()) {
      next.phone = 'Phone number is required.'
    } else if (!isValidRwPhone(form.phone)) {
      next.phone = 'Please enter a valid 9-digit phone number.'
    }

    if (!form.amount.trim()) {
      next.amount = 'Loan amount is required.'
    } else if (Number(form.amount) < 1000) {
      next.amount = 'Loan amount must be at least 1,000 RWF.'
    }

    if (!form.loanType) next.loanType = 'Please select a loan type.'

    if (!form.date) next.date = 'Date of application is required.'
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      next.date = 'Please enter a valid date.'
    }

    if (!form.monthly) {
      next.monthly = 'Period of payment is required.'
    } else if (Number(form.monthly) < 1 || Number(form.monthly) > 6) {
      next.monthly = 'Period of payment cannot be more than 6 months.'
    }

    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const next = validate()
    setErrors(next)

    if (Object.keys(next).length > 0) return

    setSending(true)
    setServerError('')
    try {
      const body = new FormData()
      for (const [key, value] of Object.entries(form)) {
        body.append(key, value)
      }
      files.forEach((f) => body.append('documents', f))

      const res = await fetch(apiUrl('/apply'), {
        method: 'POST',
        body,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || 'Could not submit your application. Please try again.')
      }
      setReference(data.application_id)
      setSubmitted(true)
      setForm(initialForm)
      setFiles([])
    } catch (err) {
      setServerError(err.message)
    } finally {
      setSending(false)
    }
  }

  const errorClass = (name) =>
    errors[name] ? ' has-error' : ''

  return (
    <>
      <section className="page-head">
        <div className="container">
          <h1>Apply for a Loan</h1>
          <p>
            Complete the form below and our team will get back to you with next
            steps. Applying takes less than 5 minutes.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="apply-steps">
            <div className="apply-step">
              <h4>📝 1. Apply online</h4>
              <p>Fill in your details below — it takes less than 5 minutes and costs nothing.</p>
            </div>
            <div className="apply-step">
              <h4>👩‍💼 2. We review</h4>
              <p>Our team confirms your documents and checks your application within one business day.</p>
            </div>
            <div className="apply-step">
              <h4>💰 3. Get funded</h4>
              <p>Once approved, your loan is disbursed quickly to your bank account or mobile money.</p>
            </div>
          </div>

          {submitted && (
            <div className="form-note form-note-success">
              <h3>Thank you! Your application has been received.</h3>
              <p>
                Reference number: <strong>{reference}</strong>
              </p>
              <p>Your documents were attached and our team will contact you within one business day.</p>
            </div>
          )}
          {serverError && (
            <div className="form-note" style={{ background: '#fef2f2', color: '#991b1b' }}>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <h2 style={{ marginTop: 0 }}>Loan Application</h2>
              <p style={{ marginBottom: 8 }}>Tell us a little about yourself.</p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="first">First name</label>
                <input
                  id="first"
                  name="first"
                  type="text"
                  className={errorClass('first')}
                  value={form.first}
                  onChange={handleChange}
                  required
                />
                {errors.first && <small className="field-error">{errors.first}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="last">Last name</label>
                <input
                  id="last"
                  name="last"
                  type="text"
                  className={errorClass('last')}
                  value={form.last}
                  onChange={handleChange}
                  required
                />
                {errors.last && <small className="field-error">{errors.last}</small>}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="email">Email address</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={errorClass('email')}
                  value={form.email}
                  onChange={handleChange}
                  required
                />
                {errors.email && <small className="field-error">{errors.email}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone number</label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  className={errorClass('phone')}
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="78XXXXXXX"
                  required
                />
                <small className="field-hint">Enter your 9-digit number. Country code +250 is added automatically.</small>
                {errors.phone && <small className="field-error">{errors.phone}</small>}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="loanType">Loan type</label>
                <select
                  id="loanType"
                  name="loanType"
                  className={errorClass('loanType')}
                  value={form.loanType}
                  onChange={handleChange}
                  required
                >
                  <option value="">Select a type</option>
                  <option value="personal">Personal Loan</option>
                  <option value="sme">SME & Business Loan</option>
                  <option value="salary">Salary Loan</option>
                  <option value="agricultural">Agricultural Loan</option>
                  <option value="asset">Asset Financing</option>
                  <option value="working-capital">Working Capital Loan</option>
                  <option value="school-fees">School Fees Loan</option>
                  <option value="emergency">Emergency Loan</option>
                  <option value="Others">Other</option>
                </select>
                {errors.loanType && <small className="field-error">{errors.loanType}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="amount">Loan amount (RWF)</label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  min="1000"
                  className={errorClass('amount')}
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="e.g. 500000"
                  required
                />
                {errors.amount && <small className="field-error">{errors.amount}</small>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="date">Date of application</label>
              <input
                id="date"
                name="date"
                type="date"
                className={errorClass('date')}
                value={form.date}
                onChange={handleChange}
                required
              />
              {errors.date && <small className="field-error">{errors.date}</small>}
            </div>

            <div className="upload-area">
              <div className="upload-note">
                Upload file based on your loan type
              </div>
              <label htmlFor="documents" className="upload-drop">
                <input
                  id="documents"
                  name="documents"
                  type="file"
                  accept=".pdf"
                  multiple
                  onChange={handleFiles}
                />
                <span className="upload-icon">📎</span>
                <span>
                  Click to choose your PDF documents
                  <small>National ID, income proof, business documents, etc.</small>
                </span>
              </label>
              {files.length > 0 && (
                <ul className="upload-list">
                  {files.map((f, i) => (
                    <li key={i}>
                      {f.name}{' '}
                      <em>({(f.size / 1024).toFixed(1)} KB)</em>
                      <button
                        type="button"
                        onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="monthly">Period of payment (months)</label>
              <select
                id="monthly"
                name="monthly"
                className={errorClass('monthly')}
                value={form.monthly}
                onChange={handleChange}
                required
              >
                <option value="">Select months (max 6)</option>
                {[1, 2, 3, 4, 5, 6].map((m) => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
              <small className="field-hint">Loans are repaid within a maximum of 6 months.</small>
              {errors.monthly && <small className="field-error">{errors.monthly}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="message">Anything else we should know?</label>
              <textarea
                id="message"
                name="message"
                rows="4"
                value={form.message}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? 'Submitting…' : 'Submit Application'}
            </button>
          </form>
        </div>
      </section>
    </>
  )
}

export default Apply
