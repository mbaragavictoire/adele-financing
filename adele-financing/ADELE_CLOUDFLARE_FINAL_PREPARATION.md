# ADELE Cloudflare Final Preparation

Date: 19 October 2026, Africa/Kigali. **Repository security: FAIL for release clearance. Deployment: HOLD.** The known current builds pass, but credential cleanup, reviewed proxy implementation and a safe preview environment are still required. This report is a design/review artifact; it does not implement or deploy the proposed changes.

Labels: VERIFIED = observed locally/in reachable Git objects; INFERRED = recommendation or risk assessment; USER-CONFIRMED = supplied by the user; UNKNOWN = not independently established. No secrets, password hashes, account identifiers or customer records appear here.

## 1. Repository and scope

VERIFIED: repository origin is mbaragavictoire/adele-financing; remote heads/tags checked read-only during this review advertise only master at a104c041e15c2a43691429a6e657c70e59e0fc88. Local master/origin-master match. Twenty-one committed revisions were reviewed, alongside local working files and internal refs. No fetch, push, history rewrite, branch switch, account change or deployment was performed.

Git root is the parent directory of this app; the repository-relative frontend root is **adele-financing**. The earlier successful local build and corrected committed-snapshot build are documented in CLOUDFLARE_DEPLOYMENT_READINESS_REPORT.md. They used installed dependencies, not a fresh Linux npm ci. There are 33 pre-existing tracked modifications/deletions, plus untracked frontend/localization/assets and reports. GitHub master does not include these changes.

## 2. Flagged-file review and actual findings

| Item | Evidence and result | Required response |
|---|---|---|
| Home page.docx | ZIP/XML review: marketing/site/application requirements, 305 paragraphs and one table; no email addresses, long numeric identifiers, credential assignments, external relationships or embedded payloads identified. National-ID text describes required documents, not actual ID values. Author metadata exists and was not printed. | Keep this local planning document out of deployment/Git unless intentionally sanitized and reviewed. It is not a required frontend asset. |
| Home page.docx provenance | **Correction to earlier reports:** its blob occurs in three local refs/codex bookkeeping trees, but not in master/origin-master committed history. A broad --all object scan included internal tool snapshots; this does not establish GitHub exposure. | No GitHub history cleanup is justified for this document from current evidence. Do not push internal refs; avoid git push --mirror/--all. |
| test-doc.pdf | Tracked at repository root; introduced in commit 5f5fc00. Only 39 bytes: synthetic PDF-header/test-marker fixture, no pages/streams, email, long identifier or credential pattern. | No customer-document leak identified. Keep it clearly identified as a fixture; it is outside the Pages frontend root and not included in the reviewed builds. Removing an unnecessary fixture is optional, not a security incident response. |
| integrity-wins-test.mjs:65 and quarterly-dashboard-test.mjs:59 | Known static seed-password fixtures. Additional password literals exist in verify-csrf.mjs and verify-sessions.mjs. These are test inputs, not automatically cloud credentials. | Use generated temporary test credentials and explicit isolated-test-database guards in a later approved patch. Never execute these against production. |
| temp-admin.mjs:11 | **Confirmed credential reuse:** the committed literal matches one local inactive staff password hash. None of the inspected candidate literals match an active local staff account. No matching configured nonempty local secret value was found. No password value, account identifier or hash was printed. | Treat this credential as exposed. Keep the account inactive; rotate its password and revoke related sessions through a separately approved administrative action before reuse. Check other environments privately for reuse. |
| temp-admin.mjs operational behavior | Source calls initDb(), can recreate an active super-admin with the fixed password, removes/replaces a prior temporary account, and prints credentials. It was NOT executed. | This is a release blocker even though the matching local account is inactive. Remove reusable passwords, require a strong environment/database allowlist, make account creation explicit and keep production bootstrap/logging out of diagnostics. Any account deletion needs separate approval. |
| Historical JWT fallback | A hard-coded fallback signing secret exists in historical server/auth.js; relevant history includes commits 5f5fc00 and e4ab4ae. Current source uses opaque database-backed sessions, not JWT signing. | If any deployed legacy build used that fallback, rotate its JWT signing secret and invalidate its tokens, then retire/update that build. Do not invent or rotate a JWT secret for the current cookie-session implementation. |
| Current dummy bcrypt input | routes/auth.js uses a constant only to spend equivalent bcrypt work for an unknown user. It is not an accepted authentication credential by itself. | Do not confuse the timing dummy with a live password leak. No active-account match was found. |

