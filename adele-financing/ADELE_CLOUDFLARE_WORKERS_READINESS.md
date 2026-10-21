# ADELE Cloudflare-only Workers readiness

Prepared locally on 21 October 2026. Branch: preparation/cloudflare-workers-postgres-20261021. Parent: 34e9a44e47d1bdc054011dc4cfab96f2ff56f03c from preparation/railway-pages-postgres-20261021. Application: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\cloudflare_workers_patch_20261021\adele-financing.

**Cloudflare-only architecture: feasible and locally demonstrated. Free-plan candidate: CONDITIONAL YES using private Durable Object bcrypt execution; hosted CPU/quota verification remains required. A plain 10-ms Worker running bcrypt directly is not the recommended free-plan design.** Local preparation PASS; hosted deployment readiness remains BLOCKED. No commits, pushes, deployments, database grants, real credential access or production changes were performed.

## Recommended architecture

Use one Cloudflare Worker with Workers Static Assets for Vite's dist and the existing Express API under the same /api origin, a private SQLite-backed Durable Object for bcrypt compute, and Hyperdrive for the existing Supabase database. This is within the requested Pages/Workers platform and removes a second proxy, cross-origin cookies and Railway/Render entirely. A separate Pages frontend is optional, but would need a private service-binding arrangement and its own integration tests; that second topology was not implemented here. The existing Pages/Railway configuration is retained for rollback/reference and is not used by wrangler.workers.toml.

Cloudflare now supports the Node HTTP bridge used here: httpServerHandler({port:8080}), nodejs_compat and enable_nodejs_http_server_modules. Port 8080 is an internal bridge routing key, not a rented server listener. workers/index.js imports a separate workers/app.js, never server/index.js. See [Cloudflare HTTP support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/).

## Supabase transport, roles and TLS

Use a NEW Hyperdrive configuration bound as HYPERDRIVE. Cloudflare recommends node-postgres >=8.16.3; this branch keeps pg 8.23.1. Hyperdrive credentials belong in the provider's private configuration, never a committed connection URI, CLI argument or Vite variable. Retain the EXISTING adele_railway role and its current permissions/password; its name does not create a Railway dependency. For the recommended direct Supabase origin, the database username is adele_railway without the Session Pooler project suffix. Independently confirm direct-endpoint network reachability, including IPv6 availability. Do not silently switch to a transaction pooler if direct connectivity fails. [Supabase/Hyperdrive guide](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/), [pg support](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/node-postgres/).

Mandatory Hyperdrive settings before API activation:

