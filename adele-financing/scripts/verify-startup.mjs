/**
 * Cold-start race: before and after.
 *
 * The failure the user saw was a Vite proxy ECONNREFUSED during boot, caused by
 * app.listen() running only after initDb() had finished building the schema.
 * Reproducing that honestly needs initDb to actually be slow, so each trial
 * creates a fresh database — which is exactly the cold start that produced the
 * original error.
 *
 *   node scripts/verify-startup.mjs
 *
 * Trial A runs the committed version (listen last). Trial B runs the current one
 * (listen first, gate the rest). Both are probed every 60ms from spawn.
 */
import { spawn, execFileSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import mysql from 'mysql2/promise'
// Loads server/.env so the trial connects to the same MySQL as the app.
import '../server/env.js'

const TIMEOUT_MS = 120000

const BASELINE = 'server/_baseline-index.js'

/** Fetches /api/health, reporting refusal separately from a real status. */
async function probe(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(3000),
    })
    const body = await res.text()
    return { ok: true, status: res.status, body: body.slice(0, 60) }
  } catch (err) {
    return { ok: false, code: String(err.cause?.code || err.name || err.message) }
  }
}

async function trial({ label, entry, port, dbName }) {
  const startedAt = Date.now()
  const server = spawn(process.execPath, [entry], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), DB_NAME: dbName },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const output = []
  let listenAt = null // when the socket was opened
  let readyAt = null // when initDb finished
  let sawStarting = false
  let refusedBeforeListen = 0
  let refusedAfterListen = 0 // must be zero: once it says listening, it listens
  let refusedTotal = 0
  let lastStatus = null
  let readyProbes = 0
  let listTick = 0

  // The old build announced itself as "running at", the new one as "listening
  // on" then "ready at". Matching both lets one harness compare them honestly.
  const note = (b) => {
    output.push(b.toString())
    const text = b.toString()
    if (listenAt === null && /listening on|running at/.test(text)) {
      listenAt = Date.now() - startedAt
    }
  }
  server.stdout.on('data', note)
  server.stderr.on('data', note)

  while (Date.now() - startedAt < TIMEOUT_MS) {
    const r = await probe(port)
    const elapsed = Date.now() - startedAt

    if (r.ok) {
      lastStatus = r.status
      if (r.status === 503 && r.body.includes('starting')) sawStarting = true
      if (r.status === 200 && readyAt === null) {
        readyAt = elapsed
      }
      if (readyAt !== null && ++readyProbes >= 5) break
    } else {
      refusedTotal++
      if (listenAt !== null) refusedAfterListen++
      else refusedBeforeListen++
    }

    // Poll fast, then back off — but keep sampling so listenAt is noticed
    // promptly rather than a whole interval late.
    if (listTick++ < 40) await sleep(40)
    else await sleep(150)
  }

  const listeningLine = output.join('').match(/(listening on|running at) .*/)?.[0] || null
  const readyLine = output.join('').match(/ready at .*/)?.[0] || null

  server.kill()
  await sleep(400)
  if (server.exitCode === null) server.kill('SIGKILL')
  await sleep(200)

  return {
    label,
    listenAt,
    readyAt,
    sawStarting,
    refusedBeforeListen,
    refusedAfterListen,
    refusedTotal,
    lastStatus,
    listeningLine,
    readyLine,
  }
}

/** Opens a throwaway admin connection, used only to create/drop the trial DBs. */
async function withAdmin(fn) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  })
  try {
    await fn(conn)
  } finally {
    await conn.end()
  }
}

const dropDatabase = (name) => withAdmin((c) => c.query(`DROP DATABASE IF EXISTS \`${name}\``))