The credential comparison used SELECT-only local user-hash reads and offline bcrypt comparisons. It made no login attempts, did not run application initialization, and changed no accounts or records. Eight distinct inspected literal candidates included test inputs, the timing dummy and the historical fallback; this is a bounded review, not a guarantee against all possible secret formats.

VERIFIED: no committed .env files (other than the safe .env.example template), SQL/dump backups, uploaded-document directory paths or private-key file paths were found in the inspected branch history. The 21 protected document backup copies are ignored local artifacts, not Git commits. Binary document inspection was limited to the flagged files. Other binary assets, forks, deleted/unadvertised refs, hosted logs, GitHub secret-scanning alerts and remote account state were not exhaustively audited. There is no evidence here of a Supabase password/token leak; no Supabase connection or credential retrieval was attempted.

**Security verdict: FAIL until the exposed temporary-admin credential and unsafe account-creation helper are addressed and reviewed.** This is not a claim that an active local account is currently compromised. Hosted credential reuse remains UNKNOWN.

## 3. Credential remediation plan - not executed

1. Keep the known matching account disabled. With separate approval, rotate that account's password and revoke its sessions using the existing supported administrative flow or a reviewed transaction. Do not delete the account or alter historical audits. No financial-record change is required.
2. Privately check whether its password was reused for production staff, email, infrastructure or other systems; rotate only identified reused credentials and revoke applicable sessions/tokens. Do not paste values in chat or incident reports.
3. Correct temp-admin and test helpers in an isolated branch: require explicit disposable database/environment guards, generate unique temporary credentials, remove password logging and prevent automatic production initDb calls. Do not run verification scripts just to test the guards until their write targets are reviewed.
4. For any still-running legacy JWT build, rotate the signing key and invalidate existing JWTs. Current opaque sessions are separate: revoke affected session rows through approved administration, rather than assuming a JWT rotation changes them.
5. Remove reusable literals from future commits. History rewriting is optional incident cleanup after rotation, not a substitute for rotation; it requires a separate coordinated approval and must never be force-pushed silently. Do not rewrite history for the local-only DOCX.
6. The previously inspected local database administrator connection is privileged and has no configured password. It is not a newly exposed secret found in Git, but it must not become a public cloud runtime identity. Prepare least-privilege runtime credentials independently of migration credentials; changing current credentials must be coordinated to avoid downtime.

## 4. Existing authentication and routing

VERIFIED: server/routes/auth.js:48 performs bcrypt verification, generic failure responses and database-backed throttling. Login creates a fresh random opaque session ID; session.js hashes it with SHA-256 in the database. requireAuth (auth.js:65) reloads user status/role for each request; inactive accounts are refused, and requireRole (auth.js:123) protects privileged actions. Password changes/reset flows revoke sessions. Startup calls initDb (index.js:254), which creates/seeds/migrates and must not be used as an inspection tool.

Cookie implementation (session.js:104-145): adele_session, HttpOnly, Secure when configured/production, SameSite=Strict by default, Path=/, finite Max-Age, **no Domain attribute**. Logout clears matching attributes. Sessions enforce idle and absolute limits. Current local secure/strict configuration was observed earlier; a remote host's settings remain UNKNOWN. Authentication data is not stored in frontend localStorage; the frontend clears the legacy token and uses credentials:include (src/admin/api.js:13,49).

