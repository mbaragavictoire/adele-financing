import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createApiProxy } from '../cloudflare/api-proxy.js'
import { assertPreviewBuild } from '../cloudflare/build-policy.js'
import { createSandboxProxyIngress } from '../server/proxyIngress.js'
import { clientIp } from '../server/clientIp.js'
import { syntheticAdminFixture } from '../scripts/temp-admin.mjs'
import { onRequest as bareRoute } from '../functions/api.js'
import { onRequest as nestedRoute } from '../functions/api/[[path]].js'

const FRONTEND = 'https://synthetic-preview.example'
const ORIGIN = 'https://adele-synthetic-tests.up.railway.app'
const SECRET = randomBytes(32).toString('base64url')
const TOKEN = randomBytes(32).toString('base64url')
const ENV = {
  API_MODE: 'railway',
  API_STAGE: 'synthetic-sandbox',
  API_ALLOWED_ORIGIN: FRONTEND,
  API_UPSTREAM: ORIGIN,
  API_PROXY_SECRET: SECRET,
}
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function req(route, { method = 'GET', headers = {}, body, edge = true, origin = FRONTEND } = {}) {
  const request = new Request(FRONTEND + route, {
    method,
    headers: { ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': '203.0.113.10', ...headers },
    ...(body !== undefined ? { body } : {}),
  })
  if (edge) Object.defineProperty(request, 'cf', { value: { colo: 'TEST' } })
  return request
}

function upstream(body = { synthetic: true }, { status = 200, headers = {} } = {}) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'X-Adele-Data-Class': 'synthetic-only', ...headers },
  })
}

function backend(handler = () => upstream()) {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: new URL(url), init })
    if (new URL(url).pathname === '/api/preview/identity') {
      return upstream({ kind: 'adele-synthetic-sandbox', nonce: init.headers.get('x-adele-preview-nonce') })
    }
    return handler(url, init)
  }
  return { calls, handle: createApiProxy({ fetchImpl }) }
}

function guardEnv(extra = {}) {
  return {
    ADELE_PROXY_SANDBOX_ONLY: 'true',
    DB_NAME: 'adele_synthetic_offline',
    API_ALLOWED_ORIGIN: FRONTEND,
    API_PROXY_SECRET: SECRET,
    ...extra,
  }
}

function guardRequest(extra = {}) {
  return {
    path: '/customers',
    method: 'GET',
    headers: {
      origin: FRONTEND,
      'x-adele-proxy-secret': SECRET,
      'x-adele-proxy-stage': 'synthetic-sandbox',
      'x-adele-client-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.200',
    },
    ...extra,
  }
}

function runGuard(request, env = guardEnv()) {
  const response = {
    headers: {}, statusCode: 200, body: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
  }
  let next = false
  createSandboxProxyIngress(env)(request, response, () => { next = true })
  return { response, next, request }
}

test('both Pages route entries expose the same handler; route coverage includes bare and nested API', () => {
  assert.equal(bareRoute, nestedRoute)
  const routes = JSON.parse(fs.readFileSync(path.join(PROJECT, 'public/_routes.json')))
  assert.deepEqual(routes.include, ['/api', '/api/*', '/*'])
})

