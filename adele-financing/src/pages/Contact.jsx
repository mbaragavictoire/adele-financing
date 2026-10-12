import { useState } from 'react'
import { Link } from 'react-router-dom'
import ambientBg from '../assets/adele-ambient-2.jpg'
import { api } from '../admin/api.js'
import { isValidName, stripInvalidNameChars } from '../admin/name.js'
import '../pages.css'

const initialForm = {
  name: '',
  email: '',
  subject: '',
  message: '',
}

function Contact() {
  const [form, setForm] = useState(initialForm)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [errors, setErrors] = useState({})

  function handleChange(e) {
    // Names are letters only: drop digits and symbols as they are typed so a
    // pasted phone number or ID cannot land in the name field.
    const value = e.target.name === 'name' ? stripInvalidNameChars(e.target.value) : e.target.value
    setForm({ ...form, [e.target.name]: value })
    setErrors((prev) => ({
      ...prev,
      [e.target.name]: '',
    }))
  }

  function validate() {
    const next = {}

    if (!form.name.trim()) {
      next.name = 'Name is required.'
    } else if (!isValidName(form.name)) {
      next.name = 'Name may only contain letters (no numbers or symbols).'
    }

    if (!form.email.trim()) {
      next.email = 'Email address is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Please enter a valid email address.'
    }

    if (!form.subject.trim()) next.subject = 'Subject is required.'

    if (!form.message.trim()) {
      next.message = 'Message is required.'
    } else if (form.message.trim().length < 10) {
      next.message = 'Message must be at least 10 characters.'
    }

    return next
  }

  async function handleSubmit(e) {
    e.preventDefault()

    const next = validate()
    setErrors(next)

    if (Object.keys(next).length > 0) return

    setSending(true)
    setSubmitError('')
    try {
      await api('/contact', { method: 'POST', body: form })
      setSent(true)
      setForm(initialForm)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSending(false)
    }
  }

  const errorClass = (name) => (errors[name] ? ' has-error' : '')

  return (
    <>
      <section
        className="page-head"
        style={{
          // Same navy wash used on the closing call-to-action: the photo adds
          // texture behind the heading while the text stays fully legible.
          backgroundImage: `linear-gradient(rgba(11, 127, 140, 0.9), rgba(8, 95, 107, 0.94)), url(${ambientBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="container">
          <h1>Contact Us</h1>
          <p>
            Have a question or need help with an application? We&apos;re here
            for you.
          </p>
        </div>
      </section>

      <section>
        <div className="container">
          <div className="contact-grid">
            <div>
              <div className="section-label">Get in touch</div>
              <h2>We&apos;d love to hear from you</h2>

              <div className="contact-info-item" style={{ marginTop: 24 }}>
                <div className="icon">📧</div>
                <div>
                  <strong>Email</strong>
                  <br />
                  adele1company@gmail.com
                </div>
              </div>
              <div className="contact-info-item">
                <div className="icon">📞</div>
                <div>
                  <strong>Phone</strong>
                  <br />
                  +250 788 739 764/+250 738 494 008
                </div>
              </div>
              <div className="contact-info-item">
                <div className="icon">📍</div>
                <div>
                  <strong>Office</strong>
                  <br />
                  Kicukiro – Nyarugunga, Kigali
                  <br />
                  Rwanda
                </div>
              </div>
              <div className="contact-info-item">
                <div className="icon">🕐</div>
                <div>
                  <strong>Hours</strong>
                  <br />
                  Monday – Friday, 9am – 6pm
                </div>
              </div>
              <Link to="/about" className="btn btn-primary">
                About Us
              </Link>
            </div>

            <div>
              {sent && (
                <div className="form-note">
                  Thanks for reaching out! We&apos;ll get back to you within one
                  business day.
                </div>
              )}
              {submitError && (
                <div className="form-note" style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }}>
                  {submitError}
                </div>
              )}
              <form onSubmit={handleSubmit} noValidate>
                <div className="form-grid">
                  <div className="form-group">
                    <label htmlFor="name">Name</label>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      className={errorClass('name')}
                      value={form.name}
                      onChange={handleChange}
                      required
                    />
                    {errors.name && <small className="field-error">{errors.name}</small>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email</label>
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
                </div>

                <div className="form-group">
                  <label htmlFor="subject">Subject</label>
                  <input
                    id="subject"
                    name="subject"
                    type="text"
                    className={errorClass('subject')}
                    value={form.subject}
                    onChange={handleChange}
                    required
                  />
                  {errors.subject && <small className="field-error">{errors.subject}</small>}
                </div>

                <div className="form-group">
                  <label htmlFor="message">Message</label>
                  <textarea
                    id="message"
                    name="message"
                    rows="5"
                    className={errorClass('message')}
                    value={form.message}
                    onChange={handleChange}
                    required
                  />
                  {errors.message && <small className="field-error">{errors.message}</small>}
                </div>

                <button type="submit" className="btn btn-primary" disabled={sending}>
                  {sending ? 'Sending…' : 'Send Message'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Contact