CORS (index.js:57-91) has an explicit-origin option but allows origins when its list is empty; credentials:true is absent. The state-change backstop (index.js:107-129) compares origin host, accepts absent Origin and permits configured frontend hosts. That is insufficient as the only security design for a public reverse proxy. Secure same-origin proxying does not require browser cross-origin credential sharing, so there is no reason to weaken cookies to SameSite=None just for this architecture.

Express currently trusts a configurable proxy hop count (index.js:53); rateLimit.js:20 independently trusts the first client-supplied X-Forwarded-For entry. This must be fixed/validated in a later approved patch before relying on public rate limits. The fixed hop count must reflect the actual verified Cloudflare/hosting path, not a guessed value.

API routes are registered at index.js:177-192. Vite's /api proxy is development-only. vercel.json contains a Railway API rewrite but Cloudflare does not execute it. The Railway URL is configuration evidence, not proof of ownership, health, correct credentials or a safe staging target. No request was sent to that live API during this review.

## 5. Recommended architecture and host

**Recommend a conventional Railway Node/Express service**, subject to ownership, pricing, region, networking and backup confirmation; retain an appropriate existing service only after inspection. Railway supports Express and persistent storage. [Express guide](https://docs.railway.com/guides/express), [volumes](https://docs.railway.com/volumes).

Desired flow: browser -> HTTPS Pages frontend -> same-origin /api Pages Function -> authenticated HTTPS Railway Express origin -> database/private document storage. Keep the browser unaware of origin credentials. Start with a single backend instance unless shared throttling/concurrency has been implemented. Use a correctly mounted persistent upload volume initially or a separately approved private R2/Supabase Storage port; ephemeral container disk cannot protect customer PDFs.

USER-CONFIRMED: Supabase project adele-loan-management, West EU (Ireland). Its endpoint, database configuration and live status were not inspected. The current backend uses mysql2/MariaDB SQL and cannot just be pointed at Supabase. A PostgreSQL driver/query/decimal/timezone port is a prerequisite to the final architecture. For the persistent service, use Direct with IPv6 or the Session pooler with IPv4-only hosting, TLS certificate/hostname verification and a small bounded pool. [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Workers/Pages Functions is appropriate for the thin proxy. Moving the entire Express application to Workers remains a separate port because of durable PDFs, bootstrap writes, scheduled cleanup and process-local Maps/queues. No full backend runtime change is needed merely to use Pages for the frontend.

## 6. Same-origin proxy implementation specification - proposed only

No production implementation files were created or edited. A later reviewed patch should add the following inside the frontend root:

- functions/api/[[path]].js: Pages catch-all API Function, plus explicit handling for bare /api if needed. The functions directory is beside package.json, not inside dist. Route/API coverage must be verified for /api and /api/*.
- public/_routes.json, copied by Vite into dist/_routes.json: invoke Functions for /api and /api/*, not all static files. Keep API failures as JSON; never let SPA fallback reply with HTML to API calls. File-based Functions routing and inclusion settings are documented [here](https://developers.cloudflare.com/pages/functions/routing/).
- public/_headers: reviewed static CSP/HSTS/nosniff/frame/referrer policy, compatible with current bundled scripts/styles/images. Functions must set their own API response headers; do not assume static _headers covers Functions.
- Reviewed backend ingress guard/trusted-IP configuration in a separate change. The proxy cannot enforce origin security by itself while an unprotected public backend accepts direct traffic.

Proxy contract:

1. Use a fixed HTTPS API_UPSTREAM origin from trusted runtime configuration. Build the upstream URL by assigning pathname/search on that fixed URL and verify the resulting origin. Never accept an upstream URL/Host from the request, query string or browser; preserve /api path/query without stripping the API prefix accidentally. Reject ambiguous/unsupported paths and methods.
2. Read runtime API_MODE with a fail-closed default. Disabled previews never contact an upstream. Sandbox may contact only a specifically approved synthetic-data origin. Production mode requires explicit production-host/origin configuration. Missing configuration returns a generic JSON 503, not a fallback to a live production origin.
3. On unsafe browser methods require full Origin equality with the actual approved frontend origin (scheme, host and port). Preserve that original Origin to Express; do not rewrite it to the upstream merely to bypass CSRF. Configure backend CORS_ORIGINS with exact approved frontend origins, so its current check accepts the legitimate proxy flow despite upstream Host changing. Use distinct staging settings for preview aliases; never trust all pages.dev hosts or arbitrary PR domains. Safe-method browser requests should also reject an explicitly disallowed Origin; no cross-origin response permissions are needed.
4. Send only the required request headers. Forward adele_session, not Cloudflare Access cookies, proxy secrets supplied by the caller or unrelated origin cookies. Preserve method/content type and stream bodies, including multipart boundaries. Do not JSON-reencode PDFs. Handle GET/HEAD without request bodies. Enforce reviewed body/time limits and reject TRACE/CONNECT; let the backend handle its API semantics.
5. Strip caller-supplied forwarding and internal-auth headers. Set an internal proxy credential from a runtime secret and set the authenticated client-IP field from Cloudflare's trusted request metadata. The backend must validate the proxy credential before using forwarded client information. Update rateLimit.clientIp to use only this verified trust path. Restrict/validate direct-origin access; do not assume a Cloudflare route hides the Railway service URL.
6. Use a reviewed server-only API_PROXY_SECRET (or validated signed origin-auth scheme) between Pages Function and Express. Store it only in runtime secret management on both sides. Backend comparison/validation must be fail-closed and timing-safe. Do not pass it to frontend builds, write it to Git or log it. If using Cloudflare Access for origin protection, also prevent bypass through an unprotected Railway endpoint and verify the chosen service-auth behavior.
7. Forward status/body and relevant headers without reflecting internal information. Preserve every Set-Cookie as a separate header, never comma-join it. Enforce the expected session-cookie name and no Domain attribute, rejecting unexpected domain-bearing upstream cookies until explicitly reviewed. Keep Path=/, HttpOnly, Secure, SameSite=Strict and logout expiry attributes. Do not forward Cloudflare Access cookies to the origin or leak internal-origin diagnostics.
8. Use manual redirect handling. Reject unexpected off-origin redirects; rewrite only an explicitly reviewed upstream-to-frontend Location mapping. Never follow a redirect while carrying session/proxy credentials to another host.
9. Set private, no-store on all authenticated API responses and document downloads. Do not enable edge cache or caches.default for APIs; invalidate conflicting Cache Everything rules. Do not add broad CORS headers to proxy responses. Redact cookies, Authorization/proxy credentials, request bodies, document names and financial/customer fields from logs. Use generic upstream errors and correlation IDs.
10. Test the actual Pages runtime's streaming/Set-Cookie behavior and upload/request limits; unit tests plus local runtime tests come before any approved cloud preview. Review platform limits instead of assuming Express's maximum upload is always safe through every ingress layer.

## 7. Why login cookies survive

1. The page calls POST https://frontend.example/api/auth/login, using the existing relative URL and credentials:include.
2. Pages checks the browser Origin and forwards the request to the approved backend over HTTPS with authenticated origin headers. The browser never navigates to the Railway origin.
3. Express verifies the password and writes a hashed session to its database, then replies with adele_session Set-Cookie.
4. Pages returns that Set-Cookie unchanged in its browser-facing response. Because the cookie has **no Domain**, the browser associates it with the frontend response host. Secure/HttpOnly/Strict protections remain. Do not rewrite Domain to pages.dev or the backend.
5. On later same-origin /api requests the browser sends the host-only cookie; Pages forwards only that session cookie. Express remains the session/RBAC authority. Logout forwards the clearing cookie with matching attributes. Neither Cloudflare Access nor the proxy replaces the staff session check.

Preview and production must use different hosts, backend databases, credentials and sessions; do not share Domain cookies. A preview must not receive copied production session records or customer data. Test through Cloudflare Access to verify that its redirects/challenges do not break API POSTs. Same-origin design avoids cross-site cookie dependence; the current absent CORS credentials:true is not a problem for this same-origin browser path.

## 8. Environment requirements

| Scope | Names / intended use |
|---|---|
| Frontend build | VITE_API_URL is the only custom import.meta.env variable found. Leave unset/empty for relative /api. It is public configuration, never a secret. |
| Build tools | NODE_VERSION=24.14.1 reproduces the known local runtime; npm run build, output dist, React (Vite), root adele-financing. A clean npm ci on Linux is still needed. |
| Proposed Pages Function runtime | API_MODE, API_UPSTREAM and API_PROXY_SECRET; proposed names, not implemented today. Strictly separate preview/production settings. Preview default disabled, no production credential/URL fallback. |
| Backend | Existing PORT, NODE_ENV, CORS_ORIGINS, TRUST_PROXY_HOPS, SESSION_COOKIE_SECURE=true, SESSION_COOKIE_SAMESITE=strict and session limits. Review server-only database/proxy/storage secrets per chosen runtime. |
| Future PostgreSQL backend | Server-only database connection/TLS configuration, dedicated runtime identity and approved numeric/timezone policy. No Supabase key is currently required in the frontend. |

Do not add DATABASE_URL, DB_PASSWORD, SEED_ADMIN_PASSWORD, proxy credentials or Supabase service-role keys to VITE_* variables. Preview build environments running untrusted branch code must not receive production secrets. Never globally change VITE_API_URL to a live API merely to make preview screens load.

## 9. Safe preview/deployment plan - not executed

Phase A, layout-only: prepare the proposed proxy's disabled mode and preview labeling/feature restrictions in an approved branch. Protect preview URLs with Cloudflare Access and restrict who can trigger builds; noindex alone is not authentication. No upstream connection, customer files, real staff credentials or database connection is allowed. /api/auth/me may return a controlled guest 401; data/mutation endpoints must return explicit unavailable JSON rather than false success. Disable or clearly mark application/contact/financial actions in the preview UI; API denial must enforce safety independently of hidden controls. The current frontend has no complete preview feature gate, so this mode is not ready to publish unchanged. Do not describe this as a successful end-to-end financial test.

Phase B, functional sandbox: only after implementation approval, use a separately isolated Node service/database containing exclusively synthetic users/customers/loans/documents. Do not import the 454-record customer snapshot or document backups for an externally reachable preview. No real payment integrations, notifications or external side effects. Complete the PostgreSQL backend port before pointing it at a PostgreSQL sandbox. Authenticate preview access, create unique test-only credentials, and ensure production upstream credentials are absent. [Pages preview protection](https://developers.cloudflare.com/pages/configuration/preview-deployments/).

Sandbox acceptance: guest/auth denial; login -> me -> logout; all roles and inactive-account denial; idle/absolute expiry and revocation; valid/invalid Origin; client-IP spoof attempts; direct-origin rejection; noncached private responses; protected deep links/SPA refresh; multipart PDFs and authorized download; no cookie leakage on redirects; upstream outages; synthetic approval/disbursement/repayment concurrency and financial reconciliation. Empty real-source repayment/income/expense tables do not provide sufficient test coverage for these flows.

Phase C, production: requires separate data-migration and deployment approval after security cleanup, private storage, PostgreSQL validation, financial/role parity and rollback readiness. Keep MariaDB and original documents functional and untouched. No cutover, write freeze, secret rotation, account deletion or upload is authorized by this preparation report.

## 10. Uncommitted work and safe Git workflow

VERIFIED: 33 existing tracked changes include frontend layouts/pages/admin UI, src/main.jsx and a deleted public/favicon.png. Untracked changes include src/i18n, LanguageSelector.jsx, assets, root favicon.png, i18n scripts and reports; the parent Home page.docx is a local planning file. Treat these as user work; do not discard, reset or blanket-stage them.

Required future deployment additions are the proposed API Function, routing config, static/API security headers, backend ingress/IP-trust changes and preview feature restrictions; none are currently implemented. Localization/UI changes are not prerequisites for a static host, but if deploying those edits, stage imports plus their complete untracked dependencies together. Review the favicon move and public asset paths as one unit; the dirty build passing does not mean a partial staged commit will build. The newer UI is absent from current GitHub master.

Recommended workflow (commands/actions not executed):

1. Preserve the current dirty work with a protected local backup and record the base commit; do not blindly git stash --include-untracked, which can capture private planning files into Git objects. Do not create a public archive of the whole workspace.
2. Create a dedicated preparation branch or clean worktree from reviewed master. A worktree can isolate deployment changes without copying unrelated UI edits; choose its location before writing. Keep master unchanged. Ensure repository protections/build settings cannot auto-deploy an unreviewed branch.
3. Apply/review the smallest coherent patch: credential-helper guard/remediation changes, proxy/preview configuration and any explicitly chosen UI dependency set. No code patch was applied during this review.
4. Stage explicit allowlisted paths only. Avoid git add ., git add -A and git push --mirror. From the Git root, paths begin adele-financing/. Remember its nested .gitignore does not protect documents placed at repository root. A separately reviewed root ignore rule for Home page.docx can prevent accidental future staging; it does not remove existing local tool snapshots.
5. Inspect staged file names and the diff privately with secret redaction; confirm no .env, reports containing private operational mappings, document backups, uploaded files, generated dist, or internal refs are included. Current server/data and upload ignores remain effective. Do not force-add ignored preparation artifacts.
6. Run fresh lockfile-based installation/build in the clean snapshot after explicit network/install authorization when needed, plus meaningful proxy/auth tests against synthetic targets. Review dependency advisories without automatically installing upgrades. Existing operational test scripts must not be run against adele_lms.
7. Prepare a reviewable change/PR only when separately authorized. A push can trigger automatic deployment, so confirm Cloudflare production/preview rules before any future push. Do not push or merge now. User approval remains required for publication/deployment and any history rewrite.

## 11. Decision and exact next action

- Repository security: **FAIL for release clearance** because a reusable credential is committed and matches an inactive local account, and temp-admin can recreate an active privileged account. No active local password match or customer-document leak was identified in the reviewed items.
- Recommended backend: **Railway conventional Node/Express**, with verified ownership/configuration and durable private document storage; PostgreSQL backend port still required before Supabase use.
- Proxy: Pages API Function, exact-origin CSRF checks, fixed upstream, server-authenticated ingress, host-only cookies, verified client IP and no API caching. Disabled previews have no upstream; functional previews use synthetic-data-only infrastructure.
- Remaining blockers: approved credential remediation; proxy/ingress/preview implementation and tests; clean coherent Git commit; Linux clean build/dependency review; backend ownership/region/networking; PostgreSQL/collation/timezone/decimal port; isolated sandbox and private storage. Existing backup success does not remove these gates.
- **Exact next safe action:** Review this design and authorize a local, isolated security/proxy/preview patch with synthetic-only tests. Separately authorize resetting the exposed inactive credential/revoking its sessions. Neither authorization should imply permission to deploy, push, migrate customer data or modify financial records.

Created ADELE_CLOUDFLARE_FINAL_PREPARATION.md and sanitized ignored local review evidence only. No production application code, financial data, database configuration, credentials, branches or deployments were changed. No Supabase connection was made. The original SQL backup, original documents and retained restore-test database remain preserved.