test('missing/disabled config never fetches; guest auth gets 401 instead of SPA HTML', async () => {
  let count = 0
  const handle = createApiProxy({ fetchImpl() { count++; throw Error('No network allowed') } })
  for (const [route, expected] of [['/api', 503], ['/api/loans', 503], ['/api/auth/me', 401]]) {
    const response = await handle({ request: req(route) })
    assert.equal(response.status, expected)
    assert.match(response.headers.get('content-type'), /application\/json/)
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
  assert.equal(count, 0)
})

test('synthetic preview permits only public fixture reads; no auth, customer access or writes', async () => {
  let count = 0
  const handle = createApiProxy({ fetchImpl() { count++; throw Error('No network allowed') } })
  for (const route of ['/api/health', '/api/loan-products']) {
    const response = await handle({ request: req(route), env: { API_MODE: 'synthetic' } })
    assert.equal(response.status, 200)
    assert.equal((await response.json()).synthetic, true)
  }
  for (const route of ['/api/customers', '/api/loans', '/api/reports', '/api/apply/documents/1/file']) {
    assert.equal((await handle({ request: req(route), env: { API_MODE: 'synthetic' } })).status, 403)
  }
  for (const route of ['/api/auth/login', '/api/loans/disburse', '/api/repayments', '/api/apply', '/api/contact']) {
    assert.equal((await handle({ request: req(route, { method: 'POST' }), env: { API_MODE: 'synthetic' } })).status, 403)
  }
  assert.equal(count, 0)
})

test('routing rejects encoded separators, encoded traversal, doubled slashes and non-API routes', async () => {
  for (const route of ['/api/%2Fcustomers', '/api/%252e%252e', '/api//loans', '/api/%5Cadmin', '/admin', '/api../loans']) {
    const b = backend()
    assert.equal((await b.handle({ request: req(route), env: ENV })).status, 400, route)
    assert.equal(b.calls.length, 0)
  }
})

test('unsafe CORS/origin requests, absent write Origin and same-site sibling requests are rejected before fetch', async () => {
  const cases = [
    req('/api/auth/login', { method: 'POST', origin: 'https://evil.example' }),
    req('/api/auth/login', { method: 'POST', origin: null }),
    req('/api/auth/login', { method: 'POST', origin: 'http://synthetic-preview.example' }),
    req('/api/customers', { origin: 'https://sibling.example' }),
    req('/api/customers', { headers: { 'Sec-Fetch-Site': 'cross-site' } }),
    req('/api/customers', { headers: { 'Sec-Fetch-Site': 'same-site' } }),
  ]
  for (const request of cases) {
    const b = backend()
    const response = await b.handle({ request, env: ENV })
    assert.equal(response.status, 403)
    assert.equal(response.headers.has('access-control-allow-origin'), false)
    assert.equal(b.calls.length, 0)
  }
})

test('same-origin OPTIONS is local and private; unsupported method is not forwarded', async () => {
  const b = backend()
  assert.equal((await b.handle({ request: req('/api/loans', { method: 'OPTIONS' }), env: ENV })).status, 204)
  assert.equal((await b.handle({ request: req('/api/loans', { method: 'PATCH' }), env: ENV })).status, 405)
  assert.equal(b.calls.length, 0)
})

test('unsafe fixed origins/configurations cannot forward, including the known production origin', async () => {
  const origins = [
    'http://adele-synthetic-tests.up.railway.app',
    'https://adele-financing-production.up.railway.app',
    'https://evil.example',
    'https://foo.up.railway.app.evil.example',
    'https://user:pass@adele-synthetic-tests.up.railway.app',
    ORIGIN + '/api',
    ORIGIN + '?target=elsewhere',
    ORIGIN + '#fragment',
    ORIGIN.replace('.app', '.app:444'),
  ]
  for (const value of origins) {
    const b = backend()
    assert.equal((await b.handle({ request: req('/api/health'), env: { ...ENV, API_UPSTREAM: value } })).status, 503)
    assert.equal(b.calls.length, 0)
  }
  for (const config of [{ API_STAGE: 'production' }, { API_PROXY_SECRET: '' }, { API_ALLOWED_ORIGIN: 'https://other.example' }]) {
    const b = backend()
    assert.equal((await b.handle({ request: req('/api/health'), env: { ...ENV, ...config } })).status, 503)
    assert.equal(b.calls.length, 0)
  }
})

test('Railway forwarding requires platform-owned edge context and a valid connecting IP', async () => {
  for (const request of [
    req('/api/health', { edge: false }),
    req('/api/health', { headers: { 'CF-Connecting-IP': 'not-an-ip' } }),
    req('/api/health', { headers: { 'CF-Connecting-IP': '256.1.1.1' } }),
  ]) {
    const b = backend()
    assert.equal((await b.handle({ request, env: ENV })).status, 503)
    assert.equal(b.calls.length, 0)
  }
})

test('identity probe refuses a non-synthetic origin before forwarding any write', async () => {
  let count = 0
  const handle = createApiProxy({ fetchImpl: async () => { count++; return new Response('{}', { status: 200 }) } })
  const response = await handle({
    request: req('/api/repayments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
    env: ENV,
  })
  assert.equal(response.status, 502)
  assert.equal(count, 1)
})

test('fixed target preserves API path/query while discarding client forwarding/auth headers and unrelated cookies', async () => {
  const b = backend()
  const response = await b.handle({ request: req('/api/loans?next=https%3A%2F%2Fevil.example&quarter=1', {
    headers: {
      Cookie: 'CF_Authorization=not-forwarded; unrelated=not-forwarded; adele_session=' + TOKEN,
      Authorization: 'not-forwarded',
      'X-Forwarded-For': '198.51.100.99',
      'X-Adele-Proxy-Secret': 'spoofed',
      'X-Adele-Client-IP': '198.51.100.99',
      'X-Forwarded-Host': 'evil.example',
    },
  }), env: ENV })
  assert.equal(response.status, 200)
  const actual = b.calls[1]
  assert.equal(actual.url.origin, ORIGIN)
  assert.equal(actual.url.pathname, '/api/loans')
  assert.equal(actual.url.searchParams.get('quarter'), '1')
  assert.equal(actual.init.headers.get('origin'), FRONTEND)
  assert.equal(actual.init.headers.get('cookie'), 'adele_session=' + TOKEN)
  assert.equal(actual.init.headers.get('authorization'), null)
  assert.equal(actual.init.headers.get('x-forwarded-for'), null)
  assert.equal(actual.init.headers.get('x-forwarded-host'), null)
  assert.equal(actual.init.headers.get('x-adele-proxy-secret'), SECRET)
  assert.equal(actual.init.headers.get('x-adele-client-ip'), '203.0.113.10')
  assert.equal(b.calls[0].init.headers.get('cookie'), null)
})

test('duplicate/invalid session cookies fail before any upstream request', async () => {
  for (const Cookie of ['adele_session=bad', 'adele_session=' + TOKEN + '; adele_session=' + TOKEN]) {
    const b = backend()
    assert.equal((await b.handle({ request: req('/api/auth/me', { headers: { Cookie } }), env: ENV })).status, 400)
    assert.equal(b.calls.length, 0)
  }
})

test('login cookie, subsequent authenticated request and logout clearing cookie survive the proxy', async () => {
  let loggedIn = false
  const cookie = 'adele_session=' + TOKEN + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600'
  const clear = 'adele_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
  const b = backend(async (url, init) => {
    if (new URL(url).pathname.endsWith('/login')) {
      // No real credential validation: the test-only backend has no database or users.
      await new Response(init.body).text()
      loggedIn = true
      return upstream({ synthetic: true }, { headers: { 'Set-Cookie': cookie } })
    }
    if (new URL(url).pathname.endsWith('/logout')) {
      loggedIn = false
      return upstream({ synthetic: true }, { headers: { 'Set-Cookie': clear } })
    }
    return upstream({ synthetic: true, authenticated: loggedIn && init.headers.get('cookie') === 'adele_session=' + TOKEN })
  })
  const login = await b.handle({ request: req('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }), env: ENV })
  assert.deepEqual(login.headers.getSetCookie(), [cookie])
  const me = await b.handle({ request: req('/api/auth/me', { headers: { Cookie: 'adele_session=' + TOKEN } }), env: ENV })
  assert.equal((await me.json()).authenticated, true)
  const logout = await b.handle({ request: req('/api/auth/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'adele_session=' + TOKEN }, body: '{}',
  }), env: ENV })
  assert.deepEqual(logout.headers.getSetCookie(), [clear])
  assert.equal(loggedIn, false)
})

test('separate Set-Cookie headers are never comma-joined', async () => {
  const cookies = [
    'adele_session=' + TOKEN + '; Path=/; HttpOnly; Secure; SameSite=Strict',
    'adele_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]
  const b = backend(() => {
    const response = upstream()
    for (const cookie of cookies) response.headers.append('Set-Cookie', cookie)
    return response
  })
  const response = await b.handle({ request: req('/api/auth/me'), env: ENV })
  assert.deepEqual(response.headers.getSetCookie(), cookies)
})

test('unsafe upstream cookie domains, attributes or extra cookie names fail closed', async () => {
  const base = 'adele_session=' + TOKEN
  const cookies = [
    base + '; Path=/; HttpOnly; Secure; SameSite=Strict; Domain=.example',
    base + '; Path=/; HttpOnly; SameSite=Strict',
    base + '; Path=/; Secure; SameSite=Strict',
    base + '; Path=/; HttpOnly; Secure; SameSite=None',
    base + '; Path=/api; HttpOnly; Secure; SameSite=Strict',
    'other=' + TOKEN + '; Path=/; HttpOnly; Secure; SameSite=Strict',
    'adele_session=; Path=/; HttpOnly; Secure; SameSite=Strict',
  ]
  for (const cookie of cookies) {
    const b = backend(() => upstream({}, { headers: { 'Set-Cookie': cookie } }))
    const response = await b.handle({ request: req('/api/auth/me'), env: ENV })
    assert.equal(response.status, 502)
    assert.equal(response.headers.has('set-cookie'), false)
  }
})

test('API responses never cache or expose upstream CORS/auth/proxy diagnostics', async () => {
  const b = backend(() => upstream({}, { headers: {
    'Cache-Control': 'public, max-age=600',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Credentials': 'true',
    'X-Adele-Proxy-Secret': SECRET,
    'X-Powered-By': 'not-forwarded',
  } }))
  const response = await b.handle({ request: req('/api/customers'), env: ENV })
  for (const header of ['cache-control', 'cdn-cache-control', 'cloudflare-cdn-cache-control']) {
    assert.match(response.headers.get(header), /no-store/)
  }
  for (const header of ['access-control-allow-origin', 'access-control-allow-credentials', 'x-adele-proxy-secret', 'x-powered-by']) {
    assert.equal(response.headers.has(header), false)
  }
  assert.equal(b.calls[1].init.redirect, 'manual')
  assert.equal(b.calls[1].init.cache, 'no-store')
  assert.equal(b.calls[1].init.cf, undefined)
})

test('redirects and missing synthetic response markers are refused; no credential follows a redirect', async () => {
  for (const response of [
    new Response(null, { status: 302, headers: { Location: 'https://evil.example', 'X-Adele-Data-Class': 'synthetic-only' } }),
    new Response('{}', { status: 200 }),
  ]) {
    const b = backend(() => response)
    assert.equal((await b.handle({ request: req('/api/auth/me'), env: ENV })).status, 502)
    assert.equal(b.calls.length, 2)
  }
})

test('multipart bytes/boundary are preserved for the sandbox, not JSON-reencoded', async () => {
  const data = new FormData()
  data.set('purpose', 'synthetic-only')
  data.set('documents', new Blob(['%PDF-synthetic-fixture'], { type: 'application/pdf' }), 'synthetic.pdf')
  let seen
  const b = backend(async (_url, init) => {
    const incoming = new Request(ORIGIN + '/api/apply', init)
    seen = await incoming.formData()
    return upstream()
  })
  const response = await b.handle({ request: req('/api/apply', { method: 'POST', body: data }), env: ENV })
  assert.equal(response.status, 200)
  assert.equal(seen.get('purpose'), 'synthetic-only')
  assert.equal(await seen.get('documents').text(), '%PDF-synthetic-fixture')
  assert.match(b.calls[1].init.headers.get('content-type'), /multipart\/form-data; boundary=/)
})

test('body sizes are bounded with and without Content-Length; unsupported types are refused', async () => {
  const declared = backend()
  assert.equal((await declared.handle({ request: req('/api/contact', {
    method: 'POST', headers: { 'Content-Length': '999999999', 'Content-Type': 'application/json' }, body: '{}',
  }), env: ENV })).status, 413)
  assert.equal(declared.calls.length, 0)
  const handle = createApiProxy({ maxBodyBytes: 8, fetchImpl: async (url, init) => {
    if (url.endsWith('/identity')) return upstream({ kind: 'adele-synthetic-sandbox', nonce: init.headers.get('x-adele-preview-nonce') })
    await new Response(init.body).text()
    return upstream()
  } })
  assert.equal((await handle({ request: req('/api/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ synthetic: true }),
  }), env: ENV })).status, 413)
  const type = backend()
  assert.equal((await type.handle({ request: req('/api/contact', {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'synthetic',
  }), env: ENV })).status, 415)
})

test('upstream failure and timeout are generic and reveal no exception details', async () => {
  const error = createApiProxy({ fetchImpl: async () => { throw Error('private diagnostic must not escape') } })
  const failed = await error({ request: req('/api/health'), env: ENV })
  assert.equal(failed.status, 502)
  assert.equal((await failed.text()).includes('private diagnostic'), false)
  const timeout = createApiProxy({ timeoutMs: 5, fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })
  }) })
  assert.equal((await timeout({ request: req('/api/health'), env: ENV })).status, 504)
})

