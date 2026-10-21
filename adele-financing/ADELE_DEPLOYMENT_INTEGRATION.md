# ADELE integrated Railway/PostgreSQL + Cloudflare Pages preparation

21 October 2026, Africa/Kigali. Local integration PASS; deployment NOT performed. Branch preparation/railway-pages-postgres-20261021. Application: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\railway_pages_integration_20261021\adele-financing. Both source patch worktrees and original dirty master are unchanged. The owner subsequently authorized a local commit only; inspect git log -1 on this branch for its commit. No push or deployment was authorized. User reports that the hosted 18-table schema, adele_railway LOGIN and password already exist; this was not independently checked remotely.

## Integrated behavior

Combined the complete PostgreSQL patch with the security proxy patch, including existing untracked source files. Resolved three overlapping files: package.json combines safe preview development commands and both test suites; eslint.config.js combines server/test/Functions rules; server/rateLimit.js retains PostgreSQL booleans and the authenticated client-IP helper instead of trusting client forwarding chains. Session metadata now uses the same authenticated client-IP helper as login throttling. The original MariaDB database implementation remains unchanged; normal npm start still selects the configured driver, with mysql as legacy default. Railway MUST use the new npm run start:railway, which refuses missing DB_DRIVER=postgres or an insecure/reviewed-financial configuration before opening any database connection.

New scripts/start-railway.mjs reads PG_CA_CERT from runtime variables, validates PEM CA certificates/validity, creates a unique owner-only temporary directory and 0600 CA file (Linux), assigns PGSSLROOTCERT, removes the extra PEM environment copy and imports the backend. Normal exit cleans up its own file/directory; abrupt platform termination may leave only ephemeral container storage, not repository files. It never prints passwords, proxy secrets or certificate contents. PostgreSQL keeps rejectUnauthorized:true; host identity verification is not disabled. Existing backend initialization automatically connects, performs metadata checks and exits on failure. It does not create a schema or import data. Schema ownership/superuser/BYPASSRLS are refused. Railway health is GET/HEAD /api/health, 503 until database readiness and 200 afterward; it reveals only service readiness.

The original railway proxy mode still requires synthetic-sandbox identity, synthetic-only response markers and rejects the old production hostname. Existing disabled/synthetic/local-synthetic modes remain unchanged. A new explicit API_MODE=railway-postgres requires API_STAGE=postgres-restricted, a fixed HTTPS *.up.railway.app origin, the exact frontend origin and matching proxy secret. This separate profile permits the existing Railway hostname only after a nonce-bound adele-postgres-restricted identity probe and restricted-postgres response markers. An unchanged MySQL deployment fails this probe. The marker identifies the restricted application mode, not a remote attestation of database contents or permissions. No traffic was sent to the real hostname during tests; injected fetch mapped it to loopback only.

Railway ingress requires ADELE_DEPLOYMENT_MODE=postgres-restricted, PostgreSQL and adele_railway username, production Secure/Strict cookies, exact matching CORS origin, a valid shared secret and disabled financial policy. Only health is exempt from secret validation. Other direct Railway API requests are denied. It replaces untrusted forwarding headers after validation and does not rely on a numeric proxy-hop count. Cloudflare overwrites client identity/auth headers from platform context; redirects and unsafe cookies fail closed. Only adele_session is forwarded; cookies remain host-only Secure/HttpOnly/SameSite=Strict/Path=/. Private API responses remain no-store. Malformed API paths and private file routes fail closed before SPA fallback.

Financial POST/PUT/PATCH/DELETE routes (including case variants, public applications and uploads) are blocked at the edge and ingress, and monetary SQL remains blocked by the PostgreSQL adapter. The restricted financial policy cannot be enabled even by setting the former reviewed-exact-v1 opt-in value. Schema role grants independently deny financial DML/business sequences. Authentication, session maintenance, staff administration, contact messages and append-only audits retain their existing route/role controls; this is not a totally read-only authentication database. Document routes and unreviewed search remain unavailable. Some calculation/report endpoints also return 503 pending review. No business formulas or grants were relaxed.

## Exact Railway configuration (future manual action only)

Use railway.env.example for a credential-free checklist. Set actual secrets only in Railway Variables. Never save a real .env, database URI, password or proxy secret in source, chat, logs or a VITE_* variable.

