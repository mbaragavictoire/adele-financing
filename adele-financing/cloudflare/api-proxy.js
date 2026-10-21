import { blockedFinancialWrite } from './financial-boundary.js'
const SESSION = 'adele_session'
const METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const MAX_BODY = 51 * 1024 * 1024
const FORBIDDEN_HOST = 'adele-financing-production.up.railway.app'

class ProxyFailure extends Error {
  constructor(status) {
    super('API request refused.')
    this.status = status
  }
}

function privateHeaders() {
  return new Headers({
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Cloudflare-CDN-Cache-Control': 'no-store',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Referrer-Policy': 'no-referrer',
    Vary: 'Cookie, Origin',
  })
}

function json(status, value, head = false) {
  const headers = privateHeaders()
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(head ? null : JSON.stringify(value), { status, headers })
}

function validIp(value) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value.split('.').every((part) => Number(part) <= 255)
  }
  if (!value.includes(':') || !/^[a-f0-9:.]+$/i.test(value)) return false
  try {
    return new URL('http://[' + value + ']').hostname.startsWith('[')
  } catch {
    return false
  }
}

function sessionCookie(header) {
  const sessions = String(header || '').split(';')
    .map((part) => part.trim()).filter((part) => part.split('=')[0] === SESSION)
  if (sessions.length > 1) throw new ProxyFailure(400)
  if (!sessions.length) return null
  if (!/^adele_session=[a-zA-Z0-9_-]{43}$/.test(sessions[0])) throw new ProxyFailure(400)
  return sessions[0]
}

function secureCookies(headers) {
  let cookies = []
  if (typeof headers.getSetCookie === 'function') cookies = headers.getSetCookie()
  else if (typeof headers.getAll === 'function') cookies = headers.getAll('Set-Cookie')
  else if (headers.has('Set-Cookie')) throw new ProxyFailure(502)
  for (const cookie of cookies) {
    const parts = cookie.split(';').map((part) => part.trim())
    const pair = parts.shift()
    if (!/^adele_session=(?:[a-zA-Z0-9_-]{43})?$/.test(pair)) throw new ProxyFailure(502)
    const attrs = new Map()
    for (const part of parts) {
      const split = part.indexOf('=')
      const key = (split < 0 ? part : part.slice(0, split)).toLowerCase()
      if (attrs.has(key)) throw new ProxyFailure(502)
      attrs.set(key, split < 0 ? '' : part.slice(split + 1))
    }
    if (attrs.has('domain') || attrs.get('path') !== '/' ||
        !attrs.has('secure') || !attrs.has('httponly') ||
        attrs.get('samesite')?.toLowerCase() !== 'strict') throw new ProxyFailure(502)
    if (pair === SESSION + '=') {
      const expired = attrs.has('expires') && Date.parse(attrs.get('expires')) < Date.now()
      const zeroAge = attrs.has('max-age') && /^-?\d+$/.test(attrs.get('max-age')) &&
        Number(attrs.get('max-age')) <= 0
      if (!expired && !zeroAge) throw new ProxyFailure(502)
    }
  }
  return cookies
}

function limitedBody(stream, maxBytes, state) {
  const reader = stream.getReader()
  let size = 0
  return new ReadableStream({
    async pull(controller) {
      const item = await reader.read()
      if (item.done) return controller.close()
      size += item.value.byteLength
      if (size > maxBytes) {
        state.oversize = true
        await reader.cancel().catch(() => {})
        controller.error(new ProxyFailure(413))
        return
      }
      controller.enqueue(item.value)
    },
    cancel(reason) { return reader.cancel(reason) },
  })
}

async function identity(response, nonce, restricted = false) {
  if (response.status !== 200 ||
      response.headers.get('x-adele-data-class') !== (restricted ? 'restricted-postgres' : 'synthetic-only') ||
      !response.headers.get('content-type')?.startsWith('application/json') ||
      !response.body) throw new ProxyFailure(502)
  const state = {}
  const data = await new Response(limitedBody(response.body, 4096, state)).json()
  if (data.kind !== (restricted ? 'adele-postgres-restricted' : 'adele-synthetic-sandbox') || data.nonce !== nonce) throw new ProxyFailure(502)
}

function configuration(env, frontend, restricted = false) {
  if (env.API_STAGE !== (restricted ? 'postgres-restricted' : 'synthetic-sandbox') ||
      env.API_ALLOWED_ORIGIN !== frontend.origin ||
      frontend.protocol !== 'https:' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.API_PROXY_SECRET || '')) throw new ProxyFailure(503)
  let upstream
  try { upstream = new URL(env.API_UPSTREAM) } catch { throw new ProxyFailure(503) }
  if (upstream.protocol !== 'https:' || upstream.username || upstream.password ||
      upstream.port || upstream.pathname !== '/' || upstream.search || upstream.hash ||
      !/^[a-z0-9][a-z0-9-]*\.up\.railway\.app$/.test(upstream.hostname) ||
      (!restricted && upstream.hostname === FORBIDDEN_HOST)) throw new ProxyFailure(503)
  return upstream
}

// A local service binding never uses network fetch. It cannot activate on a public hostname.
function localConfiguration(env, frontend) {
  if (frontend.protocol !== 'https:' || frontend.hostname !== '127.0.0.1' ||
      !frontend.port || env.API_ALLOWED_ORIGIN !== frontend.origin ||
      env.API_LOCAL_RUNTIME !== 'true' || env.API_STAGE !== 'local-synthetic' ||
      env.API_UPSTREAM || typeof env.API_LOCAL_BACKEND?.fetch !== 'function' ||
      !/^[A-Za-z0-9_-]{32,256}$/.test(env.API_PROXY_SECRET || '')) throw new ProxyFailure(503)
  return new URL('https://synthetic-backend.invalid')
}