test('HEAD responses carry no body', async () => {
  const b = backend()
  const response = await b.handle({ request: req('/api/health', { method: 'HEAD' }), env: ENV })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), '')
})

test('backend ingress refuses source DB, absent sandbox flag, insecure origin and missing secret', () => {
  for (const change of [{ DB_NAME: 'adele_lms' }, { DB_NAME: 'adele_restore_test_20261019' },
    { ADELE_PROXY_SANDBOX_ONLY: '' }, { API_PROXY_SECRET: '' }, { API_ALLOWED_ORIGIN: 'http://synthetic.example' }]) {
    assert.throws(() => createSandboxProxyIngress(guardEnv(change)))
  }
})

test('backend direct requests/wrong origin/IP/secret are denied; trusted headers replace spoofed forwarding', () => {
  for (const [header, value] of [
    ['x-adele-proxy-secret', 'wrong'], ['origin', 'https://evil.example'],
    ['x-adele-client-ip', 'bad'], ['x-adele-proxy-stage', 'production'],
  ]) {
    const request = guardRequest()
    request.headers[header] = value
    const result = runGuard(request)
    assert.equal(result.response.statusCode, 403)
    assert.equal(result.next, false)
  }
  const result = runGuard(guardRequest())
  assert.equal(result.next, true)
  assert.equal(result.request.headers['x-adele-proxy-secret'], undefined)
  assert.equal(clientIp(result.request), '203.0.113.10')
  assert.equal(result.request.headers['x-forwarded-for'], '203.0.113.10')
  assert.equal(clientIp({ ip: '127.0.0.1', headers: { 'x-forwarded-for': '198.51.100.200' } }), '127.0.0.1')
})

