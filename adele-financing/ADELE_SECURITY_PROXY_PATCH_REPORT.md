# ADELE Security, API Proxy and Preview Patch Report

Date: 19 October 2026 (Africa/Kigali).

**PASS for the authorized isolated local patch. HOLD / NOT APPROVED FOR DEPLOYMENT.** All 26 new offline tests, targeted lint and frontend build pass. The exposed credential remains historical/unrotated; Cloudflare-runtime/browser validation and isolated hosting configuration are outstanding. No production system was modified.

## 1. Isolation and review location

- Branch: preparation/cloudflare-pages-security-20261019.
- Base commit: a104c041e15c2a43691429a6e657c70e59e0fc88 (master).
- Git worktree root: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\security_proxy_patch_20261019.
- Application root for this patch: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\security_proxy_patch_20261019\adele-financing.
- Original application root: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing.
- Changes remain **uncommitted**, unstaged and local for review. No GitHub push, merge, reset, history rewrite or deployment occurred. Original worktree is still on master; its 33 pre-existing tracked frontend changes and untracked work were preserved.

The isolated patch starts from committed master. It does not include the original worktree's newer uncommitted localization/UI work. Integrating it later must preserve that work and review complete dependency/import/asset sets. No raw diff artifact was published because its removed lines would contain the old password; reports and audit output redact it.

## 2. Changed files

Paths below are relative to the isolated app root.