| Variable | Value |
|---|---|
| NODE_ENV | production |
| DB_DRIVER | postgres |
| ADELE_DEPLOYMENT_MODE | postgres-restricted |
| PGHOST | exact Supabase Session Pooler hostname from the project Connect panel |
| PGPORT | 5432 |
| PGDATABASE | postgres (confirm in Connect panel) |
| PGUSER | adele_railway.<project-reference> |
| PGPASSWORD | existing role password, entered privately, not URL-encoded |
| PG_CA_CERT | complete matching trusted PEM CA bundle, with real line breaks |
| PGSSLMODE | verify-full |
| PG_POOL_MAX | 5; coordinate replicas with the role connection limit of 5 |
| TZ / PG_TIME_ZONE | UTC / UTC |
| SESSION_COOKIE_SECURE | true |
| SESSION_COOKIE_SAMESITE | strict |
| API_ALLOWED_ORIGIN | exact approved protected HTTPS Pages/custom origin, no path/trailing slash |
| CORS_ORIGINS | exactly the same single origin |
| API_PROXY_SECRET | new independent random 32-byte base64url secret, identical on Pages; set privately |
| PORT | Railway-provided; do not override |

Unset DATABASE_URL, ADELE_PG_FINANCIAL_POLICY, ADELE_PG_SEARCH_REVIEWED, ADELE_PROXY_SANDBOX_ONLY, all legacy DB_* connection variables, seed credentials and insecure TLS overrides. PGSSLROOTCERT is created automatically; do not set a hard-coded file path. No manual printf shell startup command is necessary. Numeric TRUST_PROXY_HOPS is ignored in the restricted profile. Session lifetime variables can remain at existing defaults: SESSION_IDLE_MINUTES=30, SESSION_ABSOLUTE_HOURS=8, SESSION_MAX_PER_USER=3.

Service root adele-financing, Node 24.x (package engines), lockfile-based build npm ci --include=dev && npm run build, start npm run start:railway, health /api/health, timeout 120 seconds. railway.json declares these build/start/health settings. Select its path explicitly in Railway if the project does not discover configuration under the service root. Existing Railway start-command overrides must be changed separately when approved; the old npm start configuration will not create the CA file. Remove any conflicting old Node-version override. Never configure a migration/predeploy command; do not rerun 001/004 or rotate the existing password as part of this deployment.

## Exact Pages configuration

Protected functional build: VITE_ADELE_PREVIEW_ONLY=false; VITE_API_URL empty/unset; build npm ci --include=dev && npm run build; root adele-financing; output dist. No frontend database variables or proxy secret in build variables. With VITE_ADELE_PREVIEW_ONLY=true the original brochure-only synthetic UI remains intact.

Functions runtime: API_MODE=railway-postgres, API_STAGE=postgres-restricted, API_ALLOWED_ORIGIN=<same exact frontend origin>, API_UPSTREAM=<fixed existing Railway HTTPS origin without path>, and API_PROXY_SECRET=<same private runtime secret>. Configure no local service binding, API_LOCAL_RUNTIME or database credentials. Build variables and Functions runtime variables are distinct.

Use the separate wrangler.restricted.toml for a future explicitly approved functional deployment; wrangler.toml intentionally remains disabled/synthetic. For a future authorized Wrangler upload, use the integrated app directory and the pattern wrangler pages deploy dist --config wrangler.restricted.toml --project-name <approved-project> --branch <approved-nonproduction-branch>. Compile Functions alongside dist; dashboard drag-and-drop alone omits these security handlers. Do not upload the repository or server/data. For Git integration, explicitly select the functional configuration and confirm effective runtime values; do not assume dashboard variables override the old disabled/synthetic Wrangler profile.

Protect every frontend path with Cloudflare Access tester allowlists and no Everyone/Bypass policy. Keep Functions quota failure mode fail-closed. Select a stable frontend hostname before setting API_ALLOWED_ORIGIN on both sides; a different hash preview URL will intentionally fail until separately configured. No Access policy or platform setting was changed in this task.

## Actual local checks

