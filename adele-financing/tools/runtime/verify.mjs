import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import net from 'node:net'
import assert from 'node:assert/strict'
import { randomBytes, X509Certificate } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'
import { createSyntheticBackend } from './synthetic-backend.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
process.chdir(ROOT)
const OUT = path.join(ROOT, 'server/data/runtime-tests')
fs.mkdirSync(path.join(OUT, 'screenshots'), { recursive: true })
if (fs.existsSync(path.join(OUT, 'results.json'))) fs.copyFileSync(path.join(OUT, 'results.json'), path.join(OUT, 'results-' + Date.now() + '.json'), fs.constants.COPYFILE_EXCL)
const results = []
const blockedBrowserOrigins = new Set()
let outboundAttempts = 0
let browser
let wrangler
let mf
let tlsFront
let wranglerOutput = ''
let fatal
const runtimes = {}
const commands = []
const keyPath = path.join(OUT, 'loopback-key.pem')
const certPath = path.join(OUT, 'loopback-cert.pem')
let loopbackCA

function verifyProcessIsolation() {
  throw Error('BLOCKED: process-level network isolation has not been enforced and demonstrated. Do not start runtime/browser tests directly on the host.')
}

function verifyLocalCertificate() {
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('TLS verification must remain enabled.')
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) throw Error('BLOCKED: provision a trusted loopback test certificate; automatic trust changes are forbidden.')
  loopbackCA = fs.readFileSync(certPath)
  const cert = new X509Certificate(loopbackCA)
  if (Date.now() < Date.parse(cert.validFrom) || Date.now() >= Date.parse(cert.validTo)) {
    throw Error('BLOCKED: local loopback certificate is outside its validity period. No runtime or browser started; a fresh certificate and approved browser trust setup are required.')
  }
  if (cert.checkIP('127.0.0.1') !== '127.0.0.1') throw Error('BLOCKED: local certificate must explicitly cover 127.0.0.1.')
}

