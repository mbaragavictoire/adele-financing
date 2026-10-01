/**
 * Security headers.
 *
 * Implemented directly rather than pulling in a dependency so the deployed
 * policy is explicit and auditable. Every directive here matters:
 *
 * - default-src 'none' on the HTML shell denies scripts, styles, frames and
 *   plugin content outright.
 * - script-src 'self' is what stops an injected <script> or an inline
 *   onerror= handler from running, which is the defence that makes a stored XSS
 *   bug non-exploitable.
 * - style-src allows 'unsafe-inline' because Vite/React inject styles and the
 *   app sets element style attributes; those cannot execute script.
 * - form-action 'self' and frame-ancestors 'none' prevent form hijacking and
 *   clickjacking.
 */

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

export function securityHeaders(req, res, next) {
  res.setHeader('Content-Security-Policy', CSP)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-DNS-Prefetch-Control', 'off')
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.removeHeader('X-Powered-By')

  // Only meaningful over HTTPS, which is how the app is published. Harmless over
  // plain HTTP because a client ignores it.
  res.setHeader(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload',
  )

  next()
}