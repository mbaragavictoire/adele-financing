import { randomBytes } from 'node:crypto'
import { createSandboxProxyIngress } from '../../server/proxyIngress.js'

// This module imports no application entry, environment loader, database driver or document storage.
export function createSyntheticBackend({ origin, secret }) {
  const password = randomBytes(32).toString('base64url')
  const sessions = new Map()
  const calls = []
  const guard = createSandboxProxyIngress({
    ADELE_PROXY_SANDBOX_ONLY: 'true', DB_NAME: 'adele_synthetic_runtime',
    API_ALLOWED_ORIGIN: origin, API_PROXY_SECRET: secret,
  })
  function response(body, status = 200, extra = {}) {
    return new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json', 'X-Adele-Data-Class': 'synthetic-only',
        'Cache-Control': 'private, no-store', ...extra },
    })
  }
  function clearCookie() {
    return 'adele_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  }
  async function fetch(request) {
    const url = new URL(request.url)
    const headers = Object.fromEntries(request.headers)
    calls.push({ path: url.pathname, method: request.method,
      cookieNames: (headers.cookie || '').split(';').filter(Boolean).map((v) => v.trim().split('=')[0]) })
    const req = { path: url.pathname.replace(/^\/api/, ''), method: request.method, headers }
    let next = false
    const res = {
      headers: {}, code: 200, value: undefined,
      setHeader(k, v) { this.headers[k] = v },
      status(code) { this.code = code; return this },
      json(value) { this.value = value; return this },
    }
    guard(req, res, () => { next = true })
    if (!next) return new Response(JSON.stringify(res.value), {
      status: res.code, headers: { 'Content-Type': 'application/json', ...res.headers },
    })
    if (req.path === '/auth/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}))
      if (body.email !== 'synthetic@example.invalid' || body.password !== password) return response({ error: 'Invalid synthetic login.' }, 401)
      sessions.clear()
      const token = randomBytes(32).toString('base64url')
      sessions.set(token, { expires: Date.now() + 300000 })
      return response({ synthetic: true, user: { id: 'synthetic-user', role: 'synthetic_viewer' } },
        200, { 'Set-Cookie': 'adele_session=' + token + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=300' })
    }
    const token = /(?:^|;\s*)adele_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.cookie || '')?.[1]
    const session = sessions.get(token)
    const authenticated = session && session.expires > Date.now()
    if (req.path === '/auth/me') {
      return authenticated ? response({ synthetic: true, user: { id: 'synthetic-user', role: 'synthetic_viewer' } }) :
        response({ error: 'Synthetic authentication required.' }, 401, { 'Set-Cookie': clearCookie() })
    }
    if (req.path === '/auth/logout' && request.method === 'POST') {
      sessions.delete(token)
      return response({ synthetic: true, loggedOut: true }, 200, { 'Set-Cookie': clearCookie() })
    }
    if (/^\/(?:customers|loans|repayments|payments|finance|reports|apply|contact)(?:\/|$)/.test(req.path)) {
      return response({ error: 'Customer information and financial operations are unavailable.' }, 403)
    }
    if (req.path === '/synthetic/error') return response({ error: 'Synthetic upstream unavailable.' }, 503)
    if (req.path === '/synthetic/redirect') return new Response(null, { status: 302,
      headers: { 'X-Adele-Data-Class': 'synthetic-only', Location: 'https://blocked.invalid/never-follow' } })
    if (req.path === '/synthetic/unsafe-cookie') return response({}, 200, {
      'Set-Cookie': 'adele_session=' + randomBytes(32).toString('base64url') + '; Domain=example.invalid; Path=/; Secure; HttpOnly; SameSite=Strict',
    })
    if (req.path === '/synthetic/split-cookies') {
      const value = response({ synthetic: true })
      value.headers.append('Set-Cookie', 'adele_session=' + randomBytes(32).toString('base64url') + '; Path=/; Secure; HttpOnly; SameSite=Strict')
      value.headers.append('Set-Cookie', clearCookie())
      return value
    }
    if (req.path === '/synthetic/echo') return response({
      synthetic: true, method: request.method, query: url.search, clientIp: req.adeleProxy.clientIp,
      unrelatedCookieForwarded: /CF_Authorization|other_cookie/.test(headers.cookie || ''),
      authorizationForwarded: !!headers.authorization,
    })
    if (req.path === '/synthetic/document') {
      if (!authenticated) return response({ error: 'Synthetic authentication required.' }, 401)
      return new Response('%PDF-1.4\nSYNTHETIC TEST BYTES ONLY\n%%EOF\n', { headers: {
        'Content-Type': 'application/pdf', 'X-Adele-Data-Class': 'synthetic-only',
        'Content-Disposition': 'attachment; filename="synthetic.pdf"', 'Cache-Control': 'private, no-store',
      } })
    }
    if (req.path === '/health') return response({ status: 'ok', synthetic: true })
    return response({ error: 'No synthetic route.' }, 404)
  }
  return {
    fetch, calls, credentials: { email: 'synthetic@example.invalid', password },
    expireAll() { for (const value of sessions.values()) value.expires = 0 },
  }
}