- Combined command npm run test:deployment: 77/77 test nodes PASS. PostgreSQL suite 38, original proxy suite 29, new integration suite 10 (including parent). The final npm run test:deployment invocation also passed after the session client-IP fix.
- New integration executes real Express auth/session routes through the proxy against in-memory PostgreSQL 18.6/PGlite+ICU under SET ROLE adele_backend, never a remote database. Only synthetic inactive-environment users/fixtures and random ephemeral test passwords/sessions were used. Covered public health/direct API denial, old-backend marker refusal, login, distinct session issuance on repeated login, authenticated reads, logout clearing/replay refusal, origin/CSRF rejection, malformed paths, blocked financial operations, exact group permissions, client-IP recording and secret-free failed startup logs. Concurrent sessions remain allowed by the existing policy; repeated login does not revoke all earlier sessions automatically.
- Initial session test failure was caused by the harness using the host timezone while the database used UTC. Matching TZ=UTC and PG_TIME_ZONE=UTC (as enforced by Railway startup) corrected the harness; assertions were not weakened.
- Startup tests create/remove local CA files using public trusted test roots; no TLS handshake is claimed. Invalid/missing CA, credential, driver, role, cookie, policy and TLS configurations fail before database connection.
- Targeted ESLint over combined backend changes, Functions, tests, startup, preview UI and Vite: PASS.
- Default safe-preview frontend build PASS, 73 modules. Functional frontend build with VITE_ADELE_PREVIEW_ONLY=false PASS, 73 modules. dist currently contains the functional build; do not publish without Access/runtime configuration.
- Wrangler 4.151.2 Pages Functions local compilation PASS with both default and wrangler.restricted.toml configurations. Initial sandbox filesystem denial was resolved by approved ancestor read access and worktree-local log/output paths; no account API or deployment operation was used. No workerd runtime or real-browser TLS/session success is claimed.
- Bounded scan of 15 dist files found no private-key, credential-URI or JWT patterns, .env/SQL/PDF/DOCX/key/certificate/source-map paths. Public brochure media contains existing actual staff names/portraits; it is not all synthetic imagery. Unknown secrets/EXIF were not exhaustively certified.
- Known temporary-admin credential audit: zero current-source matches; one historical blob remains on reachable master/origin-master history. No history rewriting or credential reuse/rotation occurred. Do not reactivate that account or reuse its old credential. Historical remediation remains a separate decision before any broader repository publication.
- git diff --check PASS apart from checkout line-ending notices. No new dependencies were downloaded. Local node_modules is an ignored junction to the existing PostgreSQL patch dependencies, and the previously installed Wrangler was reused. No npm ci was run against this junction; future clean Linux installation is not claimed as locally executed.

## Remaining blockers and safe next deployment action

1. The integration is authorized for a local commit. Publishing the branch and any deployment still require separate authorization. Review original master's unrelated dirty UI changes before a later merge; they were intentionally left untouched. The GitHub deployment source still contains the old MySQL backend until an approved Git update occurs.
2. Independently verify hosted schema/RLS/grants, Session Pooler custom-role login, actual issuer/hostname CA verification, and startup options support. The user-confirmed existing role/password is not proof of effective permissions. No remote verification was performed here.
3. Confirm an ADELE application administrator exists or approve a secure first-admin bootstrap. The database LOGIN role is not an application account; the optional seed creates no users. Do not copy historical users or introduce a shared default password.
4. Choose a protected frontend hostname, configure Access allowlists and a fresh shared proxy secret privately, then stage the exact variables above. Browser cookie/auth, real Cloudflare URL normalization and hosted health checks still need a controlled smoke test.
5. Financial write calculations/rounding, affected report/search endpoints and private document storage remain intentionally gated. These are blockers to a fully operational financial system, not reasons to relax the controlled deployment profile.

Next approval: authorize the reviewed Git update and a controlled Railway test-environment deployment of this branch while retaining the existing MySQL deployment/configuration as rollback. After strict-TLS health/role checks pass, authorize the matching protected Pages deployment and browser login/logout smoke test. Only then plan a coordinated production cutover; a new guarded backend will reject the old direct-call frontend, and old/new deployments must not be treated as interchangeable.

Rollback: before any future cutover, preserve the previous Railway deployment and its private configuration outside reports/source. Revert the frontend and backend as a coordinated pair if hosted checks fail; never make the old MySQL build use PostgreSQL variables or run its bootstrap against Supabase. Do not drop the PostgreSQL schema, change data, or clear sessions as an automatic rollback. Existing MariaDB has not been modified by this preparation.

## Local commit preparation update

Added PUBLISH_AND_RAILWAY_TEST_SERVICE.md with isolated test-project steps. Anchored the MySQL preservation test to the reviewed original-source SHA-256 rather than moving HEAD, so it remains valid after this commit and in source archives. Re-ran all 77 tests and the frontend build successfully. Excluded .env.example and .dev.vars.example as well as all actual .env/certificate files from staging; only nonfunctional named runtime-variable examples are included. The example exclusion does not alter safe preview defaults in code. Bounded source scans found no new secret patterns. The known prior password remains in ancestor history, unchanged; do not reuse it. A separate local remote named neworigin contains embedded HTTP authentication; it is not part of Git content and was not printed or changed. Only origin was verified as the intended credential-free GitHub push target. No remote credential was committed.