// Dependency injection is for offline tests; the Pages entry uses the real platform fetch.
export function createApiProxy({ fetchImpl = globalThis.fetch, timeoutMs = 15000, maxBodyBytes = MAX_BODY } = {}) {
  return async function handle({ request, env = {} }) {
    let timer
    let abort
    const state = {}
    const head = request.method === 'HEAD'
    try {
      const url = new URL(request.url)
      if (!/^\/api(?:\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname)) throw new ProxyFailure(400)
      if (!METHODS.includes(request.method)) {
        const response = json(405, { error: 'Method not allowed.' }, head)
        response.headers.set('Allow', METHODS.join(', '))
        return response
      }
      const origin = request.headers.get('origin')
      const site = request.headers.get('sec-fetch-site')
      if ((origin && origin !== url.origin) ||
          (!SAFE.has(request.method) && origin !== url.origin) ||
          (site && !['same-origin', 'none'].includes(site))) throw new ProxyFailure(403)
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: privateHeaders() })
      }
      const mode = env.API_MODE || 'disabled'
      if (mode === 'disabled') {
        return json(url.pathname === '/api/auth/me' ? 401 : 503,
          { error: 'API disabled in this preview.', preview: true }, head)
      }
      if (mode === 'synthetic') {
        if (!SAFE.has(request.method)) return json(403, { error: 'Read-only synthetic preview.' }, head)
        if (url.pathname === '/api/health') return json(200, { status: 'ok', synthetic: true }, head)
        if (url.pathname === '/api/loan-products') return json(200, {
          synthetic: true,
          products: [{ id: 'synthetic-product', name: 'Synthetic preview product', min_amount: 100, max_amount: 1000 }],
        }, head)
        return json(url.pathname === '/api/auth/me' ? 401 : 403,
          { error: 'No customer or staff data is available in this preview.', synthetic: true }, head)
      }
      const restricted = mode === 'railway-postgres'
      const local = mode === 'local-synthetic'
      if (mode !== 'railway' && !local && !restricted) throw new ProxyFailure(503)
      if (restricted && blockedFinancialWrite(request.method,url.pathname)) return json(503,{ error: 'Financial writes are disabled.' },head)
      const upstream = local ? localConfiguration(env, url) : configuration(env, url, restricted)
      const dispatch = local ? env.API_LOCAL_BACKEND.fetch.bind(env.API_LOCAL_BACKEND) : fetchImpl
      // Cloudflare owns request.cf/CF-Connecting-IP. Local/node requests cannot enable forwarding.
      const clientIp = local ? '127.0.0.1' : request.headers.get('cf-connecting-ip') || ''
      if ((!local && !request.cf?.colo) || !validIp(clientIp)) throw new ProxyFailure(503)
      const cookie = sessionCookie(request.headers.get('cookie'))
      const length = request.headers.get('content-length')
      if (length && (!/^\d+$/.test(length) || Number(length) > maxBodyBytes)) throw new ProxyFailure(413)
      if (!SAFE.has(request.method)) {
        const type = request.headers.get('content-type') || ''
        if (!/^application\/json(?:;|$)/i.test(type) &&
            !/^multipart\/form-data;\s*boundary=/i.test(type)) throw new ProxyFailure(415)
      }
      const headers = new Headers({
        Origin: url.origin,
        'X-Adele-Proxy-Secret': env.API_PROXY_SECRET,
        'X-Adele-Client-IP': clientIp,
        'X-Adele-Proxy-Stage': restricted ? 'postgres-restricted' : 'synthetic-sandbox',
        Accept: request.headers.get('accept') || 'application/json',
      })
      abort = new AbortController()
      timer = setTimeout(() => abort.abort(), timeoutMs)
      const nonce = crypto.randomUUID()
      const probeHeaders = new Headers(headers)
      probeHeaders.set('X-Adele-Preview-Nonce', nonce)
      const probeUrl = new URL(upstream)
      probeUrl.pathname = '/api/preview/identity'
      const options = {
        redirect: 'manual', cache: 'no-store', signal: abort.signal,
      }
      await identity(await dispatch(probeUrl.toString(), { ...options, method: 'GET', headers: probeHeaders }), nonce, restricted)
      const target = new URL(upstream)
      target.pathname = url.pathname
      target.search = url.search
      if (cookie) headers.set('Cookie', cookie)
      const contentType = request.headers.get('content-type')
      if (contentType) headers.set('Content-Type', contentType)
      const body = !SAFE.has(request.method) && request.body
        ? limitedBody(request.body, maxBodyBytes, state) : undefined
      const response = await dispatch(target.toString(), {
        ...options, method: request.method, headers, body,
        ...(body ? { duplex: 'half' } : {}),
      })
      if (response.status >= 300 && response.status < 400) throw new ProxyFailure(502)
      if (response.headers.get('x-adele-data-class') !== (restricted ? 'restricted-postgres' : 'synthetic-only')) throw new ProxyFailure(502)
      const resultHeaders = privateHeaders()
      for (const key of ['content-type', 'content-disposition', 'allow', 'retry-after']) {
        if (response.headers.has(key)) resultHeaders.set(key, response.headers.get(key))
      }
      for (const cookieHeader of secureCookies(response.headers)) resultHeaders.append('Set-Cookie', cookieHeader)
      return new Response(head ? null : response.body, { status: response.status, headers: resultHeaders })
    } catch (error) {
      return json(state.oversize ? 413 : abort?.signal.aborted ? 504 :
        error instanceof ProxyFailure ? error.status : 502,
      { error: 'API request unavailable or refused.' }, head)
    } finally {
      clearTimeout(timer)
    }
  }
}

export const onRequest = createApiProxy()
