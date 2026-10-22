# ADELE Migration Readiness Report

Inspection date: 19 October 2026 (Africa/Kigali). Scope: local source inspection, read-only database metadata/count queries, and local database export. No cloud deployment, PostgreSQL migration, application startup, source financial-record changes, dependency installation, or Git push performed. A separately approved local restore test was completed on 19 October 2026; only the new isolated test database was created and populated.

Labels: **VERIFIED** = observed in source, local configuration, database, or generated artifact; **INFERRED** = engineering assessment from those observations; **UNKNOWN** = not established; **BLOCKED** = requires approval, implementation, or external setup.

## 1. Executive Summary

**VERIFIED:** ADELE is an npm-managed JavaScript ESM application: React/Vite frontend, Express backend, and mysql2 raw SQL against local XAMPP MariaDB. Authentication uses database-backed opaque cookie sessions, not active JWT authentication. Database adele_lms has 18 InnoDB tables and 454 records at inspection time.

**VERIFIED ? PASS:** Database export was successfully restored into the approved isolated database `adele_restore_test_20261019`. All 18 tables and 454 records, schema/index definitions and per-table content comparisons passed. The backup is now **VERIFIED for the tested local MariaDB restore**, subject to the limitations in section 6. **INFERRED:** Supabase migration is feasible but not production-ready. Cloudflare can host the static frontend; the backend needs database, storage, lifecycle, and deployment changes before Workers can preserve current behavior.

## 2. Project Structure

**VERIFIED:** Application root: `C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing`. Git root is its parent `C:\Users\MBARAGA🥰🥰😍\Desktop\adele`.

- `src/pages/`: public site, application and contact forms; `src/pages/admin/`: staff modules.
- `src/admin/`: routing, authentication context, API wrapper, quarter handling and shared UI.
- `src/i18n/`: localization; `src/assets/`: bundled images.
- `server/index.js`: Express entry, middleware, routers, static frontend, startup and housekeeping.
- `server/db.js`: pool, query helpers, transactions, schema, seeding and startup migrations.
- `server/routes/`: API modules; `server/auth.js`, `session.js`, `rateLimit.js`, `security.js`: security infrastructure.
- `server/uploads/applications/`: private document filesystem storage.
- `scripts/`: verification and maintenance scripts. Not executed because some may start or modify the application/database.
- `dist/`, `node_modules/`, local environment files: generated/local content.
- `server/data/backups/adele_pre_migration/`: backup artifacts created during this inspection, covered by existing Git ignores.

**VERIFIED:** Many pre-existing modified/untracked frontend files exist; inspection did not edit them. No AGENTS.md was found in the application or immediate Git root during the targeted checks. README remains the generic Vite template rather than operational documentation.

## 3. Technology Stack

**VERIFIED:** Installed versions: React 19.2.8; Vite 8.2.2; Express 5.2.1; mysql2 3.24.4; multer 2.3.0; bcryptjs 3.0.3; xlsx 0.18.5. Package manifest also specifies react-router-dom ^7.18.3, cors ^2.8.6, dotenv ^18.0.3, concurrently ^10.0.5 and ESLint ^10.9.0. Installed and declared versions are distinguished here; not all transitive packages were audited.

**VERIFIED:** Node installed: v24.14.1. No application engines declaration. Installed Vite requires `^20.19.0 || >=22.12.0`; Express requires >=18. Use a supported Node release satisfying all package engines and pin it before deployment. npm/package-lock.json are present. `npm run build` builds Vite assets into dist; `npm start` runs `node server/index.js`; development runs Vite and API concurrently. No build/test was run during this read-only application review.

**VERIFIED:** `vite.config.js` uses the React plugin and proxies `/api` to localhost:4000, retaining browser Host. No ORM, PostgreSQL driver, Supabase client, or reviewed SQL migration directory was found. Schema changes currently live in startup JavaScript.

## 4. Current Database

**VERIFIED:** Database: **adele_lms**. Engine/server: **MariaDB 10.4.32**, XAMPP `C:\xampp\mysql\bin\mysqld.exe`, running locally. Host: localhost. Port: **3306**. All 18 base tables are InnoDB, database/table encoding utf8mb4, collation utf8mb4_unicode_ci. Server time_zone is SYSTEM; actual system/database timestamp alignment remains UNKNOWN. Event scheduler OFF.

**VERIFIED:** Connection configuration is `server/.env`, loaded by `server/env.js`; defaults/pool are `server/db.js:5-31`. Runtime environment can override dotenv values; inspection connected using the local configured file, and did not inspect secrets in another running deployment. The local configured account has global ALL PRIVILEGES; its password is unset. Use a dedicated least-privilege account in future; no credentials are reproduced here.

