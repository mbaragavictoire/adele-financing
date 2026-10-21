/**
 * End-to-end check of the session implementation.
 *
 * Creates a throwaway super_admin, exercises login, cookie handling, session
 * validation, role enforcement, revocation, the cross-site guard and logout, then
 * removes the account and its sessions again.
 *
 * Run with the API already listening:  node scripts/verify-sessions.mjs
 */
import bcrypt from 'bcryptjs'
// Loads server/.env before db.js reads any configuration.
import '../server/env.js'
import { initDb, run, queryOne, queryAll } from '../server/db.js'

const BASE = process.env.VERIFY_BASE || 'http://localhost:4000'
const EMAIL = `session-test-${Date.now()}@adele.invalid`
const PASSWORD = 'temporary-test-password-9f2c'

let passed = 0
let failed = 0

function check(name, condition, detail = '') {
  if (condition) {
    passed++
    console.log(`  PASS  ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`)
  }
}

/** Minimal cookie jar: one request, returns status, body and Set-Cookie list. */
async function call(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data, setCookie: res.headers.getSetCookie() || [] }
}

function cookieValue(setCookieList, name) {
  for (const raw of setCookieList) {
    const [pair] = raw.split(';')
    const eq = pair.indexOf('=')
    if (eq !== -1 && pair.slice(0, eq).trim() === name) {
      return { value: pair.slice(eq + 1).trim(), raw }
    }
  }
  return null
}

/** Resolves a cookie value to its session row, the same way the server does. */
async function rowForCookie(rawValue) {
  const digest = (await import('node:crypto'))
    .createHash('sha256')
    .update(rawValue)
    .digest('hex')
  return queryOne('SELECT * FROM sessions WHERE id = ?', [digest])
}

