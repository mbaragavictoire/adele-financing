import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  const [errors, setErrors] = useState({})

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
    setErrors((prev) => ({
      ...prev,
      [e.target.name]: '',
    }))
  }

  function validate() {
    const next = {}

    if (!form.name.trim()) next.name = 'Name is required.'

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

  function handleSubmit(e) {
    e.preventDefault()

    const next = validate()
    setErrors(next)

    if (Object.keys(next).length > 0) return

    setSent(true)
    setForm(initialForm)
  }

  const errorClass = (name) => (errors[name] ? ' has-error' : '')

  return (
    <>
      <section className="page-head">
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

                <button type="submit" className="btn btn-primary">
                  Send Message
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