**VERIFIED:** `initDb()` creates database/schema, seeds data and runs ALTER checks (`server/db.js:15-37`). Therefore starting/importing the server was deliberately avoided. The live metadata, rather than SCHEMA alone, was used to inventory the existing database.

## 5. Database Inventory

**VERIFIED:** Exact counts from a read-only consistent transaction; these describe the inspection snapshot, not necessarily the subsequent export snapshot if other clients wrote concurrently.

| Table | Records | Responsibility |
|---|---:|---|
| application_documents | 7 | Uploaded document metadata |
| audit_logs | 301 | Staff/security audit trail |
| contact_messages | 1 | Public inquiries |
| customers | 21 | Borrower accounts |
| expenses | 0 | Operating expenses |
| incomes | 0 | Other income |
| loans | 2 | Disbursements and balances |
| loan_applications | 8 | Applications and approval state |
| loan_products | 8 | Product terms |
| login_attempts | 69 | Login throttling history |
| payments | 2 | Payment/disbursement register |
| repayments | 0 | Recorded repayments |
| repayment_schedules | 8 | Installment schedule |
| revoked_tokens | 0 | Legacy token revocations |
| roles | 4 | Staff role catalog |
| sessions | 10 | Hashed staff sessions |
| settings | 8 | Business configuration |
| users | 5 | Staff credentials and roles |
| **Total** | **454** | **18 tables** |

**VERIFIED:** information_schema returned zero foreign keys, views, triggers, routines/functions, and events. All tables have primary keys. Unique indexes exist on staff email, role name, customer business ID/email, loan product name, application business ID, loan business ID/application_id, repayment/payment/income/expense business IDs, and settings key. Secondary indexes cover contact status/date, login identifier/date and created date, session user/revocation and expiration state, and token expiration. Relationships are not enforced by foreign keys.

**INFERRED from joins/schema:** applications reference customers, loan products, assigned/approving/rejecting users; loans reference applications, customers, products and disbursing users; schedules reference loans; repayments/payments reference loans, customers and recording users; income/expense records reference recording users; sessions/login/audit support users. `application_documents.application_id` is a string business identifier, unlike numeric application references on loans. `users.role` is a text role name rather than roles.id. Validate each relationship and orphan count before adding PostgreSQL constraints.

## 6. Backup Status

**VERIFIED ? PASS: EXPORT AND ISOLATED LOCAL RESTORE SUCCEEDED.**

Successful file:
`C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\backups\adele_pre_migration\2026-10-19T13-44-34-759Z\adele_lms_2026-10-19T13-44-34-759Z.sql`

- Size: **72,368 bytes**.
- SHA-256: `0dcb918151f55b31413291a8d62a152b150874eab0e9a7f49a91a82e0fb7ef6d`.
- Utility: XAMPP mysqldump, MariaDB 10.4.32 compatible.
- Exit code 0; no stderr; dump completion marker present.
- All 18 expected CREATE TABLE definitions present; INSERT statements found for all 14 nonempty tables. Empty tables correctly have schema without data INSERTs.
- Options: `--no-defaults --single-transaction --quick --skip-lock-tables --routines --events --triggers --hex-blob --default-character-set=utf8mb4`, with the confirmed database and configured host/port/account.
- InnoDB supports this consistent transactional data export without stopping ordinary writes. **UNKNOWN:** No independent monitoring established whether another operator performed concurrent DDL. Transaction mode does not protect against concurrent schema changes; prohibit DDL for a final export.
- Views/routines/triggers/events were absent in inspected source metadata; relevant dump options were enabled. Existing keys/indexes are part of table definitions; there were no foreign keys to export.
- Authentication was supplied only to the child process environment, never password arguments/logs. A temporary client option file from an earlier attempt was removed.
- Timestamp directory ACL inheritance was removed and access granted to current Windows user and SYSTEM. This is plaintext SQL protected by filesystem permissions, not encrypted backup media.
- Existing Git ignore rules cover `server/data`; `git check-ignore` confirmed the path. Express serves dist only and authorized document downloads, not server/data. No backup was committed or uploaded.
- `backup-metadata.json` accompanies the dump. Earlier failed timestamp folders were retained; one contains an empty SQL file with failed metadata. They are not usable backups and were not overwritten.

### Isolated restore test ? 19 October 2026

**Overall result: PASS. VERIFIED for local MariaDB restore.** User explicitly approved creating the test database. An information_schema check confirmed `adele_restore_test_20261019` did not exist, and CREATE DATABASE without IF NOT EXISTS succeeded before import. The original `adele_lms` database was used only for read-only comparison queries; no application startup, source DDL/DML, drop, truncate, or overwrite was performed.

