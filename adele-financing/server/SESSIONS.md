# Session management

How sign-in works in the ADELE Loan Management System, and why it is built this
way. This replaces the previous stateless JWT scheme, in which a signed token
held the user's role and was kept in `localStorage`.

## The flow

```
Staff Login
    ↓
POST /api/auth/login          (email + password, bcrypt compare)
    ↓
Backend authenticates against the database
    ↓
Server creates a session row and a fresh random identifier
    ↓
Identifier is sent once, as an HttpOnly cookie
    ↓
Every later request carries the cookie; the browser attaches it on its own
    ↓
requireAuth validates: session exists → not revoked → not expired →
                       account active → role re-read from the database
    ↓
requireRole enforces the role on that specific endpoint
    ↓
Action runs and is written to the audit log
    ↓
Logout, timeout, revocation or password change destroys the session row
    ↓
Staff must authenticate again
```

## Why sessions instead of tokens

A JWT is signed, but it is also **readable and replayable by whoever holds it**.
Keeping one in `localStorage` meant any script running on the page could read it
and reuse it until it expired, and the role it carried stayed authoritative for
the token's whole life.

A server-side session removes both problems:

- The browser holds an opaque random string in a cookie that JavaScript cannot
  read, so an injected script has nothing to steal.
- Nothing is trusted from the client. The role, the status and the permissions
  are read from the database on **every** request, so suspending an account or
  demoting a user takes effect on their next request rather than when their
  token happens to expire.

## Key design decisions

**The database stores a hash, not the identifier.**
`sessions.id` is `SHA-256(cookie value)`. The raw value is generated with
`crypto.randomBytes(32)`, handed to the browser once, and never persisted. A
database leak therefore yields nothing that can be replayed as a cookie. It is
also why the ids shown on the Sessions admin page are safe to display and to
pass around: possessing a hash does not authenticate anybody.

**Session fixation is prevented structurally.**
Login always mints a brand new identifier and no identifier is ever accepted
before it exists in the table. An attacker who plants a value in a victim's
browser gains nothing, because a successful sign-in replaces it.

**Two limits, not one.**

| Limit | Behaviour |
|---|---|
| `idle_expires_at` | Slides forward with activity. |
| `absolute_expires_at` | Never moves. |

Activity cannot extend a session past its absolute lifetime, so a scripted
client cannot hold a session open indefinitely. The heartbeat is throttled to at
most one write per minute, and the idle deadline is capped by the absolute one
in the same statement, so the two cannot drift apart.

**Cookie attributes.**
`HttpOnly` (unreadable by script), `Secure` in production, `SameSite=Strict`,
`Path=/`, and a `Max-Age` equal to the absolute lifetime. `Secure` and `SameSite`
can be overridden with `SESSION_COOKIE_SECURE` and `SESSION_COOKIE_SAMESITE`
for local development — see the caveats below.

**Cross-site requests are refused.**
Because the browser attaches the cookie automatically, state-changing requests
can be forged cross-site. `SameSite=Strict` is the primary defence; on top of
that, `server/index.js` rejects any `POST`/`PUT`/`PATCH`/`DELETE` under `/api`
whose `Origin` does not match the request's own `Host`. Comparing against `Host`
rather than a configured allowlist means it keeps working behind a tunnel or any
hostname without that hostname being hard-coded.

**The backend is the only authority.**
Authentication, session validity, role checks and permission checks all happen
server-side. The frontend asks `GET /api/auth/me` on load and believes the
answer. Editing `localStorage`, React state or the JavaScript bundle cannot
produce an authenticated session, because there is no token to insert and
`requireAuth` would reject the request regardless.

**Nothing sensitive is stored on the client.** No token in `localStorage` or
`sessionStorage`, no user id in a URL, and no session details in a public API
response. A leftover JWT from the previous scheme is deleted on boot.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `SESSION_IDLE_MINUTES` | `30` | Sign out after this long without activity. |
| `SESSION_ABSOLUTE_HOURS` | `8` | Sign out after this long regardless of activity. |
| `SESSION_MAX_PER_USER` | `3` | Simultaneous sessions per staff account. |
| `SESSION_COOKIE_SECURE` | `true` when `NODE_ENV=production` | Set `false` only for local HTTP. |
| `SESSION_COOKIE_SAMESITE` | `strict` | See the caveat below. |