async function main() {
  // Trial A compares against whatever is committed. While the fix is still
  // uncommitted that is genuinely the broken build, which is the demonstration
  // worth having. Once it lands, HEAD *is* the fixed build — running it as a
  // "baseline" would make the test fail on a correct commit, so it is skipped
  // and only the regression assertions below are applied.
  // Compare on equal footing: git stores LF, the working tree may hold CRLF,
  // and core.autocrlf would otherwise make these differ forever.
  const currentSql = readFileSync('server/index.js', 'utf8').replace(/\r\n/g, '\n')
  const headSql = execFileSync('git', ['show', 'HEAD:adele-financing/server/index.js'], {
    encoding: 'utf8',
  }).replace(/\r\n/g, '\n')
  const showBaseline = headSql !== currentSql

  if (showBaseline) writeFileSync(BASELINE, headSql)

  const dbA = 'adele_lms_boot_before'
  const dbB = 'adele_lms_boot_after'
  await dropDatabase(dbA)
  await dropDatabase(dbB)

  const results = []
  try {
    if (showBaseline) {
      console.log('\n  Trial A — committed version (initDb then listen)')
      results.push(
        await trial({ label: 'before', entry: BASELINE, port: 4101, dbName: dbA }),
      )
    } else {
      console.log('\n  Trial A — skipped: the fix is already committed, so HEAD is')
      console.log('             the build under test. Nothing to compare against.')
    }

    console.log(showBaseline ? '  Trial B — current version (listen then initDb, gated)' : '  Trial — current version (listen then initDb, gated)')
    results.push(
      await trial({ label: 'after', entry: 'server/index.js', port: 4102, dbName: dbB }),
    )
  } finally {
    await dropDatabase(dbA)
    await dropDatabase(dbB)
    if (existsSync(BASELINE)) rmSync(BASELINE, { force: true })
  }

  console.log('\n  ' + '-'.repeat(78))
  console.log(
    '  trial   listen(ms)  ready(ms)  refused-before  refused-after  503-starting',
  )
  console.log('  ' + '-'.repeat(78))
  for (const r of results) {
    console.log(
      `  ${r.label.padEnd(7)} ${String(r.listenAt ?? 'never').padEnd(11)} ` +
        `${String(r.readyAt ?? 'never').padEnd(10)} ` +
        `${String(r.refusedBeforeListen).padEnd(15)} ` +
        `${String(r.refusedAfterListen).padEnd(14)} ${r.sawStarting}`,
    )
  }
  console.log('  ' + '-'.repeat(78))

  for (const r of results) {
    console.log(`\n  ${r.label}:`)
    console.log(`    ${r.listeningLine || '(never announced listening)'}`)
    console.log(`    ${r.readyLine || '(never announced ready)'}`)
  }

  const before = results.find((r) => r.label === 'before')
  const after = results.find((r) => r.label === 'after')

  const failures = []

  // The current build. Listening must precede readiness: that ordering is the
  // entire fix, and the gate is only meaningful if it actually held the socket
  // open for some of initDb(). These are the only assertions — the committed
  // comparison is reported, never gated on, because it stops being a fair
  // contrast the moment the fix itself is committed.
  if (after.listenAt === null || after.readyAt === null || after.listenAt >= after.readyAt) {
    failures.push(
      `expected listen (${after.listenAt} ms) to precede ready (${after.readyAt} ms)`,
    )
  }
  if (after.refusedAfterListen > 0) {
    failures.push(`${after.refusedAfterListen} probe(s) refused after the socket was open`)
  }
  if (!after.sawStarting) {
    failures.push('never observed a 503 starting response, so the gate was not exercised')
  }

  if (failures.length) {
    console.log('\n  RESULT: FAIL')
    for (const f of failures) console.log(`    - ${f}`)
    console.log('')
    process.exit(1)
  }

  console.log('\n  RESULT: PASS')
  if (before) {
    console.log(
      `    before: refused ${before.refusedTotal} probe(s) while building the schema ` +
        `(the ECONNREFUSED you saw)`,
    )
  }
  console.log(
    `    after:  refused ${after.refusedTotal} before the entry module had loaded ` +
      `(${after.refusedBeforeListen} — unavoidable process start), 0 afterwards`,
  )
  console.log(
    `    after:  listened at ${after.listenAt} ms, ready at ${after.readyAt} ms — ` +
      `the gate held for ~${after.readyAt - after.listenAt} ms`,
  )
  console.log('')
}

await main()