**VERIFIED restore process:** The existing backup checksum matched before import. Preflight found no USE, CREATE/DROP DATABASE, or source-qualified table statements in the dump. XAMPP mysql.exe imported the unchanged dump with the test database explicitly selected. Exit code **0**, stderr **0 bytes**, and **no SQL import errors**. Database creation/import affected only the approved test database, which is **retained**. Verification ran through a read-only consistent transaction and then rolled back that read transaction.

| Table | Original snapshot | Restored | Live source | Count/content result |
|---|---:|---:|---:|---|
| application_documents | 7 | 7 | 7 | PASS |
| audit_logs | 301 | 301 | 301 | PASS |
| contact_messages | 1 | 1 | 1 | PASS |
| customers | 21 | 21 | 21 | PASS |
| expenses | 0 | 0 | 0 | PASS |
| incomes | 0 | 0 | 0 | PASS |
| loans | 2 | 2 | 2 | PASS |
| loan_applications | 8 | 8 | 8 | PASS |
| loan_products | 8 | 8 | 8 | PASS |
| login_attempts | 69 | 69 | 69 | PASS |
| payments | 2 | 2 | 2 | PASS |
| repayments | 0 | 0 | 0 | PASS |
| repayment_schedules | 8 | 8 | 8 | PASS |
| revoked_tokens | 0 | 0 | 0 | PASS |
| roles | 4 | 4 | 4 | PASS |
| sessions | 10 | 10 | 10 | PASS |
| settings | 8 | 8 | 8 | PASS |
| users | 5 | 5 | 5 | PASS |
| **Total** | **454** | **454** | **454** | **PASS** |

**VERIFIED structure/content:** All 18 SHOW CREATE TABLE definitions match the live source exactly, including primary keys, indexes and AUTO_INCREMENT state. Ordered information_schema index metadata matches: **43 index-column entries**, including the primary keys on all 18 tables (43 is not a count of distinct indexes). Table type, engine and collation metadata match. Every table's rows, ordered by primary key, produced matching SHA-256 digests of the driver-serialized content; no row values, customer information, credential hashes or financial totals were printed. No missing records or content differences were found. Foreign keys, views, triggers, stored procedures/functions and events are all absent in both databases (zero each); their absence matches, rather than implying that nonempty objects were tested.

**VERIFIED financial/integrity checks:** All **26** checks returned zero violations in both source and restored databases:

- Loan amount validity, principal plus interest versus total payable, paid plus outstanding versus total payable, paid amount versus recorded repayments, and completed-loan zero balance.
- Schedule total and installment count versus each loan; disbursement amounts versus disbursement payment-register totals.
- Repayment-to-payment and payment-to-repayment matching on loan, customer, date, amount, method and reference.
- Positive payment, repayment, schedule, income and expense amounts.
- Customer/application/product relationships for loans; customer/product relationships for applications; loan/customer relationships for payment and repayment records; loan relationships for schedules; application relationships for documents.
- Loan due/start-date ordering and positive duration; duplicate loan application references.

**VERIFIED aggregate parity:** Counts and amount totals match between source and restored data for loans (principal, interest, payable, paid, outstanding and disbursed), payments by type, repayments, schedules, income and expenses. Aggregate amounts remain private. No difference was found in the checked balances or financial records.

**VERIFIED backup preservation:** Post-test SHA-256 is still `0dcb918151f55b31413291a8d62a152b150874eab0e9a7f49a91a82e0fb7ef6d`; file size remains **72,368 bytes**. The original SQL backup and its original export metadata were left unchanged. A separate protected result artifact was added at `server/data/backups/adele_pre_migration/2026-10-19T13-44-34-759Z/restore-results-20261019-1792418248632.json`. Verification began at 15:57:27 Africa/Kigali (13:57:27 UTC).

**Limitations:** This validates recovery on the same local MariaDB installation/version, not PostgreSQL compatibility or complete application disaster recovery. No application login/UI/report execution, concurrent-write test or cloud migration was performed. The dataset has only two loans, two payment records and eight schedule rows; repayment, income and expense tables are empty, so related checks have no populated cases. Most monetary equality checks allow a **0.005 RWF** tolerance for existing DOUBLE data; paid-versus-repayment comparison allows the application's **0.5 RWF** closing tolerance. This is bounded consistency checking, not an external accounting audit or independent recalculation of contractual interest. Matching checksums compare database values as serialized by mysql2, not raw physical storage bytes. Documents are outside the SQL dump and were not restored or copied. Neither the test nor original database was deleted, and existing migration/security blockers remain.