There is **no `JWT_SECRET`** any more. There is no signing key to keep, rotate
or leak.

### The simultaneous-session limit

Signing in beyond `SESSION_MAX_PER_USER` closes the oldest sessions rather than
refusing the login. The limit therefore stays a real limit, and a member of
staff is never locked out of their own account by their own earlier sign-ins.
Each closure is audited as `LOGIN` with the number closed.

### Local development

Over plain `http://localhost` the browser will not store a `Secure` cookie, so
login appears to succeed and then everything 401s. Either run behind HTTPS or
set `SESSION_COOKIE_SECURE=false` in `server/.env` for local work only. Never
set it to `false` in production.

### If the frontend is ever hosted on a different site

`SameSite=Strict` will not work: the browser refuses to attach the cookie to a
cross-site API call. Loosening it to `none` is **not** the fix on its own —
`SameSite=None` is what makes CSRF possible in the first place. A split
deployment needs a real CSRF defence (a double-submit token or an equivalent)
before `none` is acceptable. The same-origin check in `server/index.js` must
also become an explicit origin allowlist at that point, because `Host` will no
longer match the frontend's origin.

## Concurrent sessions and revocation

A Super Admin can see every live session on the **Sessions** page
(`/admin/sessions`) and close them:

- `POST /api/sessions/:id/revoke` — close one session.
- `POST /api/sessions/revoke-all` — close every session on one account, keeping
  the caller's own session when `keep_own_session` is true.

Every route on `/api/sessions` is behind `requireAuth` +
`requireRole('super_admin')`. The other three roles are refused by the server
regardless of what the frontend shows them.

## Sessions are also ended by

- **Logout** — the row is closed and the cookie cleared.
- **Change password** — *every* session on the account is closed, including the
  caller's. Someone who reacted to a suspected compromise by changing their
  password must not still be signed in elsewhere.
- **Admin password reset** — every session on that account is closed.
- **Role or status change** — every session on that account is closed, so a
  suspension or demotion is immediate.
- **Idle or absolute timeout** — closed on the first request that notices, and
  closed once more by the hourly housekeeping job so the admin list stays honest
  about sessions nobody has retried.

## Audit trail

Every event below is written to `audit_logs`:

| Action | When |
|---|---|
| `LOGIN` | Successful sign-in. |
| `LOGIN_FAILED` | Rejected sign-in, without revealing which part was wrong. |
| `LOGOUT` | The user signed out. |
| `SESSION_EXPIRED` | A session hit the idle or absolute limit. |
| `SESSION_REVOKED` | A Super Admin closed a session, or closed a whole account. |
| `PASSWORD_CHANGED` | The user changed their own password. |
| `PASSWORD_RESET` | A Super Admin reset someone's password. |
| `PASSWORD_CHANGE_FAILED` | Rejected because the current password was wrong. |

## Housekeeping

`pruneSessions()` runs hourly and on boot. It closes sessions that are past
either limit, then deletes rows that have been closed for more than seven days.
Closed rows are kept for that window so the admin page can still show what
happened.

## Files

| File | Role |
|---|---|
| `server/session.js` | The session store: minting, validating, touching, revoking, pruning. |
| `server/auth.js` | `requireAuth` and `requireRole` — the authority on every protected request. |
| `server/routes/auth.js` | Login, logout, change-password. |
| `server/routes/sessions.js` | Super Admin session management API. |
| `server/db.js` | The `sessions` table. |
| `server/index.js` | Cross-site request guard, router wiring, hourly pruning. |
| `src/admin/api.js` | Sends cookies instead of a token; clears the legacy JWT. |
| `src/admin/AuthContext.jsx` | Asks the server who is signed in; stores no credential. |
| `src/pages/admin/Sessions.jsx` | The Sessions admin page. |