test('authenticated sandbox identity echoes a bounded nonce and never queries a database', () => {
  const request = guardRequest({ path: '/preview/identity' })
  request.headers['x-adele-preview-nonce'] = randomBytes(24).toString('base64url')
  const result = runGuard(request)
  assert.equal(result.next, false)
  assert.equal(result.response.body.kind, 'adele-synthetic-sandbox')
  assert.equal(result.response.body.nonce, request.headers['x-adele-preview-nonce'])
  assert.equal(result.response.headers['x-adele-data-class'], 'synthetic-only')
  const invalid = guardRequest({ path: '/preview/identity' })
  invalid.headers['x-adele-preview-nonce'] = ''
  assert.equal(runGuard(invalid).response.statusCode, 400)
})

test('temporary-admin fixture cannot authenticate or import database/bootstrap code', () => {
  assert.equal(syntheticAdminFixture.canAuthenticate, false)
  assert.equal(syntheticAdminFixture.status, 'inactive')
  for (const key of ['password', 'password_hash', 'token', 'secret']) assert.equal(key in syntheticAdminFixture, false)
  const result = spawnSync(process.execPath, [path.join(PROJECT, 'scripts/temp-admin.mjs')], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /disabled/)
  const source = fs.readFileSync(path.join(PROJECT, 'scripts/temp-admin.mjs'), 'utf8')
  assert.equal(/initDb|mysql|dotenv|INSERT|DELETE FROM/.test(source), false)
})