**VERIFIED:** There are 21 files totaling **19,609,342 bytes** under server/uploads, versus 7 document metadata records. SQL stores references only. Files were not copied as part of the database export. **UNKNOWN:** Which files are referenced, orphaned or missing requires reconciliation without exposing names/customer content. A separate protected document backup is required for complete application recovery.

## 7. Application Modules

**VERIFIED:** Router mounts are `server/index.js:177-192`: `/api/auth` (login/me/logout/password), customers (CRUD/bulk import), loan-products (terms), loan-applications (review/reject/approve), loans (disbursement/detail), repayments (record repayment), payments (register), reports (business/financial exports), users (staff/roles), settings, audit-logs, sessions (administrative revocation), dashboard, finance (P&L, cash flow, balance sheet, income/expenses), apply (public submissions/documents), contact (inquiries). Health/readiness is `/api/health`.

**VERIFIED:** Quarter/date filtering supports dashboards and financial reporting. Public pages cover company information, products, team, application and contact. Spreadsheet support exists through xlsx. No payment gateway, outbound email/SMS integration, or custom WebSocket server was identified in inspected code; external operational services beyond source remain UNKNOWN.

## 8. Authentication and Security

**VERIFIED strengths:** bcrypt password verification; generic login failures; database-backed login throttle; fresh random session ID on login; SHA-256 session hashes at rest; HttpOnly/Secure/Strict cookies in local configuration; idle and absolute timeouts; per-request user status/role reload; role middleware; password changes revoke sessions. Prepared mysql2 execute/value binding is used by query helpers (`server/db.js:118-160`). SQL fragments inspected were mostly fixed predicates assembled with bound values; no confirmed SQL injection was established. This is a static review, not proof that every input is safe.

| Severity | Status and evidence | Recommended remediation |
|---|---|---|
| High | VERIFIED: local application account has global ALL PRIVILEGES and unset password; server/.env and SHOW GRANTS checked without reporting secret values. | Separate runtime and migration identities; strong secret; restrict host/network and grant only required database rights. |
| High | VERIFIED: financial values use DOUBLE and JavaScript Number; no relational foreign keys. INFERRED integrity risk. | Approved decimal/rounding specification, reconciliation, constraints after orphan cleanup. |
| High | VERIFIED: anonymous PDF upload uses diskStorage before handler (`publicApplications.js:17-31,248`), up to five 10 MB files, with no application-specific submission limiter found. INFERRED disk-exhaustion/abuse risk. | Rate-limit before upload, impose aggregate quotas, protect ingress and private object storage; assess malware scanning. |
| Medium | VERIFIED: clientIp trusts first x-forwarded-for value directly (`rateLimit.js:20-25`); contact throttling is a process-local Map. | Use trusted proxy-derived req.ip and enforce trusted ingress; shared limits across instances. Exploitability depends on ingress behavior, UNKNOWN. |
| Medium | VERIFIED: staff creation permits six characters and bcrypt cost 10 (`users.js:55-65`), while self change/reset requires 12 and cost 12 (`auth.js:171`, `users.js:121-126`). | Unify creation/change/reset policy and hashing cost; review existing credentials without exposing hashes. |
| Medium | VERIFIED: empty CORS_ORIGINS allows origins by default (`index.js:57-85`); CORS credentials:true is absent while frontend uses credentials:include. | Prefer same-origin /api proxy; explicit origins/credentials if cross-origin is deliberately required. Do not treat current CORS as proof of authenticated data leakage. |
| Medium | VERIFIED: CSRF backstop compares origin host, not complete scheme/origin, and accepts absent Origin (`index.js:99-128`). | Review exact origin checks, deployment headers, SameSite assumptions and token protection for any cross-site design. |
| Medium | VERIFIED: database bootstrap may log a generated administrator password when users is empty (`db.js:446-447`). | Secret bootstrap via controlled channel; never print credentials to operational logs. No such password was printed during inspection. |
| Medium | VERIFIED: financial code generates business IDs using MAX+1; locking individual loans does not serialize operations on different loans (`repayments.js:79-103`). INFERRED duplicate-ID races. | Database-backed sequences/atomic allocation, unique constraints and retry tests in staging. |
| Medium | VERIFIED: local plaintext backup includes sensitive records and password hashes. | Preserve restrictive ACL; encrypted offline copy, retention and tested recovery; no Git/cloud publication. |
| Low/Medium | VERIFIED: generic response errors are used but server code logs error objects and audit descriptions can include personal data. UNKNOWN operational retention/access. | Structured redacted logs, restricted access, audit retention policy and tamper resistance. |

