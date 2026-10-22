import { useState } from 'react'
import '../pages.css'
import { PhoneInput } from '../admin/ui.jsx'
import { isValidRwPhone, rwPhoneFull } from '../admin/phone.js'
import { isValidName, stripInvalidNameChars } from '../admin/name.js'
import { apiUrl } from '../admin/api.js'
import { useI18n } from '../i18n/index.jsx'

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
  const { t } = useI18n()
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
      next.first = t('apply.firstRequired')
    } else if (!isValidName(form.first)) {
      next.first = t('apply.firstInvalid')
    }
    if (!form.last.trim()) {
      next.last = t('apply.lastRequired')
    } else if (!isValidName(form.last)) {
      next.last = t('apply.lastInvalid')
    }

    if (!form.email.trim()) {
      next.email = t('apply.emailRequired')
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = t('apply.emailInvalid')
    }

    if (!form.phone.trim()) {
      next.phone = t('apply.phoneRequired')
    } else if (!isValidRwPhone(form.phone)) {
      next.phone = t('apply.phoneInvalid')
    }

    if (!form.amount.trim()) {
      next.amount = t('apply.amountRequired')
    } else if (Number(form.amount) < 1000) {
      next.amount = t('apply.amountMin')
    }

    if (!form.loanType) next.loanType = t('apply.loanTypeRequired')

    if (!form.date) next.date = t('apply.dateRequired')
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      next.date = t('apply.dateInvalid')
    }

    if (!form.monthly) {
      next.monthly = t('apply.periodRequired')
    } else if (Number(form.monthly) < 1 || Number(form.monthly) > 24) {
      next.monthly = t('apply.periodMax')
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
        throw new Error(data?.error || t('apply.submitFailed'))
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
          <h1>{t('apply.title')}</h1>
          <p>{t('apply.subtitle')}</p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="apply-steps">
            <div className="apply-step">
              <h4>📝 1. {t('apply.step1Title')}</h4>
              <p>{t('apply.step1Text')}</p>
            </div>
            <div className="apply-step">
              <h4>👩‍💼 2. {t('apply.step2Title')}</h4>
              <p>{t('apply.step2Text')}</p>
            </div>
            <div className="apply-step">
              <h4>💰 3. {t('apply.step3Title')}</h4>
              <p>{t('apply.step3Text')}</p>
            </div>
          </div>

          {submitted && (
            <div className="form-note form-note-success">
              <h3>{t('apply.successTitle')}</h3>
              <p>
                {t('apply.referenceLabel')} <strong>{reference}</strong>
              </p>
              <p>{t('apply.successText')}</p>
            </div>
          )}
          {serverError && (
            <div className="form-note" style={{ background: '#fef2f2', color: '#991b1b' }}>
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <h2 style={{ marginTop: 0 }}>{t('apply.formTitle')}</h2>
              <p style={{ marginBottom: 8 }}>{t('apply.formIntro')}</p>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="first">{t('apply.firstName')}</label>
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
                <label htmlFor="last">{t('apply.lastName')}</label>
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
                <label htmlFor="email">{t('apply.email')}</label>
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
                <label htmlFor="phone">{t('apply.phone')}</label>
                <PhoneInput
                  id="phone"
                  name="phone"
                  className={errorClass('phone')}
                  value={form.phone}
                  onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                  placeholder="78XXXXXXX"
                  required
                />
                <small className="field-hint">{t('apply.phoneHint')}</small>
                {errors.phone && <small className="field-error">{errors.phone}</small>}
              </div>
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="loanType">{t('apply.loanType')}</label>
                <select
                  id="loanType"
                  name="loanType"
                  className={errorClass('loanType')}
                  value={form.loanType}
                  onChange={handleChange}
                  required
                >
                  <option value="">{t('apply.loanTypePlaceholder')}</option>
                  <option value="personal">{t('apply.loanTypePersonal')}</option>
                  <option value="sme">{t('apply.loanTypeSme')}</option>
                  <option value="salary">{t('apply.loanTypeSalary')}</option>
                  <option value="agricultural">{t('apply.loanTypeAgricultural')}</option>
                  <option value="asset">{t('apply.loanTypeAsset')}</option>
                  <option value="working-capital">{t('apply.loanTypeWorkingCapital')}</option>
                  <option value="school-fees">{t('apply.loanTypeSchoolFees')}</option>
                  <option value="emergency">{t('apply.loanTypeEmergency')}</option>
                  <option value="Others">{t('apply.loanTypeOther')}</option>
                </select>
                {errors.loanType && <small className="field-error">{errors.loanType}</small>}
              </div>
              <div className="form-group">
                <label htmlFor="amount">{t('apply.amountLabel')}</label>
                <input
                  id="amount"
                  name="amount"
                  type="text"
                  inputMode="numeric"
                  min="1000"
                  className={errorClass('amount')}
                  value={form.amount}
                  onChange={handleChange}
                  placeholder={t('apply.amountPlaceholder')}
                  required
                />
                {errors.amount && <small className="field-error">{errors.amount}</small>}
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="date">{t('apply.dateLabel')}</label>
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
                {t('apply.uploadNote')}
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
                  {t('apply.uploadCta')}
                  <small>{t('apply.uploadHint')}</small>
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
                        {t('apply.remove')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="monthly">{t('apply.periodLabel')}</label>
              <select
                id="monthly"
                name="monthly"
                className={errorClass('monthly')}
                value={form.monthly}
                onChange={handleChange}
                required
              >
                <option value="">{t('apply.periodPlaceholder')}</option>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m > 1
                      ? t('apply.monthsMany', { count: m })
                      : t('apply.monthsOne', { count: m })}
                  </option>
                ))}
              </select>
              <small className="field-hint">{t('apply.periodHint')}</small>
              {errors.monthly && <small className="field-error">{errors.monthly}</small>}
            </div>

            <div className="form-group">
              <label htmlFor="message">{t('apply.messageLabel')}</label>
              <textarea
                id="message"
                name="message"
                rows="4"
                value={form.message}
                onChange={handleChange}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? t('apply.submitting') : t('apply.submit')}
            </button>
          </form>
        </div>
      </section>
    </>
  )
}

export default Apply