- Origin sslmode=verify-full and the correct trusted CA/certificate configuration. Do not use require, disable or rejectUnauthorized:false. Browser-to-Worker TLS remains Cloudflare's edge HTTPS; Hyperdrive manages the distinct database-origin TLS boundary. The application's old Node CA-file startup path is not used on Workers. No real certificate, handshake or provider setting was examined here. [Certificate verification](https://developers.cloudflare.com/hyperdrive/configuration/tls-ssl-certificates-for-hyperdrive/).
- caching.disabled=true. Cached session, role or rate-limit reads would be unsafe. [Hyperdrive caches eligible reads by default](https://developers.cloudflare.com/hyperdrive/concepts/query-caching/); HTTP no-store alone does not disable SQL caching.
- origin_connection_limit=5 initially, matching the existing role's five-connection cap. This Hyperdrive setting is soft and global pool behavior can still hit the database cap; do not increase role permissions/limits automatically. Coordinate other users of that same login. [Connection pool limits](https://developers.cloudflare.com/hyperdrive/configuration/tune-connection-pool/).

The binding uses Cloudflare's documented internal Hyperdrive connectionString, not a raw user-supplied database URL. ADELE_WORKERS_DATABASE_REVIEWED=verify-full-no-cache is an operator approval gate, NOT an attestation or a runtime inspection of Hyperdrive's hidden TLS/cache settings. The gate must stay unset until these hosted settings are independently verified. Creating a binding could itself test/connect to its origin, so it requires separate approval and was not done.

One pg Client is created and closed per request. Each request executes BEGIN and transaction-local search_path, UTC and DateStyle settings, then verifies the current role, sole non-admin inherited adele_backend membership, no schema ownership or privileged role attributes, visible 18-table schema and denied financial table/column DML. Transaction-local settings are necessary because Hyperdrive pools transactions, unlike the older session-pooler assumptions. No global pg pool or live socket is reused across Worker invocations. A callback transaction uses a savepoint within the request transaction. Failed authentication attempts normally commit their rate-limit/audit records; they are not rolled back merely because the HTTP response is 401. [Hyperdrive transaction behavior](https://developers.cloudflare.com/hyperdrive/concepts/how-hyperdrive-works/).

## Authentication and security preserved

Existing Express routes, bcrypt password hashes, opaque random sessions, SHA-256 stored identifiers, session expiry/revocation, database-backed login throttling and role checks are reused. This does not migrate users into Supabase Auth or grant browser roles private-schema access. Secure/HttpOnly/SameSite=Strict/host-only cookies and session-cookie validation are retained. Only adele_session is passed into Express; duplicate/malformed sessions and unsafe outgoing cookies fail closed. Same-origin Origin/Sec-Fetch-Site checks precede database access; all API responses are no-store. Malformed API prefixes and private filesystem/document paths cannot become SPA HTML.

Worker request/database state is held in AsyncLocalStorage with an internal random request-context identifier restored at the Node HTTP bridge. Caller-supplied x-adele-* and forwarding headers are stripped first. Internal identifiers are never returned to clients and active contexts are removed after the request. The immutable client IP comes from platform CF context and is validated with isIP. Credentials and request-specific settings are never copied into global process.env. Only constant execution-policy flags are set there; financial and search opt-ins are forced off.

The dummy bcrypt timing equaliser now has a fixed PUBLIC salt, used solely for the non-account timing pad, because startup randomness is disallowed by workerd. Real user password hashing still uses fresh salts and cost 12. The Workers password shim returns a precomputed public dummy hash for that pad, avoiding startup CPU/RNG; it never synchronously hashes a user password. No stored password/hash is changed. Customer identity helpers were separated from the filesystem upload module without changing calculations or existing exported helper behavior.

## What was adapted or excluded

| Dependency/behavior | Workers preparation |
|---|---|
| Express 5 | Existing routers behind Cloudflare's supported Node HTTP bridge |
| pg 8.23.1 | Request-scoped client through reviewed Hyperdrive |
| bcryptjs 3.0.3 | Private PasswordCpu Durable Object handles comparison/hash; cost remains 12 |
| decimal.js | Exact amount handling retained; financial writes remain disabled |
| mysql2 and original MariaDB bootstrap | Preserved for Node; excluded from the Worker graph |
| dotenv/server .env and Railway startup | Not imported by Worker; bindings replace local environment loading |
| multer, disk uploads, document file access | Excluded; /api/apply and private file paths disabled |
| contact endpoint's process-memory spam timer | Excluded pending distributed abuse-control review; /api/contact disabled |
| Node listen/process.exit/startup intervals | Old entrypoint excluded; Workers request lifecycle replaces it |
| xlsx/frontend exports | Remain browser-side; no server-side spreadsheet processing added |

A package import alias #adele-db defaults to server/db.js for Node and is mapped to workers/database.js by the new Wrangler config. This preserves the existing Node build and test mocks while excluding the MySQL/env dependency graph from Workers. Periodic session/throttle cleanup has not been ported into a scheduled trigger; expired sessions are still rejected on access. Database retention/cleanup remains a follow-up before sustained operation.

Financial API writes are blocked before opening a database, monetary adapter guards remain active, and restricted DB grants remain required. Search, private documents/uploads, public application submission, contact processing and unreviewed report calculations stay unavailable. This is not a claim that every operational screen is fully enabled.

## Free-plan assessment

Workers Free currently allows 100,000 requests/day, 10 ms HTTP CPU, 128 MB memory and six simultaneous outgoing connections/request. It has a one-second startup CPU budget. The 1.6 MiB raw Worker bundle and current assets are small; CPU is the central issue. All-route run_worker_first=true also makes asset/deep-link requests invoke the Worker and count against request limits. [Current Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

On this Windows/Node 24 host, three bcrypt cost-12 comparisons consumed 406, 469 and 375 ms of process CPU. This is NOT a measurement of Cloudflare production CPU, but it is strong evidence that the unchanged password path should not be promised within 10 ms. Async bcrypt yields execution; it does not remove the total CPU cost. Local workerd does not enforce hosted CPU allowances. Password changes and staff password creation have the same concern. Other database/client/Express overhead also needs hosted profiling.

Hyperdrive Free includes 100,000 database statements/day, not 100,000 complete ADELE requests. Per-request initialization already uses six statements before application queries, plus COMMIT; session/login operations add more. Reads, writes and cached statements all consume that quota. Hitting a free quota causes errors. [Hyperdrive pricing](https://developers.cloudflare.com/hyperdrive/platform/pricing/).

The branch addresses the expensive bcrypt operation with a private PasswordCpu Durable Object, invoked only through a binding. SQLite-backed Durable Objects are available on Workers Free with a default 30-second invocation CPU allowance, 100,000 requests/day and 13,000 GB-s/day compute duration. The namespace uses SQLite because Free requires that backend; the code never writes passwords, hashes, sessions or customer records to SQLite or object storage. Authentication identity/session data remains in Supabase. No timers or deliberate keep-alive are installed. [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Password comparison and new password hashes cross a private in-account RPC boundary; they are never logged, returned to browsers or persisted by the actor. One fixed object name avoids attacker-controlled namespace proliferation. Its HTTP fetch endpoint returns 403. New hashes use cost 12; comparisons accept bcrypt costs 4 through 14, with other costs requiring review rather than weakening the stored hash. The worker still performs database-backed throttling before comparison. A binding failure fails authentication closed.

This makes a low-traffic free-plan deployment plausible without migrating authentication or lowering bcrypt cost. It is NOT a guarantee: the remaining Express/pg/metadata work must fit the Worker's 10-ms CPU limit, actor RPC/duration and Hyperdrive statement quotas apply, and concurrent bcrypt requests/connection caps need hosted profiling. Current default gates remain off. Workers Paid (published minimum USD 5/month plus excess usage) remains an option if the remaining CPU exceeds Free; no billing change was made. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

## Configuration and safe local commands

Entry: workers/index.js. Configuration: wrangler.workers.toml. Required future bindings: HYPERDRIVE pointing to a separately reviewed configuration, and PASSWORD_CPU pointing to a NEW private PasswordCpu namespace. The prepared new_sqlite_classes migration creates only that Cloudflare namespace on a future approved deployment; it is not a Supabase schema migration and has not been applied remotely. API_ALLOWED_ORIGIN must be the exact protected HTTPS hostname. API defaults to ADELE_WORKERS_API_ENABLED=false; password-write endpoints default to ADELE_WORKERS_AUTH_CPU_REVIEWED=false. Leave database review unset until verified. workers/runtime.env.example contains only nonfunctional documentation. No PGPASSWORD, DATABASE_URL, PG_CA_CERT, Railway origin/proxy secret or Supabase service-role key is needed in this Worker's variables. Protect the future testing hostname with Cloudflare Access and keep workers_dev/preview URLs disabled until approved. No real binding, route or account ID is in the file.

From this worktree, dependencies can be reproduced later with npm ci and npm ci --prefix tools/runtime (network downloads; not performed here). Existing ignored dependency junctions were reused for current tests. The following commands are local only:

    npm run test:workers:all
    npm run build
    npm run workers:bundle
    npm run workers:fixture:bundle
    npm run test:workers:runtime

Both bundle scripts hard-code --dry-run. The fixture is never the deployment entrypoint and requires explicit synthetic-only test bindings. On Windows this sandbox, bundler ancestor read access required escalation; logs/output remain inside ignored server/data. The runtime harness uses Miniflare's local outboundService denial, not OS-wide firewall isolation. One deliberate .invalid fetch is intercepted locally to demonstrate denial; application tests cause no further outbound attempts. No native host-network firewall or production TLS handshake is claimed.

## Actual verification and limitations

- 86/86 automated Node tests PASS: original 77 plus nine Workers boundary/metadata/password-RPC checks, including actual Worker metadata SQL executed under a restricted synthetic role in in-memory PostgreSQL/PGlite.
- Nine workerd functional/security groups PASS with a random synthetic password hashed at cost 12: startup, denied egress, private password service HTTP denial, guest auth, private-RPC bcrypt hash/compare and login/cookie attributes, session lookup, parallel anonymous/authenticated request separation, origin/path/document/financial rejection, logout/replay and no-cache behavior (some checks grouped together).
- The production-shaped Worker bundle also starts with API disabled and no database binding, rejects API/private paths, and serves synthetic asset/deep-link responses.
- Targeted lint PASS across changed backend imports/routes, worker modules and tests.
- Vite default preview and functional builds PASS, 73 modules. Worker --dry-run bundle PASS: 1,636.14 KiB raw / 402.78 KiB gzip. Fixture bundle PASS. Bundle scan confirms MySQL bootstrap, dotenv, multer, public application disk routes and contact timer are absent.
- No real Supabase TCP/TLS, Hyperdrive configuration, browser HTTPS session policy, Cloudflare hosted CPU/memory quota or load test was performed. Synthetic runtime session storage is a fixture; deployed storage remains PostgreSQL, whose SQL/permissions were tested separately locally.
- Earlier failed local runs exposed startup RNG, an upload-module side effect, a request-body double-consumption bug and a missing mock query shape. Those were fixed without weakening auth/financial assertions. No current failed check is represented as a pass.

## Remaining blockers and next safe action

Review this locally committed preparation branch and approve the private password-CPU topology for a free-plan test, or choose Paid if hosted measurements require more headroom. Independently review Hyperdrive verify-full/CA/cache-disabled/connection-cap settings and restricted-role grants, origin network reachability, and the startup/CPU profile. Confirm a securely provisioned ADELE application administrator exists; the database login is not an application account. Add reviewed cleanup/storage/contact/search functionality before claiming a fully operational system.

Only after those decisions and separate approval should a NEW protected test Worker, password Durable Object namespace and Hyperdrive configuration be created and connected to the existing Supabase database. Keep all current deployments untouched. The user authorized a local preparation commit on 2026-10-21. No push, deployment, role grant, password provisioning or remote database operation is authorized or performed in this step. The Hyperdrive binding template remains commented until a real configuration is separately approved.

## Final local commit review ? 2026-10-21

Rerun: 86/86 automated tests, targeted ESLint, frontend production build, both Wrangler dry-run bundles, nine synthetic workerd groups and disabled production-shaped startup all PASS. Candidate files were checked for excluded dotenv/certificate filenames, private keys, token patterns and credential-bearing database URLs; no real credential was identified. Existing historical temporary-admin credential remains in master/origin-master history, with zero current-source occurrences; do not reuse that account credential. No history rewrite or credential rotation performed. API/database review gates remain off. Hyperdrive has only a commented binding template; a real binding and independent strict-TLS/cache/permission review are deployment blockers.