**VERIFIED upload defenses:** extension AND MIME filtering, PDF magic check (`publicApplications.js:26-50`), random disk names, authenticated role-protected downloads, resolved path containment, attachment disposition and sandbox CSP (`publicApplications.js:397-424`). PDF header checking is not full content safety validation. Security headers include CSP, HSTS, nosniff and frame restrictions (`server/security.js`). A static Cloudflare deployment must configure equivalent frontend headers separately.

**VERIFIED authorization:** privileged writes are role-gated. Customer/loan/application reads and several reports use requireAuth without narrower roles. **UNKNOWN:** Whether that broad staff access matches the organization's intended permissions. Agree an access matrix and test API permissions independently of hidden UI navigation.

**UNKNOWN:** Dependency vulnerability status; no fresh advisory audit was performed. Pin/review supported package versions and scan the lockfile before release, especially spreadsheet/upload processing. No destructive security testing was run.

## 9. MySQL to PostgreSQL Compatibility

**VERIFIED requirements from schema/query inspection:**

| Existing construct | Required PostgreSQL work |
|---|---|
| mysql2 pool/execute, ? placeholders and @name-to-? helper | PostgreSQL driver and $1-style binds; adapt rows, insert IDs and affected-row result handling. |
| AUTO_INCREMENT integer primary keys | Identity/sequence columns; preserve imported IDs and advance sequences after import. |
| DOUBLE amounts/rates | NUMERIC with approved precision/scale, e.g. NUMERIC(20,2) for money and separately chosen rate scale; decimal arithmetic or explicitly approved integer currency units. Do not silently round existing records. |
| login_attempts.successful TINYINT | BOOLEAN with true/false binds, or consciously retained integer flag; current schema has no native ENUM columns. |
| status/role VARCHAR values | Preserve values initially; later CHECK/reference tables after inventory. Do not invent ENUM conversions. |
| DATETIME and dateStrings, local JS Date parsing | Establish source timezone, normalize instant timestamps to timestamptz; keep business DATE values as dates. Session expiration and quarter boundaries need Kigali/UTC tests. |
| Backticks, KEY/UNIQUE KEY, CREATE DATABASE charset clauses | PostgreSQL identifiers/index DDL and reviewed versioned migrations. |
| ON DUPLICATE KEY UPDATE / VALUES(value) | Explicit ON CONFLICT target and EXCLUDED values; settings/finance/db seeding are affected. |
| DATE_FORMAT(date,'%Y-%m') | to_char/date_trunc with equivalent grouping; dashboard.js:58 and finance.js:241-253. |
| CAST(... AS UNSIGNED), SUBSTRING suffix ID allocation | Compatible integer casts and atomic business-ID design. |
| Case-insensitive utf8mb4_unicode_ci matching/uniqueness | Define lower() unique indexes or suitable PostgreSQL collation/citext; test case/accent/email behavior. |
| withTransaction / FOR UPDATE | Preserve same checked-out connection, commit/rollback and row locks; test isolation, deadlocks and concurrent writes. |

**VERIFIED:** Approval, disbursement and repayment use transactions (`loanApplications.js:225`, `loans.js:81`, `repayments.js:60`); retain these invariants and transaction-scoped audits. Interest currently uses whole-unit Math.round and schedules round to two decimals (`loans.js:140,186`). Repayment closes within a 0.5-unit epsilon and normalizes balances (`repayments.js:73-76,123-132`). These are business behaviors requiring owner approval before numerical changes.

**INFERRED validation requirements:** Reconcile principal, interest, total payable, disbursements, paid amounts, outstanding balances, payment vs repayment registers, schedule totals, income/expense totals and quarter reports before/after migration. Check rounding residue, duplicate references, orphans and report formulas. Preserve original values and document any approved corrections separately; do not recompute historical loan terms automatically.

## 10. Cloudflare Deployment Readiness

**INFERRED frontend:** Static Vite dist output is suitable for Cloudflare Pages or Workers Static Assets. Configure npm build, dist output, SPA route fallback, headers and an explicit /api proxy. The existing Vercel rewrite is not automatically a Cloudflare configuration. Build success and browser/authentication behavior were not tested in this inspection.

**VERIFIED backend blockers:** Traditional app.listen bootstrap; database/schema/seed writes at startup; persistent local multer/filesystem uploads and filesystem downloads; hourly setInterval session/login cleanup; contact Map rate limiting and customer creation queue local to one process; MySQL-specific driver/SQL; synchronous bcrypt CPU work and potentially sizable financial/report responses. No native bcrypt module is used (bcryptjs is JavaScript); full transitive/native runtime compatibility is UNKNOWN. No custom WebSocket implementation found.