async function check(name, fn) {
  try {
    await fn()
    results.push({ name, status: 'PASS' })
    console.log('PASS ' + name)
  } catch (error) {
    results.push({ name, status: 'FAIL', message: String(error.message).slice(0, 700) })
    console.log('FAIL ' + name + ': ' + String(error.message).slice(0, 300))
  }
}
function run(args) {
  commands.push('node ' + args.join(' '))
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT, env: runtimeEnv(), encoding: 'utf8', timeout: 120000,
    maxBuffer: 4 * 1024 * 1024, windowsHide: true,
  })
  if (result.status !== 0) throw Error('Local command failed: ' + (result.stderr || result.stdout).slice(-1200))
  return result.stdout
}
function runtimeEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^(?:CLOUDFLARE_|CF_|DB_|DATABASE|SUPABASE|SEED_|SESSION_|API_)/.test(key)) delete env[key]
  }
  return { ...env, WRANGLER_SEND_METRICS: 'false', CLOUDFLARE_CF_FETCH_ENABLED: 'false',
    WRANGLER_LOG_PATH: path.join(OUT, 'wrangler-runtime.log'), CI: 'true', BROWSER: 'none' }
}
async function port() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve))
  const value = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return value
}
function request(origin, resource, { method = 'GET', headers = {}, body } = {}) {
  const url = new URL(origin)
  assert.equal(url.protocol, 'https:')
  assert.equal(url.hostname, '127.0.0.1')
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: '127.0.0.1', port: Number(url.port), path: resource, method,
      // Explicit local trust anchor; validity and hostname checks stay enabled.
      ca: loopbackCA, rejectUnauthorized: true, headers,
    }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers,
        bytes: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }))
    })
    req.on('error', reject)
    req.setTimeout(5000, () => req.destroy(Error('Local request timed out')))
    if (body) req.write(body)
    req.end()
  })
}
async function waitReady(origin, process) {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (process?.exitCode !== null && process?.exitCode !== undefined) {
      throw Error('Wrangler exited: ' + wranglerOutput.slice(-1600))
    }
    try { const value = await request(origin, '/api/health'); if (value.status === 200) return } catch { /* polling own loopback only */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw Error('Local runtime did not become ready: ' + wranglerOutput.slice(-1600))
}
function stopWrangler() {
  if (wrangler?.pid && wrangler.exitCode === null) {
    // This PID was created by this test harness; never target a user/system process.
    spawnSync('taskkill', ['/PID', String(wrangler.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
  }
  wrangler = null
}

const loginHtml = '<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Synthetic Login Harness</title></head><body>' +
  '<h1>Local synthetic login test</h1><form id="login"><label>Email<input id="email" autocomplete="off"></label>' +
  '<label>Password<input id="password" type="password" autocomplete="off"></label><button>Sign in</button></form>' +
  '<button id="check">Check session</button><button id="logout">Sign out</button><button id="error">Test error</button>' +
  '<p id="status">Signed out</p><script src="/__runtime__/login.js"></script></body></html>'
const loginScript = "const status=document.getElementById('status');" +
  "async function session(){const r=await fetch('/api/auth/me',{credentials:'include'});status.textContent=r.ok?'Signed in':'Signed out';}" +
  "document.getElementById('login').onsubmit=async(e)=>{e.preventDefault();status.textContent='Signing in';const r=await fetch('/api/auth/login',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});status.textContent=r.ok?'Signed in':'Sign-in failed';};" +
  "document.getElementById('check').onclick=session;" +
  "document.getElementById('logout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:'{}'});await session();};" +
  "document.getElementById('error').onclick=async()=>{const r=await fetch('/api/synthetic/error');status.textContent=r.ok?'Unexpected success':'Synthetic service unavailable';};session();"

function assets(request) {
  const url = new URL(request.url)
  const headers = {
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  }
  if (url.pathname === '/__runtime__/login') return new Response(loginHtml, { headers: { ...headers, 'Content-Type': 'text/html', 'Cache-Control': 'no-store' } })
  if (url.pathname === '/__runtime__/login.js') return new Response(loginScript, { headers: { ...headers, 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' } })
  if (url.pathname.startsWith('/api')) return new Response('{"error":"No API route."}', { status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  let name
  try { name = decodeURIComponent(url.pathname) } catch { return new Response('Bad path', { status: 400 }) }
  const dir = path.join(ROOT, 'dist')
  let file = path.resolve(dir, '.' + name)
  if (!file.startsWith(dir + path.sep) && file !== dir) return new Response('Forbidden', { status: 403 })
  if (/\/(?:\.env|server|uploads|data)(?:[/.]|$)/.test(name)) return new Response('Forbidden', { status: 403 })
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dir, 'index.html')
  const ext = path.extname(file)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
  return new Response(fs.readFileSync(file), { headers: { ...headers, 'Content-Type': types[ext] || 'application/octet-stream' } })
}

try {
  // Page routing and workerd outboundService do not isolate native child processes.
  // Keep this entry point closed until an enforced isolation launcher is implemented
  // and its negative egress probes pass. An environment-variable assertion is insufficient.
  verifyProcessIsolation()
  verifyLocalCertificate()
  console.log('Compiling real Pages Functions locally...')
  run(['tools/runtime/node_modules/wrangler/bin/wrangler.js', 'pages', 'functions', 'build', 'functions',
    '--outdir', 'server/data/runtime-tests/pages-worker', '--build-output-directory', 'dist',
    '--compatibility-date', '2026-10-19'])
  const pagesPort = await port()
  const pagesOrigin = 'https://127.0.0.1:' + pagesPort
  const args = ['tools/runtime/node_modules/wrangler/bin/wrangler.js', 'pages', 'dev', 'dist',
    '--ip', '127.0.0.1', '--port', String(pagesPort), '--local-protocol', 'https',
    '--https-key-path', keyPath, '--https-cert-path', certPath,
    '--binding', 'API_MODE=synthetic', '--show-interactive-dev-session=false', '--inspector-port', '0']
  commands.push('node ' + args.join(' '))
  wrangler = spawn(process.execPath, args, { cwd: ROOT, env: runtimeEnv(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  wrangler.stdout.on('data', (chunk) => { wranglerOutput += chunk.toString() })
  wrangler.stderr.on('data', (chunk) => { wranglerOutput += chunk.toString() })
  await waitReady(pagesOrigin, wrangler)
  runtimes.pages = { origin: pagesOrigin, mode: 'Wrangler Pages dev, local workerd, HTTPS, synthetic' }
  console.log('Wrangler Pages HTTPS runtime ready on loopback.')
  browser = await chromium.launch({ channel: 'msedge', headless: true,
    args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] })
  runtimes.browser = { channel: 'msedge', version: browser.version(), ephemeralProfile: true }
  let context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' })
  const allowed = new Set([pagesOrigin])
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === 'https://attacker.invalid') return route.fulfill({ contentType: 'text/html', body: '<h1>Local synthetic attacker fixture</h1>' })
    if (allowed.has(url.origin)) return route.continue()
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return route.continue()
    blockedBrowserOrigins.add(url.origin)
    return route.abort('blockedbyclient')
  })
  let page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await check('Wrangler Pages route, no-cache, denied writes and customer/document isolation', async () => {
    for (const [route, status] of [
      ['/api/health', 200], ['/api', 403], ['/api/auth/me', 401],
      ['/api/customers', 403], ['/api/loans', 403], ['/api/apply/documents/1/file', 403],
    ]) {
      const response = await request(pagesOrigin, route)
      assert.equal(response.status, status, route)
      assert.match(response.headers['content-type'], /application\/json/)
      assert.match(response.headers['cache-control'], /no-store/)
    }
    for (const route of ['/api/auth/login', '/api/loans/disburse', '/api/repayments', '/api/contact']) {
      const response = await request(pagesOrigin, route, { method: 'POST', headers: { Origin: pagesOrigin, 'Content-Type': 'application/json' }, body: '{}' })
      assert.equal(response.status, 403)
    }
  })
  await check('Wrangler CORS rejects foreign Origin and originless writes', async () => {
    for (const headers of [{ Origin: 'https://attacker.invalid' }, {}]) {
      const response = await request(pagesOrigin, '/api/repayments', { method: 'POST', headers, body: '{}' })
      assert.equal(response.status, 403)
      assert.equal(response.headers['access-control-allow-origin'], undefined)
    }
  })
  await check('Wrangler path traversal and encoded API routes do not expose files', async () => {
    for (const route of ['/api/%2fcustomers', '/api/%252e%252e', '/api//loans', '/api/%5cadmin']) {
      const response = await request(pagesOrigin, route)
      assert.ok([400, 403, 404].includes(response.status), route + ' status ' + response.status)
      assert.doesNotMatch(response.text, /DB_PASSWORD|password_hash|file_path/)
    }
  })
  await check('Browser preview home loads without JavaScript exceptions', async () => {
    await page.goto(pagesOrigin, { waitUntil: 'networkidle' })
    assert.match(await page.locator('[role="status"]').innerText(), /Synthetic preview only/)
    assert.equal(pageErrors.length, 0, pageErrors.join('; '))
    await page.screenshot({ path: path.join(OUT, 'screenshots/desktop.png'), fullPage: true })
  })
  await check('Browser navigation and deep links preserve SPA routing', async () => {
    await page.locator('a[href="/about"]').first().click()
    await page.waitForURL('**/about')
    await page.reload({ waitUntil: 'domcontentloaded' })
    assert.match(await page.locator('[role="status"]').innerText(), /Synthetic preview only/)
  })
  await check('Browser login, contact and application screens are explicitly unavailable', async () => {
    for (const route of ['/admin/login', '/apply', '/contact']) {
      await page.goto(pagesOrigin + route, { waitUntil: 'networkidle' })
      assert.match(await page.locator('h1').innerText(), /Unavailable in this preview/)
      assert.equal(await page.locator('input[type=password]').count(), 0)
      assert.equal(await page.locator('form').count(), 0)
    }
  })
  await check('Responsive mobile/tablet preview has no horizontal overflow', async () => {
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(size)
      await page.goto(pagesOrigin, { waitUntil: 'networkidle' })
      const dimensions = await page.evaluate(() => ({ width: window.innerWidth, content: document.documentElement.scrollWidth }))
      assert.ok(dimensions.content <= dimensions.width + 1, JSON.stringify(dimensions))
      await page.screenshot({ path: path.join(OUT, 'screenshots/' + size.width + '.png'), fullPage: true })
    }
  })
  await check('Mobile navigation menu opens, navigates and closes', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(pagesOrigin, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Toggle navigation' }).click()
    assert.match(await page.locator('nav.nav-links').getAttribute('class'), /open/)
    await page.locator('nav a[href="/about"]').click()
    await page.waitForURL('**/about')
    assert.doesNotMatch(await page.locator('nav.nav-links').getAttribute('class'), /open/)
  })
  await check('Wrangler never serves private source, env, uploads or test key paths', async () => {
    for (const resource of ['/server/.env', '/server/uploads/applications/synthetic.pdf', '/server/data/runtime-tests/loopback-key.pem']) {
      const value = await request(pagesOrigin, resource)
      assert.doesNotMatch(value.text, /BEGIN.*PRIVATE KEY|DB_PASSWORD=|password_hash/)
      assert.notEqual(value.headers['content-type'], 'application/pdf')
    }
  })
  stopWrangler()

  console.log('Starting compiled Pages worker with network-denied local service bindings...')
  const mockPort = await port()
  const origin = 'https://127.0.0.1:' + mockPort
  allowed.add(origin)
  const secret = randomBytes(32).toString('base64url')
  const mock = createSyntheticBackend({ origin, secret })
  mf = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1', port: 0, https: false, cf: false,
    rootPath: ROOT, modules: true,
    scriptPath: path.join(OUT, 'pages-worker/index.js'),
    compatibilityDate: '2026-10-19',
    log: new Log(LogLevel.ERROR), telemetry: { enabled: false },
    resourcePersistencePath: path.join(OUT, 'miniflare-state'),
    bindings: { API_MODE: 'local-synthetic', API_STAGE: 'local-synthetic',
      API_LOCAL_RUNTIME: 'true', API_ALLOWED_ORIGIN: origin, API_PROXY_SECRET: secret },
    serviceBindings: {
      ASSETS: assets,
      API_LOCAL_BACKEND: (request) => mock.fetch(request),
    },
    outboundService() { outboundAttempts++; return new Response('Outbound network denied.', { status: 503 }) },
  }))
  await mf.ready
  tlsFront = https.createServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }, async (incoming, outgoing) => {
    try {
      const chunks = []
      for await (const chunk of incoming) chunks.push(chunk)
      const body = Buffer.concat(chunks)
      const response = await mf.dispatchFetch(origin + incoming.url, {
        method: incoming.method, headers: Object.fromEntries(Object.entries(incoming.headers).filter(([key]) =>
          !['host', 'connection', 'content-length', 'accept-encoding', 'transfer-encoding'].includes(key))),
        ...(!['GET', 'HEAD'].includes(incoming.method) && body.length ? { body, duplex: 'half' } : {}),
      })
      for (const [key, value] of response.headers) {
        if (!['set-cookie', 'content-length', 'transfer-encoding', 'connection', 'content-encoding'].includes(key)) outgoing.setHeader(key, value)
      }
      const cookies = response.headers.getSetCookie()
      if (cookies.length) outgoing.setHeader('Set-Cookie', cookies)
      outgoing.writeHead(response.status)
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch {
      outgoing.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      outgoing.end('{"error":"Local test bridge failed."}')
    }
  })
  await new Promise((resolve, reject) => tlsFront.once('error', reject).listen(mockPort, '127.0.0.1', resolve))
  runtimes.proxy = { origin, mode: 'Wrangler-compiled Pages worker / local Miniflare workerd',
    backend: 'Node in-memory service binding; no sockets or DB drivers', outboundFetch: 'denied' }
  await check('Local proxy identity, fixed target, trusted headers and query survive real workerd', async () => {
    const response = await request(origin, '/api/synthetic/echo?next=https%3A%2F%2Fnever-connect.invalid', {
      headers: { Origin: origin, Authorization: 'not-a-real-credential',
        Cookie: 'other_cookie=synthetic; CF_Authorization=not-a-token',
        'X-Forwarded-For': '198.51.100.99', 'X-Adele-Client-IP': '198.51.100.99' },
    })
    assert.equal(response.status, 200)
    const data = JSON.parse(response.text)
    assert.equal(data.clientIp, '127.0.0.1')
    assert.equal(data.unrelatedCookieForwarded, false)
    assert.equal(data.authorizationForwarded, false)
    assert.match(response.headers['cache-control'], /no-store/)
    assert.ok(mock.calls.some((call) => call.path === '/api/preview/identity'))
  })
  await check('Local backend refuses direct unauthenticated access', async () => {
    const response = await mock.fetch(new Request('https://synthetic-backend.invalid/api/auth/me'))
    assert.equal(response.status, 403)
  })
  await check('Proxy refuses hostile Origin before the synthetic backend sees it', async () => {
    const before = mock.calls.length
    const response = await request(origin, '/api/auth/login', {
      method: 'POST', headers: { Origin: 'https://attacker.invalid', 'Content-Type': 'application/json' }, body: '{}',
    })
    assert.equal(response.status, 403)
    assert.equal(mock.calls.length, before)
  })
  await check('Proxy refuses redirects and insecure/domain-bearing cookies', async () => {
    for (const route of ['/api/synthetic/redirect', '/api/synthetic/unsafe-cookie']) {
      const response = await request(origin, route, { headers: { Origin: origin } })
      assert.equal(response.status, 502)
      assert.equal(response.headers.location, undefined)
      assert.equal(response.headers['set-cookie'], undefined)
    }
  })
  await check('Separate Set-Cookie headers survive workerd and the browser-facing TLS bridge', async () => {
    const value = await request(origin, '/api/synthetic/split-cookies', { headers: { Origin: origin } })
    assert.equal(value.status, 200)
    assert.equal(value.headers['set-cookie'].length, 2)
    assert.ok(value.headers['set-cookie'].every((cookie) => cookie.includes('HttpOnly') && cookie.includes('Secure')))
  })
  await page.setViewportSize({ width: 1366, height: 900 })
  await context.close()
  context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' })
  await context.route('**/*', async (route) => {
    const target = new URL(route.request().url())
    if (target.origin === 'https://attacker.invalid') return route.fulfill({ contentType: 'text/html', body: '<h1>Local synthetic attacker fixture</h1>' })
    if (target.origin === origin || ['data:', 'blob:', 'about:'].includes(target.protocol)) return route.continue()
    blockedBrowserOrigins.add(target.origin)
    return route.abort('blockedbyclient')
  })
  page = await context.newPage()
  page.on('requestfailed', (request) => console.log('LOCAL BROWSER FAILURE', new URL(request.url()).pathname, request.failure()?.errorText))
  page.on('response', (response) => console.log('LOCAL BROWSER RESPONSE', new URL(response.url()).pathname, response.status()))
  const fixtureResponse = await request(origin, '/__runtime__/login')
  if (fixtureResponse.status !== 200) throw Error('Synthetic browser fixture not available.')
  await page.goto(origin + '/__runtime__/login', { waitUntil: 'domcontentloaded', timeout: 15000 })
  await check('Browser synthetic invalid login is rejected', async () => {
    await page.locator('#email').fill(mock.credentials.email)
    await page.locator('#password').fill('deliberately-invalid-synthetic-input')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Sign-in failed')
    assert.equal((await context.cookies(origin)).some((cookie) => cookie.name === 'adele_session'), false)
  })
  async function login() {
    await page.locator('#password').fill(mock.credentials.password)
    const responsePromise = page.waitForResponse((response) =>
      response.url() === origin + '/api/auth/login' && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    const response = await responsePromise
    assert.equal(response.status(), 200, 'Synthetic login must succeed before inspecting its session')
    await response.finished()
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Signed in')
  }
  let oldCookie
  await check('Browser accepts host-only Secure HttpOnly Strict session and preserves it across reload', async () => {
    await login()
    const cookie = (await context.cookies(origin)).find((value) => value.name === 'adele_session')
    assert.ok(cookie)
    assert.equal(cookie.secure, true)
    assert.equal(cookie.httpOnly, true)
    assert.equal(cookie.sameSite, 'Strict')
    assert.equal(cookie.domain, '127.0.0.1')
    assert.equal(cookie.path, '/')
    assert.equal(await page.evaluate(() => document.cookie.includes('adele_session')), false)
    oldCookie = cookie.value
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Signed in')
  })
  await check('Browser repeat login rotates the session; old synthetic session cannot replay', async () => {
    await page.locator('#email').fill(mock.credentials.email)
    await login()
    const cookie = (await context.cookies(origin)).find((value) => value.name === 'adele_session')
    assert.ok(cookie && cookie.value !== oldCookie, 'Repeated login must replace the synthetic session cookie')
    const response = await request(origin, '/api/auth/me', { headers: { Origin: origin, Cookie: 'adele_session=' + oldCookie } })
    assert.equal(response.status, 401)
  })
  await check('Authenticated browser still cannot perform financial operations or fetch customer documents', async () => {
    const values = await page.evaluate(async () => {
      const output = []
      for (const route of ['/api/loans/disburse', '/api/repayments', '/api/finance/expenses']) {
        const r = await fetch(route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', credentials: 'include' })
        output.push(r.status)
      }
      for (const route of ['/api/customers', '/api/apply/documents/1/file']) output.push((await fetch(route)).status)
      return output
    })
    assert.deepEqual(values, [403, 403, 403, 403, 403])
  })
  await check('Synthetic PDF download contains only generated fixture bytes and is never cached', async () => {
    const value = await page.evaluate(async () => {
      const r = await fetch('/api/synthetic/document')
      return { status: r.status, text: await r.text(), cache: r.headers.get('cache-control') }
    })
    assert.equal(value.status, 200)
    assert.match(value.text, /SYNTHETIC TEST BYTES ONLY/)
    assert.match(value.cache, /no-store/)
  })
  await check('Browser cross-site request cannot reach the synthetic authenticated backend', async () => {
    const attacker = await context.newPage()
    await attacker.goto('https://attacker.invalid')
    const before = mock.calls.length
    const value = await attacker.evaluate(async (target) => {
      try { const r = await fetch(target + '/api/auth/me', { credentials: 'include' }); return { status: r.status, readable: r.ok } }
      catch { return { readable: false } }
    }, origin)
    assert.equal(value.readable, false)
    assert.equal(mock.calls.length, before)
    await attacker.close()
  })
  await check('Browser renders a safe synthetic upstream error', async () => {
    await page.locator('#error').click()
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Synthetic service unavailable')
    assert.doesNotMatch(await page.locator('body').innerText(), /stack|DB_PASSWORD|API_PROXY_SECRET/)
  })
  await check('Browser rejects expired session and clears its cookie', async () => {
    mock.expireAll()
    await page.locator('#check').click()
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Signed out')
    assert.equal((await context.cookies(origin)).some((value) => value.name === 'adele_session'), false)
  })
  await check('Browser logout invalidates the session and deletes the cookie', async () => {
    await page.locator('#email').fill(mock.credentials.email)
    await login()
    await page.locator('#logout').click()
    await page.waitForFunction(() => document.getElementById('status').textContent === 'Signed out')
    assert.equal((await context.cookies(origin)).some((value) => value.name === 'adele_session'), false)
  })
  await check('Public-host local-mode spoof cannot invoke the service binding', async () => {
    const before = mock.calls.length
    const response = await mf.dispatchFetch('https://public-preview.example/api/auth/me')
    assert.equal(response.status, 503)
    assert.equal(mock.calls.length, before)
  })
  await check('Runtime and browser isolation: no outbound fetches or unexpected browser hosts', async () => {
    assert.equal(outboundAttempts, 0)
    assert.deepEqual([...blockedBrowserOrigins], [])
  })
  await context.close()
} catch (error) {
  fatal = String(error.stack || error).slice(0, 2500)
  console.log('RUNTIME HARNESS FAILURE: ' + fatal)
} finally {
  if (browser) await browser.close().catch(() => {})
  if (tlsFront) { tlsFront.closeAllConnections(); await new Promise((resolve) => tlsFront.close(resolve)) }
  if (mf) await mf.dispose().catch(() => {})
  stopWrangler()
  fs.writeFileSync(path.join(OUT, 'wrangler-pages-output.log'), wranglerOutput)
  const summary = {
    checkedAt: new Date().toISOString(), runtimes, commands, results, fatal,
    passed: results.filter((value) => value.status === 'PASS').length,
    failed: results.filter((value) => value.status === 'FAIL').length,
    outboundFetchAttempts: outboundAttempts, blockedBrowserOrigins: [...blockedBrowserOrigins],
    productionResourcesAccessed: false, databaseDriversImportedByHarness: false,
    notes: ['Mock credentials/sessions are runtime-generated, in-memory, and not included in artifacts.',
      'TLS verification remains enabled. Node explicitly trusts the local certificate; browser trust requires a separately reviewed setup.',
      'The second runtime uses the real compiled Pages router with test-only ASSETS/backend service bindings.'],
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(summary, null, 2))
  console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed, fatal: !!fatal, outboundFetchAttempts: outboundAttempts }))
  if (summary.failed || fatal) process.exitCode = 1
}