async function main() {
  // Opens the pool. Seeding is idempotent, so this cannot create anything new.
  await initDb()

  console.log('\nSetup: creating a throwaway super_admin')
  await run(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
    [
      'Session Verification Account',
      EMAIL,
      '+250788000111',
      bcrypt.hashSync(PASSWORD, 12),
    ],
  )
  const user = await queryOne('SELECT id FROM users WHERE email = ?', [EMAIL])
  console.log(`  created ${EMAIL} as user #${user.id}`)

  try {
    console.log('\n1. Rejected sign-in')
    const bad = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'not-the-password' },
    })
    check('wrong password is refused', bad.status === 401, `got ${bad.status}`)
    check(
      'error does not reveal which part was wrong',
      bad.data?.error === 'Invalid email or password.',
      bad.data?.error,
    )
    check('no session cookie on failure', cookieValue(bad.setCookie, 'adele_session') === null)

    console.log('\n2. Successful sign-in')
    const login = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    check('login succeeds', login.status === 200, `got ${login.status}`)
    check('no token in the response body', login.data?.token === undefined)
    check(
      'response carries the user role from the database',
      login.data?.user?.role === 'super_admin',
      login.data?.user?.role,
    )

    const session = cookieValue(login.setCookie, 'adele_session')
    check('session cookie is set', !!session)
    if (!session) throw new Error('no session cookie; cannot continue')
    check('cookie is HttpOnly', /HttpOnly/i.test(session.raw), session.raw)
    check('cookie is SameSite=Strict', /SameSite=Strict/i.test(session.raw), session.raw)
    check('cookie is on Path=/', /Path=\//i.test(session.raw), session.raw)
    check('cookie has a Max-Age', /Max-Age=\d+/i.test(session.raw), session.raw)
    // SESSION_COOKIE_SECURE is set in server/.env because the LMS is reached
    // over HTTPS. A browser will silently refuse to store the cookie if this
    // regresses, which is exactly the failure this assertion is here to catch.
    check(
      'cookie is Secure',
      /;\s*Secure/i.test(session.raw),
      session.raw,
    )
    check(
      'cookie value carries no user id or role',
      !session.value.includes(String(user.id)) && !/super_admin/.test(session.value),
    )

    const jar = `adele_session=${session.value}`

    console.log('\n3. Session validation')
    const me = await call('/auth/me', { cookie: jar })
    check('session works on a protected route', me.status === 200, `got ${me.status}`)
    check('server reports the session limits', me.data?.session?.policy?.idleMinutes > 0)

    const noCookie = await call('/auth/me')
    check('no cookie is refused', noCookie.status === 401, `got ${noCookie.status}`)

    const forged = await call('/auth/me', {
      cookie: 'adele_session=' + 'a'.repeat(43),
    })
    check('a forged identifier is refused', forged.status === 401, `got ${forged.status}`)

    const bearer = await call('/auth/me', {
      headers: { Authorization: 'Bearer something' },
    })
    check(
      'the old bearer path no longer authenticates',
      bearer.status === 401,
      `got ${bearer.status}`,
    )

    console.log('\n4. The database holds only a hash of the identifier')
    const row = await queryOne('SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC', [
      user.id,
    ])
    check('a session row exists', !!row)
    check(
      'the stored id is a 64-character hex hash, not the cookie value',
      /^[a-f0-9]{64}$/.test(row?.id || ''),
      row?.id,
    )
    const crypto = await import('node:crypto')
    const expected = crypto.createHash('sha256').update(session.value).digest('hex')
    check(
      'the stored id is exactly SHA-256 of the cookie value',
      row?.id === expected,
      `${row?.id} vs ${expected}`,
    )

    console.log('\n5. Role enforcement')
    const sessions = await call('/sessions', { cookie: jar })
    check('super_admin may list sessions', sessions.status === 200, `got ${sessions.status}`)
    check(
      'the live session appears in the list',
      (sessions.data?.active || []).some((s) => s.id === row.id),
    )
    check(
      'the list does not leak the cookie value',
      JSON.stringify(sessions.data).indexOf(session.value) === -1,
    )

    console.log('\n6. A non-super_admin is refused')
    const otherEmail = `session-test-other-${Date.now()}@adele.invalid`
    await run(
      `INSERT INTO users (full_name, email, phone, password_hash, role, status)
       VALUES (?, ?, ?, ?, 'loan_officer', 'active')`,
      ['Session Verification Officer', otherEmail, '+250788000222', bcrypt.hashSync(PASSWORD, 12)],
    )
    const officer = await queryOne('SELECT id FROM users WHERE email = ?', [otherEmail])
    const officerLogin = await call('/auth/login', {
      method: 'POST',
      body: { email: otherEmail, password: PASSWORD },
    })
    const officerSession = cookieValue(officerLogin.setCookie, 'adele_session')
    const officerJar = `adele_session=${officerSession?.value}`

    const officerList = await call('/sessions', { cookie: officerJar })
    check(
      'loan_officer is refused the sessions list',
      officerList.status === 403,
      `got ${officerList.status}`,
    )

    console.log('\n7. Cross-site request guard')
    const forgedOrigin = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
      headers: { Origin: 'https://evil.example.com' },
    })
    check(
      'a cross-site POST is refused',
      forgedOrigin.status === 403,
      `got ${forgedOrigin.status}`,
    )

    const sameOrigin = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
      headers: { Origin: BASE },
    })
    check(
      'a same-origin POST is accepted',
      sameOrigin.status === 200,
      `got ${sameOrigin.status}`,
    )
    const second = cookieValue(sameOrigin.setCookie, 'adele_session')
    check(
      'each sign-in mints a different identifier',
      second && second.value !== session.value,
    )
    if (second) {
      await call('/auth/logout', { method: 'POST', cookie: `adele_session=${second.value}` })
    }

    console.log('\n8. Revocation ends the session immediately')
    const revoke = await call(`/sessions/${row.id}/revoke`, {
      method: 'POST',
      cookie: jar,
    })
    check('a super_admin can revoke a session', revoke.status === 200, `got ${revoke.status}`)

    const afterRevoke = await call('/auth/me', { cookie: jar })
    check(
      'the revoked session is dead even though the cookie still exists',
      afterRevoke.status === 401,
      `got ${afterRevoke.status}`,
    )
    check(
      'the refusal says it was signed out',
      /signed out/i.test(afterRevoke.data?.error || ''),
      afterRevoke.data?.error,
    )

    const doubleRevoke = await call(`/sessions/${row.id}/revoke`, {
      method: 'POST',
      cookie: jar,
    })
    check(
      'revoking an already-closed session does not succeed again',
      doubleRevoke.status !== 200,
      `got ${doubleRevoke.status}`,
    )

    const badId = await call('/sessions/not-a-real-session/revoke', {
      method: 'POST',
      cookie: `adele_session=${session.value}`,
    })
    check(
      'a malformed session id is refused',
      [400, 401].includes(badId.status),
      `got ${badId.status}`,
    )

    console.log('\n9. Logout destroys the session')
    const fresh = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    const freshCookie = cookieValue(fresh.setCookie, 'adele_session')
    const freshJar = `adele_session=${freshCookie.value}`

    const logout = await call('/auth/logout', { method: 'POST', cookie: freshJar })
    check('logout succeeds', logout.status === 200, `got ${logout.status}`)
    const cleared = cookieValue(logout.setCookie, 'adele_session')
    check(
      'logout clears the cookie',
      cleared !== null && /^adele_session=$|^adele_session=;/.test(cleared?.raw || 'x'),
      cleared?.raw,
    )

    const afterLogout = await call('/auth/me', { cookie: freshJar })
    check(
      'the old cookie cannot be reused after logout',
      afterLogout.status === 401,
      `got ${afterLogout.status}`,
    )

    console.log('\n10. Changing a password ends every session')
    const before = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    const pwCookie = cookieValue(before.setCookie, 'adele_session')
    const pwJar = `adele_session=${pwCookie.value}`

    const otherDevice = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: PASSWORD },
    })
    const otherDeviceJar = `adele_session=${cookieValue(otherDevice.setCookie, 'adele_session').value}`

    const changed = await call('/auth/change-password', {
      method: 'POST',
      cookie: pwJar,
      body: { current_password: PASSWORD, new_password: 'another-temporary-password-4b7d' },
    })
    check('password change succeeds', changed.status === 200, `got ${changed.status}`)
    check('it reports how many sessions it closed', changed.data?.sessionsClosed >= 2, changed.data?.sessionsClosed)

    const thisDevice = await call('/auth/me', { cookie: pwJar })
    check('the changing device is signed out too', thisDevice.status === 401, `got ${thisDevice.status}`)

    const otherStillOpen = await call('/auth/me', { cookie: otherDeviceJar })
    check(
      'the other device is signed out as well',
      otherStillOpen.status === 401,
      `got ${otherStillOpen.status}`,
    )

    console.log('\n11. Audit trail')
    // Filtered on the acting user id, which every one of these events records,
    // rather than on the description text.
    const actions = (
      await queryAll(
        `SELECT DISTINCT action FROM audit_logs WHERE user_id = ? ORDER BY action`,
        [user.id],
      )
    ).map((r) => r.action)
    for (const expected of ['LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_CHANGED']) {
      check(`audit log records ${expected}`, actions.includes(expected), actions.join(', '))
    }
    const revokedEvents = await queryOne(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'SESSION_REVOKED' AND user_id = ?`,
      [user.id],
    )
    check(
      'audit log records revocation',
      Number(revokedEvents.c) > 0,
      `count ${revokedEvents.c}`,
    )

    console.log('\n12. The idle timeout closes a session')
    const idleLogin = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'another-temporary-password-4b7d' },
    })
    const idleRow = await queryOne(
      'SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
      [user.id],
    )
    // Rewind the idle deadline rather than waiting for it.
    await run(
      `UPDATE sessions SET idle_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE id = ?`,
      [idleRow.id],
    )
    const idleTest = await call('/auth/me', {
      cookie: `adele_session=${cookieValue(idleLogin.setCookie, 'adele_session').value}`,
    })
    check(
      'an idle session is refused',
      idleTest.status === 401,
      `got ${idleTest.status}`,
    )
    check(
      'the user is told it was an inactivity timeout',
      /inactivity/i.test(idleTest.data?.error || ''),
      idleTest.data?.error,
    )
    const idleAfter = await queryOne('SELECT revoked_at, revoke_reason FROM sessions WHERE id = ?', [
      idleRow.id,
    ])
    check('the expired session is marked closed', !!idleAfter.revoked_at)
    const expiryAudit = await queryOne(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'SESSION_EXPIRED' AND user_id = ?`,
      [user.id],
    )
    check(
      'the expiry is audited once',
      Number(expiryAudit.c) === 1,
      `count ${expiryAudit.c}`,
    )
    // A second attempt must not add a second audit entry.
    await call('/auth/me', {
      cookie: `adele_session=${cookieValue(idleLogin.setCookie, 'adele_session').value}`,
    })
    const expiryAuditAgain = await queryOne(
      `SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'SESSION_EXPIRED' AND user_id = ?`,
      [user.id],
    )
    check(
      'a repeat request does not duplicate the audit entry',
      Number(expiryAuditAgain.c) === 1,
      `count ${expiryAuditAgain.c}`,
    )

    console.log('\n13. The absolute lifetime cannot be extended by activity')
    const absLogin = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'another-temporary-password-4b7d' },
    })
    const absCookie = `adele_session=${cookieValue(absLogin.setCookie, 'adele_session').value}`
    const absRow = await queryOne(
      'SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC',
      [user.id],
    )
    // Idle is wide open, but the absolute ceiling has passed.
    await run(
      `UPDATE sessions SET idle_expires_at = DATE_ADD(NOW(), INTERVAL 1 DAY),
                           absolute_expires_at = DATE_SUB(NOW(), INTERVAL 1 MINUTE)
       WHERE id = ?`,
      [absRow.id],
    )
    const absTest = await call('/auth/me', { cookie: absCookie })
    check(
      'an absolute-expired session is refused even though it was just used',
      absTest.status === 401,
      `got ${absTest.status}`,
    )
    check(
      'the user is told it reached its maximum length',
      /maximum length/i.test(absTest.data?.error || ''),
      absTest.data?.error,
    )

    console.log('\n14. Activity slides the idle deadline but not the absolute one')
    const slide = await call('/auth/login', {
      method: 'POST',
      body: { email: EMAIL, password: 'another-temporary-password-4b7d' },
    })
    const slideRaw = cookieValue(slide.setCookie, 'adele_session').value
    const slideCookie = `adele_session=${slideRaw}`
    const slideRow = await rowForCookie(slideRaw)
    check('the slide session was located by its cookie', !!slideRow, slideRaw)
    // Push idle far into the future and put the absolute ceiling close, then use
    // the session: the touch must not be able to push idle past absolute.
    await run(
      `UPDATE sessions SET idle_expires_at = DATE_ADD(NOW(), INTERVAL 5 DAY),
                           absolute_expires_at = DATE_ADD(NOW(), INTERVAL 2 MINUTE),
                           last_seen_at = DATE_SUB(NOW(), INTERVAL 10 MINUTE)
       WHERE id = ?`,
      [slideRow.id],
    )
    const slideBefore = await queryOne(
      'SELECT idle_expires_at, absolute_expires_at FROM sessions WHERE id = ?',
      [slideRow.id],
    )
    await call('/auth/me', { cookie: slideCookie })
    // Allow the fire-and-forget heartbeat to land.
    await new Promise((r) => setTimeout(r, 1500))
    const slideAfter = await queryOne(
      'SELECT idle_expires_at, absolute_expires_at FROM sessions WHERE id = ?',
      [slideRow.id],
    )
    check(
      'the absolute deadline is untouched by activity',
      String(slideBefore.absolute_expires_at) === String(slideAfter.absolute_expires_at),
      `${slideBefore.absolute_expires_at} -> ${slideAfter.absolute_expires_at}`,
    )
    check(
      'the idle deadline is pulled back under the absolute ceiling',
      new Date(String(slideAfter.idle_expires_at).replace(' ', 'T')).getTime() <=
        new Date(String(slideAfter.absolute_expires_at).replace(' ', 'T')).getTime(),
      `idle ${slideAfter.idle_expires_at} vs absolute ${slideAfter.absolute_expires_at}`,
    )

    console.log('\n15. Suspending an account ends its sessions')
    await run(`UPDATE users SET status = 'suspended' WHERE id = ?`, [officer.id])
    const suspended = await call('/auth/me', { cookie: officerJar })
    check(
      'a suspended user is refused',
      suspended.status === 403,
      `got ${suspended.status}`,
    )

    await run('DELETE FROM users WHERE id IN (?, ?)', [user.id, officer.id])
    await run('DELETE FROM sessions WHERE user_id IN (?, ?)', [user.id, officer.id])
  } finally {
    // Make sure the throwaway accounts cannot survive a failed run.
    const leftovers = await queryAll('SELECT id FROM users WHERE email LIKE ?', [
      'session-test-%',
    ])
    for (const l of leftovers) {
      await run('DELETE FROM sessions WHERE user_id = ?', [l.id])
      await run('DELETE FROM users WHERE id = ?', [l.id])
    }
    console.log(`\nCleanup: removed ${leftovers.length + 2} throwaway account(s)`)
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

void (async () => {
  await main()
  process.exit(0)
})()