**INFERRED:** Workers is possible after a deliberate port, not unchanged deployment. Current Cloudflare Node HTTP compatibility supports adapting HTTP servers; node:fs exists but does not provide durable local uploaded-document storage. Move documents to private object storage, scheduled cleanup to Cron Triggers or another scheduler, concurrency controls to database/distributed primitives, and runtime bootstrap to a Worker handler. Measure request/CPU/memory constraints using actual uploads and reports. Do not promise compatibility based on Express alone.

Sources checked: [Cloudflare Node HTTP](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/), [Cloudflare filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/). Exact compatibility flags/date and limits must be fixed and tested when implementation begins.

**VERIFIED existing deployment hints:** vercel.json builds dist and rewrites /api to a Railway hostname; local start-free-adele.ps1 references PM2 resurrection and a Cloudflare quick tunnel to localhost:4000. These are configuration evidence only; active public deployments, DNS, Railway services and PM2 state were not verified. No Wrangler configuration was found. Git branch master, inspected commit a104c04; remotes origin and neworigin point to different GitHub repositories. No remote changes/pushes were made; choose the intended deployment repository before automation.

## 11. Supabase Migration Plan

**INFERRED recommendation:** Retain Express cookie authentication for the initial database move. Supabase PostgreSQL does not automatically replace the existing staff sessions with Supabase Auth. Keep database credentials server-side; never put them or service-role keys in VITE variables.

Create a separate staging Supabase project only after later explicit migration authorization. Design PostgreSQL schema and reviewed migrations; port SQL/driver in an isolated branch; load a protected staging snapshot with IDs/timestamps preserved; synchronize sequences; add verified constraints and indexes; migrate private documents and replace absolute disk paths with object keys; then run financial and authorization parity tests.

