/**
 * Verifies the CSRF backstop in server/index.js without touching the dev
 * server's own process: boots a throwaway instance with CORS_ORIGINS set and
 * drives requests at it.
 *
 * Requests are written to a raw socket rather than fetched, because the point
 * of several of these cases is a Host header that differs from the origin the
 * request was addressed at — which is what a proxy doing changeOrigin:true
 * produces, and which undici refuses to let a caller override.
 *
 * This matters because vite.config.js once used the string shorthand for its
 * proxy, which sets changeOrigin: true. The API then saw Host: localhost:4000
 * against Origin: http://localhost:5173 and refused every login as cross-site.
 *
 *   npm run verify:csrf
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.GUARD_TEST_PORT || 4040)
const BODY = JSON.stringify({ email: 'nobody@nowhere.invalid', password: 'wrong-password-123' })

/** Sends one HTTP/1.1 request with an exactly-specified Host and Origin. */
function send({ method = 'POST', path = '/api/auth/login', origin, host }) {
  return new Promise((resolve) => {
    const socket = net.connect(PORT, '127.0.0.1')
    let data = ''
    socket.setTimeout(8000, () => {
      socket.destroy()
      resolve({ status: 'TIMEOUT', body: '' })
    })
    socket.on('connect', () => {
      const lines = [`${method} ${path} HTTP/1.1`, `Host: ${host}`]
      if (origin) lines.push(`Origin: ${origin}`)
      lines.push(
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(BODY)}`,
        'Connection: close',
        '',
        BODY,
      )
      socket.write(lines.join('\r\n'))
    })
    socket.on('data', (chunk) => (data += chunk.toString()))
    socket.on('end', () => {
      const m = data.match(/^HTTP\/1\.[01] (\d{3})/)
      const body = data.includes('\r\n\r\n') ? data.split('\r\n\r\n').slice(1).join('\r\n\r\n') : ''
      resolve({ status: m ? Number(m[1]) : 'NO_STATUS', body: body.slice(0, 120) })
    })
    socket.on('error', (err) => resolve({ status: 'ERR', body: err.code || err.message }))
  })
}

const server = spawn(process.execPath, ['server/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(PORT),
    CORS_ORIGINS: 'https://public.example,http://other.example',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const log = []
server.stdout.on('data', (b) => log.push(b.toString()))
server.stderr.on('data', (b) => log.push(b.toString()))

// 401 = reached the login handler with bad credentials. 429 = reached it but
// tripped the rate limiter first. Both mean the guard let the request through,
// which is all these cases are asserting; 403 means the guard refused it.
const THROUGH = [401, 429]
const REFUSED = [403]

const CASES = [
  // Same site: Origin matches Host, so the request must reach authentication.
  ['same-site passes', { origin: `http://localhost:${PORT}`, host: `localhost:${PORT}` }, THROUGH],

  // A page on another origin must be refused before authentication runs.
  ['cross-site refused', { origin: 'https://evil.example', host: `localhost:${PORT}` }, REFUSED],

  // Host rewritten to the backend address while Origin still names the page —
  // the shape changeOrigin:true used to produce. Not same-site, so refused.
  ['backend Host refused', { origin: `http://localhost:${PORT}`, host: 'localhost:4999' }, REFUSED],

  // Same rewrite, but the page is an origin the operator configured, so it is
  // one this application is deliberately served from.
  ['configured origin passes', { origin: 'https://public.example', host: 'localhost:4999' }, THROUGH],

  // Hostnames are case-insensitive; casing must not defeat the match.
  ['Host casing ignored', { origin: `http://localhost:${PORT}`, host: `LOCALHOST:${PORT}` }, THROUGH],

  // No Origin at all: a non-browser client, not forgeable by a web page.
  ['absent Origin passes', { origin: null, host: `localhost:${PORT}` }, THROUGH],

  // Unparseable Origin cannot be resolved to a host, so it cannot be trusted.
  ['junk Origin refused', { origin: 'not-a-url', host: `localhost:${PORT}` }, REFUSED],
]

const results = []
try {
  let ready = false
  for (let i = 0; i < 250 && !ready; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`)
      ready = res.status === 200
    } catch {
      /* still booting */
    }
    if (!ready) await sleep(150)
  }
  if (!ready) {
    console.log('  server never became ready:')
    console.log(log.join('').slice(-800))
    process.exit(1)
  }

  for (const [name, req, want] of CASES) {
    results.push([name, await send(req), want])
  }
} finally {
  server.kill()
  await sleep(300)
  if (server.exitCode === null) server.kill('SIGKILL')
}

console.log('\n  check                      got   want')
console.log('  -------------------------  ----  --------')
let failed = 0
for (const [name, got, want] of results) {
  const ok = want.includes(got.status)
  if (!ok) failed++
  const label = Array.isArray(want) ? want.join('/') : want
  console.log(`  ${name.padEnd(25)} ${String(got.status).padEnd(4)}  ${label.padEnd(8)}${ok ? '' : ' <-- FAIL'}`)
  if (!ok && got.body) console.log(`    body: ${got.body}`)
}
console.log('')
if (failed) {
  console.log(`  RESULT: FAIL (${failed})\n`)
  process.exit(1)
}
console.log('  RESULT: PASS\n')