test('preview build policy rejects external API configuration and UI avoids AuthProvider in preview', () => {
  assert.throws(() => assertPreviewBuild({ VITE_API_URL: 'https://live.example' }))
  assert.throws(() => assertPreviewBuild({ VITE_ADELE_PREVIEW_ONLY: 'true', VITE_API_URL: 'https://live.example' }))
  assert.doesNotThrow(() => assertPreviewBuild({ VITE_API_URL: '' }))
  const source = fs.readFileSync(path.join(PROJECT, 'src/App.jsx'), 'utf8')
  assert.match(source, /if \(IS_PREVIEW_ONLY\) return <PreviewRoutes \/>/)
  const preview = source.slice(source.indexOf('function PreviewRoutes()'), source.indexOf('function App()'))
  assert.doesNotMatch(preview, /AuthProvider|AdminLogin|<Apply|<Contact/)
  assert.match(preview, /path="admin\/\*"/)
})


test('Vite dev/preview middleware uses only synthetic APIs and never the working localhost backend', async () => {
  const { syntheticPreviewApi } = await import('../cloudflare/vite-preview.js')
  for (const hook of ['configureServer', 'configurePreviewServer']) {
    let middleware
    syntheticPreviewApi()[hook]({ middlewares: { use(value) { middleware = value } } })
    for (const [url, method, expected] of [['/api/health', 'GET', 200], ['/api/customers', 'GET', 403], ['/api/repayments', 'POST', 403]]) {
      const incoming = { url, method, headers: { host: 'localhost:5173', origin: 'http://localhost:5173' }, resume() {} }
      const outgoing = { writeHead(status, headers) { this.status = status; this.headers = headers }, end(body) { this.body = body } }
      await middleware(incoming, outgoing, () => assert.fail('API must never fall through to another handler'))
      assert.equal(outgoing.status, expected)
      assert.match(outgoing.headers['cache-control'], /no-store/)
    }
    let next = false
    await middleware({ url: '/about', headers: { host: 'localhost:5173' } }, {}, () => { next = true })
    assert.equal(next, true)
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(PROJECT, 'package.json'))).scripts.dev, 'vite')
  assert.doesNotMatch(fs.readFileSync(path.join(PROJECT, 'vite.config.js'), 'utf8'), /localhost:4000|proxy:/)
})