For a conventional persistent Node service choose direct PostgreSQL connectivity where network support permits, or the session pooler with deliberate pool limits and TLS certificate verification. Serverless transaction pooling has session/prepared-statement limitations; choose a driver configuration compatible with the selected mode. [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

Keep application tables in a non-exposed schema or carefully configure exposed schemas/RLS/grants; browser access to financial tables must not appear as an accidental consequence of creating tables. Retain backend role enforcement and use a narrowly privileged database role. User confirms Supabase project adele-loan-management in West EU (Ireland). No Supabase connection was made; project configuration, endpoint, PostgreSQL version, connectivity, backup tier and storage policy remain UNKNOWN.

## 12. Risks and Blockers

**VERIFIED:** Isolated local restore verification passed. **BLOCKED:** PostgreSQL SQL/driver implementation; financial precision specification and reconciliation; document storage design; PostgreSQL collation/timezone review; cloud runtime choice and staging acceptance. **VERIFIED risks:** startup modifies schema/data, privileged passwordless local account, missing foreign keys, multiple Git remotes, uncommitted work, local absolute document paths and process-local concurrency mechanisms. **UNKNOWN:** live production architecture, concurrent writes/DDL during dump, orphan data, financial aggregate parity, cloud account access, external backup policy and data retention obligations.

No claim is made that customer data, loan balances, or statements have already passed migration integrity checks. Table counts and dump structure do not prove financial correctness or recoverability.

## 13. Recommended Deployment Architecture

**INFERRED simplest path:** Cloudflare DNS/HTTPS and static frontend; a conventional supported Node host for Express; Supabase PostgreSQL; private Supabase Storage or Cloudflare R2 for documents. Keep a single browser origin by routing `/api/*` through a correctly configured reverse proxy to Express. Preserve Host/Origin handling, cookies, client IP trust and security headers; do not cache authenticated API responses or private files. Restrict direct backend ingress where feasible.

Retaining an appropriate existing Railway service may minimize change if its ownership, runtime, networking and costs are confirmed. Use a persistent volume only as a temporary alternative to object storage, with explicit backups. Consider Workers later as a separate runtime port after database/storage parity. GitHub CI should build/check and deploy staging with managed secrets before any approved production cutover; backups never enter Git.

## 14. Exact Next Steps

1. **Completed ? PASS:** Approved isolated restore into `adele_restore_test_20261019`; schema/indexes, all table counts and contents, financial aggregate parity and read-only integrity checks passed. Retain the test database until explicit deletion approval; original adele_lms was not modified by this work.
2. **Completed - PASS:** 21 files copied (19,609,342 bytes); all 7 referenced documents match metadata and checksums. Preserve 14 unreferenced files; review the protected manifest.
3. Establish authoritative production location, intended Git remote, current financial baseline, currency rounding rules and timezone assumptions.
4. With separate change authorization, harden database identity/password, password policy, ingress/IP trust and upload limits before public production release.
5. Choose conventional Node hosting and private object storage; prepare same-origin routing and secret management.
6. User confirms Supabase project adele-loan-management / West EU (Ireland). Obtain explicit execution/data-migration approval and confirm isolated staging destination, connection method and backup plan; no Supabase access has occurred.
7. Implement reviewed PostgreSQL schema/driver/query changes in an isolated branch; no live automatic bootstrap migrations.
8. Import into staging, preserve IDs, repair sequence positions, validate constraints, case behavior and decimal treatment without silent historical changes.
9. Validate exact financial totals, loan/schedule balances, reports and concurrent payments; test all roles, sessions, uploads and downloads through the proposed Cloudflare route.
10. Prepare rollback, final write-freeze/DDL-free export, document synchronization and reconciliation. Seek explicit production migration/deployment approval only after staging evidence is reviewable.

## 15. Information ChatGPT Needs

**VERIFIED:** Windows application path above; npm/ESM React 19.2.8/Vite 8.2.2 frontend and Express 5.2.1 Node backend, installed Node 24.14.1; mysql2 3.24.4 with raw prepared SQL; local XAMPP MariaDB 10.4.32 at localhost:3306, database adele_lms, 18 InnoDB tables, 454 snapshot records, no database-enforced foreign keys or stored objects. Cookie sessions live in MariaDB and roles are checked server-side. Financial columns are DOUBLE; uploads require persistent files. Successful SQL export is 72,368 bytes with checksum in section 6, successfully restored and VERIFIED for local MariaDB recovery with all 18 tables and 454 records matching. Documents are now copied and checksum-verified locally; see the preparation update below. Frontend is architecturally suitable for Cloudflare; backend is not ready unchanged for Workers or PostgreSQL. No Supabase project was created by this agent, and no Supabase connection, migration, deployment, Git push or business-code changes were performed. The user confirms project adele-loan-management in West EU (Ireland).

**Safest next action:** Review the PostgreSQL preparation package and resolve collation/timezone and backend-port gates before authorizing an isolated Supabase rehearsal. The local SQL restore and document-copy checks passed. Retain the test database and all originals.

### Migration preparation update - 19 October 2026

**VERIFIED:** Complete report reviewed. Local preparation package is `server/data/migration_preparation/20261019/`, covered by existing Git ignores and restricted to current Windows user/SYSTEM. PostgreSQL drafts were generated from live read-only schema metadata: **18 tables, 162 columns, 18 primary keys, 13 other unique indexes and 7 secondary indexes** (38 indexes / 43 index-column entries), with 16 identity columns. Static table/column/index coverage checks passed; no PostgreSQL parser/server execution occurred. All generated scripts are isolated here, not in production application code. See README.md, MIGRATION_PLAN.md, ROLLBACK_PLAN.md, BACKEND_QUERY_INVENTORY.md and CONNECTION_AND_RUNTIME.md.

**VERIFIED document backup - PASS:** `document_backup/files/` contains **21 files / 19,609,342 bytes**. Manifest `document_backup/manifest.json` includes original relative paths, document mapping, byte sizes and SHA-256; `manifest.sha256` protects the manifest. All 7 referenced documents exist, match stored sizes and have verified copies; **14 unreferenced files preserved**; no temporary files were identified/excluded. No source files were removed, renamed or overwritten. Rechecking every source/copy hash and all document references at completion passed. Per-file copying was nondisruptive and no write freeze was imposed; it is not a global atomic DB/filesystem snapshot. No private document contents/names are reproduced in this report. Restricted manifests contain the necessary private mappings. The original SQL backup checksum is unchanged. No restore-test database was deleted.

**VERIFIED new historical relationship finding:** Extended checks cover 24 relationships. **99 audit_logs rows reference deleted/nonexistent users.** These were outside the previous 26 core financial checks, which remain passed; this is not a failed restore or new data loss. All 99 rows/user_id values must remain intact. Base DDL preserves the source's absence of foreign keys. Optional scripts add 23 candidate foreign keys and validate separately; audit_logs.user_id stays a historical soft reference. NO ACTION deletion behavior is a new policy requiring approval and backend tests, not an existing MariaDB rule. Do not create fake users, null history or remove audit records.

**INFERRED schema choices requiring review:** Exact unconstrained NUMERIC avoids silent load-time scale rounding; canonical DOUBLE-to-decimal extraction/round-trip comparison and future money/rate scale still require approval. Numeric source profiles currently found no values beyond two decimal places. DATETIME maps to timestamp(0) without time zone to preserve current raw values. MariaDB reports system timezone **Africa/Johannesburg**, session SYSTEM; owner must confirm historical timestamp interpretation before conversion to UTC/timestamptz. 31 date/timestamp columns have no zero-date components, and the boolean candidate has no values outside 0/1. The draft ICU case/accent-insensitive collation is an approximation to utf8mb4_unicode_ci; six source equality expectations and a PostgreSQL read-only vector script were supplied. Trailing spaces, normalization, uniqueness and pattern search are explicit release gates. These choices have not modified any source values.

**VERIFIED artifacts:** 000 preflight; 010 private-schema DDL with RLS and no browser access; 020/021 optional foreign keys and validation; 022/023 optional financial CHECKs and validation; 030 identity reset; 040 counts/26 core checks/24 relationship checks; 041 private financial totals; 042 collation vectors; 050 backend-role access template. Backend inventory lists 107 source locations needing rewrite or compatibility review, including bind/result adaptation, DATE_FORMAT, unsigned casts/MAX+1, settings upserts, case/accent searches, boolean predicates, financial Number arithmetic and transaction/timezone behavior. No data exporter/importer was executed or production backend ported.

**INFERRED safe migration/rollback:** MIGRATION_PLAN.md requires a single approved snapshot, explicit decimal/date/boolean conversion, per-table counts/digests/cell comparisons and exact financial reconciliation, verified document-object mapping, staging access isolation, sequence repair and transaction/authorization testing. ROLLBACK_PLAN.md preserves MariaDB code/config/files and one writable authority. Before PostgreSQL accepts writes, reverting routing can use the intact source; after target-only writes, rollback requires a separately approved freeze and transaction-level reconciliation. No destructive rollback SQL or automated reverse synchronization is supplied.

**USER-CONFIRMED, NOT REMOTELY VERIFIED:** Supabase project **adele-loan-management**, **West EU (Ireland)**. For persistent Node/Express, use dashboard Direct connection with IPv6 (or IPv4 add-on); use Session pooler for IPv4-only hosting, normally port 5432. Enforce TLS hostname/certificate verification and bounded pooling. Transaction pooling is not the default for this server. No endpoint or credentials were requested/exposed and no remote connection was opened. See official [Supabase connections](https://supabase.com/docs/guides/database/connecting-to-postgres).

**INFERRED runtime decision:** Retain conventional Node hosting for initial backend port. Workers Static Assets can host the frontend, but existing Express needs persistent-upload replacement, scheduled/distributed coordination and handler/bootstrap changes before a safe Workers port. Cloudflare now has Node HTTP/Express compatibility; this does not provide durable local uploaded files. See [Node HTTP](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/) and [filesystem](https://developers.cloudflare.com/workers/runtime-apis/nodejs/fs/).

**Readiness:** Preparation/document protection **PASS**. Ready for package review and a separately approved schema rehearsal after target/collation decisions. **NOT YET READY for a complete controlled Supabase application/data test migration**: no executed PostgreSQL schema validation, approved timestamp/collation conversion, reviewed data importer, PostgreSQL backend port, private cloud-document storage or live financial/permission parity testing. Source database still has 18 tables / 454 records at preparation capture; no source database/financial values changed.

### Cloudflare/GitHub deployment review - 19 October 2026

See CLOUDFLARE_DEPLOYMENT_READINESS_REPORT.md. Both current worktree and actual committed a104c041e15c2a43691429a6e657c70e59e0fc88 frontend built successfully using installed dependencies. The isolated committed snapshot compiled 71 modules; current worktree compiled 97. GitHub origin master/HEAD was checked read-only and matches that commit. Repository-relative frontend root is adele-financing, build npm run build, output dist. Pages is the simplest static frontend setup; Workers Static Assets is also technically suitable with proper SPA configuration. Neither static setup implements the Vercel API rewrite. Same-origin API proxy and authenticated behavior need implementation/testing before full LMS deployment. Git history heuristic scan covered 21 reachable revisions and 258 text blobs: no committed .env, SQL backup or uploads paths found; current root test-doc.pdf is a 39-byte PDF fixture candidate; historical Home page.docx needs privacy review. Two seed-password literals in test scripts were flagged, not confirmed production secrets. This is not a clean-history certification: binary/large/unfetched objects and credential reuse were not fully audited. No Git push or Cloudflare deployment occurred. Frontend audit regenerated generated dist during a build invocation; application source/business logic was not edited.


### Security review correction - 19 October 2026

The deeper review in ADELE_CLOUDFLARE_FINAL_PREPARATION.md supersedes earlier Git-history warnings: Home page.docx is present only in local refs/codex bookkeeping trees, not master/origin-master committed history. Its content is site/application requirements, not populated customer records. test-doc.pdf is a 39-byte synthetic fixture. A committed temp-admin.mjs password matches one inactive local account (no active-account matches among inspected literals); historical JWT fallback exposure is conditional on deployed legacy use. No credentials were printed or rotated. Release security clearance remains FAIL pending the documented remediation and proxy/preview work.