| File | Change / reason |
|---|---|
| scripts/temp-admin.mjs | Replaces the fixed-password account creator/deleter with an inactive, credential-free synthetic descriptor. No database/env imports; canAuthenticate=false. Direct execution refuses account operations. |
| scripts/audit-legacy-credential.mjs | Read-only exact-value source/history audit; recovers the value in process memory from master, never puts it in arguments/output, scans current worktree and master/origin-master objects. |
| cloudflare/api-proxy.js | Web-standard Pages proxy: fixed HTTPS Railway origin, safe path/method validation, exact-origin CSRF/CORS behavior, authenticated sandbox identity probe, filtered headers/cookies, size/deadline limits, no redirects or API caching, generic errors. |
| functions/api.js | Bare /api Pages entry. |
| functions/api/[[path]].js | Nested /api/* Pages entry, sharing the same handler. |
| public/_routes.json | Routes API calls to Functions rather than SPA fallback. Copied into dist by Vite. |
| public/_headers | Static CSP, HSTS, nosniff, frame/referrer/permissions headers. API responses set their own security/no-store headers. |
| server/proxyIngress.js | Opt-in synthetic-only backend ingress: configured secret, exact Origin/stage and IP checks; dedicated synthetic DB-name guard; identity probe; trusted metadata. Removes the secret from downstream request headers. No database imports/queries. |
| server/clientIp.js | Uses authenticated proxy metadata or Express/socket IP, ignoring arbitrary raw X-Forwarded-For. |
| server/index.js | Installs the new guard only when ADELE_PROXY_SANDBOX_ONLY=true. Misconfigured/source DB names fail before listener/bootstrap. The server was not started. |
| server/rateLimit.js | Uses the corrected client-IP helper while preserving the exported interface. No counter queries or financial logic changed. |
| src/preview.js | Fail-closed preview-first build flag. |
| src/components/PreviewNotice.jsx | Visible synthetic preview notice and unavailable-operation screen. |
| src/App.jsx | Preview renders public layout routes without AuthProvider; admin, contact and application routes are unavailable. Existing functional routes remain behind an explicit non-preview build. |
| cloudflare/build-policy.js | Rejects external VITE_API_URL in preview builds. |
| cloudflare/vite-preview.js | Synthetic API middleware for both Vite dev and Vite preview; no localhost:4000 or other network forwarding. |
| vite.config.js | Installs the build policy and synthetic middleware; removes the old dev API proxy. |
| wrangler.toml | Pages preparation config: dist, compatibility date, disabled default API and synthetic preview mode. No account IDs/backend/credentials. |
| cloudflare/preview.env.example | Non-secret synthetic preview configuration and future sandbox-only requirements. |
| .dev.vars.example | Non-secret local runtime example; no actual credentials. |
| .gitignore | Ignores local .dev.vars values while keeping the safe example. |
| .env.example | Documents VITE_ADELE_PREVIEW_ONLY=true. |
| package.json | Adds test:cloudflare and dev:preview. Default dev now starts Vite only, avoiding automatic backend/bootstrap startup in this preparation branch. No dependencies changed. |
| eslint.config.js | Node globals/recommended checks for config, scripts and tests. |
| tests/cloudflare.test.mjs | 26 offline security/proxy/preview tests using synthetic requests and injected mock upstreams. |
| CLOUDFLARE_PATCH_README.md | Local review instructions, runtime contract, credential remediation and limitations. |

Generated dist and sanitized server/data/patch-validation/validation.json are ignored artifacts, not source commits. package-lock.json was not changed and no software was installed. Existing customer documents/backups were not copied into this worktree or its public/dist directories.

## 3. Credential audit and required remediation

**Current patch source: PASS - zero occurrences** of the former temporary-admin password. **Git history: retained**, one matching blob (30c0ac77dd9cdeae3ac873988152b92570d6b345) at adele-financing/scripts/temp-admin.mjs in master/origin-master reachable objects. No other exact-value source/history occurrence was identified by the scoped audit. The original unchanged master worktree continues to contain the old helper; only this isolated patch source is cleaned. A commit/integration has not been made.

The prior security review found this value matched one inactive local account; none of its inspected literals matched active local accounts. This patch did not reconnect to MariaDB or re-query accounts. Do not reactivate that account until a separately approved password reset and session revocation. Privately identify any reuse in other environments, reset identified reused credentials and invalidate their applicable sessions/tokens. Do not paste values into chat/Git/logs. No rotation, account/session change, user deletion or Git history rewrite was performed.

Removing the literal from new source does not revoke an existing password or erase history. The historical JWT fallback is a separate legacy risk: rotate/invalidate only if a still-deployed JWT build used it. Current opaque sessions do not use that fallback. Distinct existing test fixtures remain outside this targeted credential removal and must never run against real databases. The helper now cannot create or remove any database account even when invoked with old create/delete arguments.

Home page.docx remains local planning material, not a committed master file; local tool bookkeeping refs must not be mirror-pushed. test-doc.pdf remains the previously reviewed tiny synthetic fixture. No history cleanup was attempted or required for those items by this patch.

## 4. Proxy and preview security contract

Missing API_MODE defaults to disabled and performs zero upstream calls. Synthetic mode performs zero upstream calls, serves health/product examples, denies customer/staff data and denies all writes. The frontend defaults to a clearly marked layout preview with operational routes disabled; AuthProvider is not mounted. Vite dev/preview handlers independently deny real-data access, so bypassing a hidden UI cannot reach the working localhost backend. Default npm run dev no longer starts the database-backed server in this branch.

Railway mode is **synthetic-sandbox-only**, requiring explicit stage, exact HTTPS frontend origin, a new runtime-only proxy secret and fixed dedicated *.up.railway.app upstream. The previously configured production origin is rejected. Every operation first probes the upstream /api/preview/identity with a fresh nonce; an authenticated synthetic marker and matching nonce are required before the actual operation is forwarded. Every actual response must also carry the marker. Ordinary live backends fail this gate. Configuration labels/DB prefixes are guardrails, not an independent data audit: future sandbox data provenance still needs verification, and no sandbox credentials or upstream were supplied here.

Unsafe routing, encoded separators, double slashes, disallowed methods, cross-origin or originless unsafe requests are rejected. The upstream origin cannot be supplied in a client URL/header. Caller forwarding/auth/internal headers are discarded. Only Cloudflare-owned edge metadata supplies the client IP; authenticated ingress validates it before it becomes authoritative. Local synthetic mode needs no trusted edge context or network access.

Only the adele_session request cookie is forwarded; unrelated and Cloudflare Access cookies are omitted. Upstream cookies must remain host-only (no Domain), Secure, HttpOnly, SameSite=Strict, Path=/ and have valid clearing semantics. Multiple Set-Cookie headers stay separate; no cookie-domain rewriting or SameSite=None relaxation. A browser should consequently retain the cookie on the Pages host, but real browser/platform verification has not been run.

API response status/body are preserved for valid synthetic responses; unsafe cookies/redirects/missing markers fail closed. All API/error responses are private/no-store at browser/CDN levels; upstream CORS and internal diagnostics are stripped. Redirects are never followed with credentials. Multipart bodies stream with original boundaries and a 51 MiB aggregate cap; declared and undeclared lengths are checked. A 15-second default deadline covers the identity probe and upstream response headers, not the entire streamed download. Platform upload/CPU/memory and complete body-stream timeout behavior remain to be measured in a local Pages runtime.

Backend guard installation is opt-in and rejects adele_lms and adele_restore_test_20261019. It permits only adele_synthetic_* database names with explicit sandbox opt-in and valid proxy configuration. No backend was launched and no synthetic database was created. Existing MySQL bootstrap/seed behavior is still unsuitable for casually running old server/verification commands against real data. Existing generated bootstrap-password logging and other old fixture scripts need further review before exposing a backend.

## 5. Test and build evidence

| Verification | Result |
|---|---|
| npm run test:cloudflare | **PASS: 26 tests, 0 failures** on the final code. |
| Targeted ESLint over changed JS/JSX/MJS, routes and config | **PASS** after adding correct Node lint scope. |
| npm run build | **PASS**, Vite 8.2.2, Node 24.14.1, 73 modules; isolated worktree dist only. |
| Exact former-password audit | **PASS: zero current-source copies; one historical blob documented.** |
| Built artifact password scan | **PASS: absent.** |
| Pages artifact checks | **PASS: dist/_routes.json and dist/_headers present.** |
| Primary-worktree safety check | Original master retained; no patch changes to its server, package.json, Vite config, temp-admin or App.jsx. |

Tests exercise both Pages entries; disabled/synthetic no-network modes; API route rejection; exact scheme/origin checks and cross-site/preflight behavior; unsafe fixed origin/config refusal; trusted edge IP; synthetic identity gating before writes; session login/me/logout header flow; separate Set-Cookie headers; rejection of weak/domain-bearing cookies; no-cache/CORS/header filtering; redirect refusal; multipart streaming; size/deadline/error handling; HEAD behavior; backend ingress source-DB/direct-request/IP-spoof rejection; credential-free helper refusal; preview build/UI policy; and synthetic Vite dev/preview operation. All auth/session flows in these tests are mock, in-memory header semantics, not actual password authentication or database session operations.

No database-backed existing verification scripts were run. No financial calculations or records were changed. No live Node/Express API, Cloudflare, Railway or Supabase service was contacted by these tests. Documentation lookups were the only web activity for implementation guidance.

Limitations: no Wrangler/Miniflare installed or executed; no local browser Secure/SameSite cookie tests; no clean Linux dependency install; no hosted configuration/Access/ingress/health-check validation; no actual synthetic backend, SQL import, PostgreSQL driver port, Supabase query or production financial test. Cloudflare's Functions build/routing and real runtime streaming/Set-Cookie behavior remain to be verified independently of Node mocks. Existing installed dependencies were used; no dependency vulnerability audit/upgrade is claimed.

An intermediate test failed after the guard began removing the internal secret header: the test reused the same mutated request for a second authentication. It was corrected to construct a fresh invalid-nonce request, preserving the security behavior; the final 26-test suite passes. No runtime security check was removed to satisfy that test.

## 6. Remaining blockers and exact next action

1. Review this uncommitted isolated patch, especially API/ingress trust, staged data provenance and preview defaults. Do not overwrite or merge into the running dirty worktree automatically.
2. Authorize local Cloudflare-runtime/browser verification and, if needed, installation of the required local tooling. Wrangler is absent, so it was not silently installed. Exercise the actual Pages router, cookies, streaming limits and fail-closed settings before any preview publication.
3. Separately approve credential reset/session revocation for the exposed inactive account and identified reused credentials. Historical exposure remains until this administrative remediation is complete; no history rewrite is authorized.
4. Before a functional sandbox, create/review genuinely synthetic-only data/infrastructure under separate approval, provision fresh runtime secrets privately, verify backend ownership and direct-origin protection, and configure hosting readiness checks without exposing customer APIs. Never point this patch at the current production Railway origin or copied real sessions/documents.
5. The backend still uses MariaDB/mysql2. PostgreSQL schema/driver/query/decimal/timezone/collation work, private storage and financial reconciliation remain separate blockers to Supabase migration and production operation.
6. Any commit/PR push can trigger Cloudflare automation: review deployment rules and seek publication/deployment approval first. No GitHub push or deployment is part of this patch. The original system, databases, credentials and documents remain unchanged.

**Exact next safe action:** review the isolated branch's files and authorize local Pages-runtime/browser testing with synthetic data only. Keep merge/push/deployment and credential remediation as separate decisions.