test('Pages middleware rejects malformed API paths before SPA fallback', async () => {
  const { onRequest } = await import('../functions/_middleware.js')
  let next = false
  const response = await onRequest({ request: req('/api//loans'), env: { API_MODE: 'synthetic' }, next() { next = true } })
  assert.equal(response.status, 400)
  assert.equal(next, false)
  await onRequest({ request: req('/about'), next() { next = true } })
  assert.equal(next, true)
})

test('local runtime service bindings cannot activate on public hosts or with a network upstream', async () => {
  let called = 0
  const binding = { fetch: async (url, init) => {
    called++
    if (url.endsWith('/identity')) return upstream({ kind: 'adele-synthetic-sandbox', nonce: init.headers.get('x-adele-preview-nonce') })
    return upstream({ synthetic: true })
  } }
  const env = { API_MODE: 'local-synthetic', API_STAGE: 'local-synthetic', API_LOCAL_RUNTIME: 'true', API_PROXY_SECRET: SECRET, API_LOCAL_BACKEND: binding, API_ALLOWED_ORIGIN: 'https://127.0.0.1:4443' }
  const handle = createApiProxy({ fetchImpl() { assert.fail('Local mode must not use global network fetch') } })
  const local = () => new Request('https://127.0.0.1:4443/api/auth/me')
  assert.equal((await handle({ request: local(), env })).status, 200)
  assert.equal(called, 2)
  for (const change of [{ API_UPSTREAM: ORIGIN }, { API_LOCAL_RUNTIME: '' }, { API_LOCAL_BACKEND: undefined }, { API_STAGE: 'production' }]) {
    assert.equal((await handle({ request: local(), env: { ...env, ...change } })).status, 503)
  }
  assert.equal((await handle({ request: req('/api/auth/me'), env: { ...env, API_ALLOWED_ORIGIN: FRONTEND } })).status, 503)
  assert.equal(called, 2)
})

test('all-route Pages middleware refuses encoded API prefixes and private files without SPA fallback', async () => {
  const { onRequest } = await import('../functions/_middleware.js')
  const routes = JSON.parse(fs.readFileSync(path.join(PROJECT, 'public/_routes.json'), 'utf8').replace(/^\uFEFF/, ''))
  assert.ok(routes.include.includes('/*'))
  assert.deepEqual(routes.exclude, [])
  for (const [route, status] of [
    ['/api%2Floans', 400], ['/%61pi/auth/login', 400], ['/%2561pi/loans', 400],
    ['/API/loans', 400], ['//api/loans', 400], ['/api//loans', 400],
    ['/server/.env', 403], ['/.env', 403], ['/.git/config', 403],
    ['/uploads/customer.pdf', 403], ['/backups/source.sql', 403],
  ]) {
    let fellThrough = false
    const response = await onRequest({ request: req(route), env: { API_MODE: 'synthetic' },
      next() { fellThrough = true; return new Response('SPA') } })
    assert.equal(response.status, status, route)
    assert.equal(fellThrough, false, route)
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
  let servedAsset = false
  await onRequest({ request: req('/assets/Uwamahoro%20divine-test.jpeg'),
    next() { servedAsset = true; return new Response('Public brochure asset') } })
  assert.equal(servedAsset, true)
})
