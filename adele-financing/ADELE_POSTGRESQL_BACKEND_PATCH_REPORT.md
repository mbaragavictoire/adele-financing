> Integration update: see ADELE_DEPLOYMENT_INTEGRATION.md for the current combined branch, startup, exact variables and verification. The following source-patch report retains its original scope and historical limitations.

﻿# ADELE PostgreSQL backend compatibility patch

## Current update: clean Supabase setup, 21 October 2026

The owner confirmed all MariaDB records are test data. The current procedure intentionally imports NONE of the historical 454 rows. Earlier historical-preservation requirements below describe the earlier scope; they do not apply to this new empty setup. Original MariaDB data and backups remain unchanged.

PASS: prepared migration-preparation/clean_supabase/001_clean_setup.sql, 002_optional_synthetic_seed.sql, 003_verify_readonly.sql, schema-contract.json and README.md. The README gives the exact SQL Editor application order and hosted checks. All 18 tables/162 columns, 38 original indexes plus 21 FK-support indexes, 23 operational foreign keys, 23 checks, 16 identity columns and seven business sequences are included. Audit actor attribution remains an intentional soft relationship. No historical data or active credentials are included. Optional seed = 15 synthetic reference/demo rows; zero users, sessions, documents or financial transactions.

Financial DML remains disabled independently by the existing backend policy and the new NOLOGIN adele_backend privilege group's SELECT-only financial grants. All tables have backend-only RLS policies; browser/service roles have no private-schema privileges. Authentication DML/session storage is preserved, and audit records are append-only for the backend group. No login role or default staff password is created.

Actual verification: 38/38 combined tests PASS, including execution/re-execution of the delivered SQL with real PostgreSQL 18.6 semantics through in-memory PGlite 0.5.11 + ICU 0.1.0. Schema/seed repeatability, monetary constraints, role denial, authentication/session writes, sequence preservation and drift refusal passed. Targeted lint, production frontend build (71 modules) and diff whitespace checks passed. New dev dependencies and test:clean-schema script are local only. No hosted database was contacted.

Remaining blockers: hosted PostgreSQL/ICU/role privilege verification; secure restricted backend login and first-admin provisioning; explicit TLS/timezone configuration; PostgreSQL search review; application integration; financial formula/rounding/allocation approval before separately changing either financial gate. No history-conversion approval is needed because no historical rows are imported. Documents remain disabled. No remote SQL, original-worktree changes, commit, push or deployment occurred.

The next safe action is owner review of clean_supabase/README.md and the SQL, followed by manual SQL Editor application to the approved empty project when authorized. Never combine these scripts with the previous historical load or broad runtime grants.

## Earlier backend-patch report (previous scope)


Date: 21 October 2026, Africa/Kigali. Result: local implementation and synthetic checks PASS; database/application migration readiness BLOCKED pending the approvals and integration work below.

## Isolation and provenance

Branch: preparation/postgresql-backend-20261021
Git worktree: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\postgresql_backend_patch_20261021
Application directory: the adele-financing child of that worktree.
Base: a104c041e15c2a43691429a6e657c70e59e0fc88 (existing committed backend).

The existing dirty master frontend and Cloudflare security worktree were not overwritten or switched. Their uncommitted changes were not copied into this branch. All patch files remain local and uncommitted/unstaged. No original .env or customer files were copied. Existing migration artifacts/SQL backup were read only; no MariaDB/Supabase/other database connection, schema creation, migration, source data conversion, financial operation on a real database, credential rotation, commit, push or deployment was performed.

Reviewed the existing protected 20261021_postgresql_review/EXECUTION_RUNBOOK.md and its timestamp/precision/collation/audit/role constraints. Its historical snapshot is 18 tables / 454 rows, not a current live inventory. No private snapshot rows were loaded by the tests. The package/runbook were left unchanged; additional sequence DDL is supplied here for review only.

Dependencies installed only in this new worktree: pg 8.23.1 and decimal.js 10.6.0, pinned in package.json/package-lock.json. npm lifecycle scripts/audit were disabled during install. Package-registry download was used; no cloud database connection occurred. No dependency vulnerability clearance is claimed.

## Implemented database boundary

- server/db.mysql.js preserves the original MariaDB implementation (identical source after normalizing Git CRLF/LF checkout differences). It retains its original schema/seed/migration functions. They were not executed.
- server/db.js is now a driver facade: missing DB_DRIVER or mysql/mariadb selects MariaDB. PostgreSQL requires explicit postgres/postgresql opt-in; unknown values fail. Existing exported queryAll/queryOne/run/withTransaction and pool are retained.
- PostgreSQL initialization is separate and never invokes MariaDB DDL/seeding or creates a schema. It requires reviewed explicit PG connection parameters, a CA file with rejectUnauthorized:true, matching process/database timezone, a bounded pool and a dedicated non-owner/non-superuser/non-BYPASSRLS runtime role. Known privileged/browser role names and transaction-pooler port 6543 are refused. Startup checks role/schema metadata only, requiring the separately migrated 18-table private schema. The check is an initial guard, not complete column/index parity validation or project ownership attestation.
- PostgreSQL SQL compilation uses a lexer for placeholders, quoted identifiers, strings and comments. ?/@name values become bound $n arguments; missing/undefined/unused positional inputs fail. Backticks, known settings upserts, DATE_FORMAT(...,'%Y-%m') month buckets and successful=0/1 predicates are adapted. The application/business-ID OR lookup casts the numeric id to text to avoid invalid integer casts for APP-* references. Unsupported runtime DDL/multiple commands/unknown MySQL constructs fail instead of executing migrations.
- run returns rowCount as changes and INSERT ... RETURNING id as lastInsertRowid. Transactions use one checked-out client, BEGIN/COMMIT/ROLLBACK and release. Savepoints around serialized transaction writes allow existing uniqueness-retry loops to continue after PostgreSQL 23505, rather than operating in an aborted transaction. Outside-transaction writes can still use the pool concurrently.
- Uniqueness/format/constraint errors receive safe generic responses; PostgreSQL request logs avoid SQL/row details. Server-generated data remains bound, not interpolated into SQL. This is a bounded adapter for ADELE queries, not a complete MySQL-to-PostgreSQL SQL translator.
- Pool-local type parsers preserve NUMERIC/BIGINT/DATE/TIMESTAMP text without Number or automatic Date/UTC conversion. Existing wall-clock strings remain unchanged. No historical timestamps/relationships/audit rows are edited.
- Login throttling inserts PostgreSQL booleans while MariaDB retains 0/1. Existing cookie sessions, hashed identifiers, role lookup and auth middleware remain in place. This port does not switch users into Supabase Auth or enable session replay across deployments.

## Exact financial handling and proposed policy

Financial conversions/calculations in customers, applications, loans, repayments, finance summaries and reports use explicit money/arithmetic helpers. PostgreSQL financial values use decimal.js wrappers with string JSON/SQL serialization and prohibited implicit Number coercion. Safe integer JSON amounts are accepted exactly; fractional/unsafe JSON numbers are rejected because original decimal digits may already be lost by JSON parsing. Use plain decimal strings. Product/settings inputs are also validated against NaN/Infinity/unsafe numerical values.

The wrapper uses 512 significant-digit arithmetic with a conservative accepted domain of at most 100 significant digits and exponent magnitude 100. Supported addition/subtraction/multiplication within that bounded domain do not round to IEEE-754 values. Results outside the domain fail. Application-level division checks for a terminating decimal and rejects non-terminating results rather than inventing an allocation. PostgreSQL report ratios still use PostgreSQL NUMERIC division, whose finite precision/rounding needs accountant review and exact report reconciliation; fake report values are not evidence of that engine's ratio parity.

MariaDB helpers delegate to the original Number/parseFloat/native arithmetic and rounding behavior, preserving its API number types, native dates and legacy closing tolerance. This compatibility is tested at the helper/source level; no live MariaDB regression run was authorized or claimed.

PostgreSQL monetary writes, new business-reference allocation and ratio queries FAIL CLOSED unless ADELE_PG_FINANCIAL_POLICY is explicitly set to reviewed-exact-v1. No policy was enabled in any real environment. That string is a capability setting, not proof that a business owner has approved the policy; tests set it only around synthetic scenarios.

Proposed reviewed-exact-v1 choices, requiring business approval before real use:

1. Keep existing historical monetary tokens/NUMERIC values unchanged. Do not round or recompute old principal, interest, schedules, paid amounts or balances.
2. For NEW disbursements, proposed whole-franc interest preserves the existing Math.round tie direction; approval amount must match exactly in PostgreSQL (MariaDB retains its 0.01 comparison tolerance).
3. NEW PostgreSQL schedules accept totals with at most two decimal places and durations 1–120, distribute integer hundredths across installments and allocate residual hundredths to the earliest installments. Example: 100 over 3 becomes 33.34+33.33+33.33. Historical schedules are never rewritten. MariaDB retains its existing repeated rounding (33.33 three times).
4. PostgreSQL repayments use zero implicit closing tolerance and reject overpayment: no silent 0.5 RWF write-off, amount_paid fabrication or hidden adjustment. An exact closing payment reaches zero. MariaDB retains its current 0.5 tolerance. Decide whether approved write-offs/refunds/adjustment records are required instead.
5. New PostgreSQL date-only loan terms avoid timezone day shifts while retaining the existing native month-overflow convention. Decide whether month-end terms should instead clamp to month end. Raw historic timestamps are preserved; timezone interpretation remains an owner decision.

These proposals are implemented behind the disabled PostgreSQL policy gate for review, not adopted as historical conversion rules. Future amount/rate scale, rounding stage, allocation order, reporting precision, tolerance/write-off accounting and acceptable domain limits must be signed off before enabling writes.

## References, audit and storage

server/businessIds.js uses nextval-backed business IDs in PostgreSQL, retaining the old MariaDB allocation path. New 060_business_reference_sequences.sql initializes seven sequences after snapshot loading and before 050 runtime grants. It does not change existing primary/business identifiers or add foreign keys. Sequence gaps after failures are intentional; no MAX+1 recalculation runs at PostgreSQL startup.

All original relationships are retained. In particular, 99 historical audit_logs.user_id references to absent users remain soft references as documented in the migration package. No fake users, nulling, audit deletion or automatic financial repairs were introduced. The package's optional 23 foreign keys still require separate deletion-policy approval.

PostgreSQL public application submissions/uploads and file-download routes return 503 pending a private target-storage implementation. This prevents copied file_path metadata from causing the port to read original absolute customer-document paths. Metadata is not a file-byte migration. Original MariaDB document behavior remains selected in MariaDB mode. Synthetic tests created only an empty upload directory in this new worktree; no customer document was accessed, moved or deleted.

Search using LIKE/ILIKE returns 503 before database dispatch until ADELE_PG_SEARCH_REVIEWED=true. No automatic COLLATE C/ILIKE weakening was introduced. ICU/trailing-space/case/accent equivalence and target PostgreSQL-version support must be tested before that flag is set. Existing equality/unique collation choices remain part of the migration review, not certified by this adapter.

## Changed/new files

- package.json, package-lock.json: pg/decimal.js pins and test:postgres command.
- eslint.config.js: Node test scope and ignored local data artifacts.
- server/db.js; new db.mysql.js, databaseDriver.js, postgres/adapter.js, postgres/sql.js: driver boundary, connection/types/query/transaction logic.
- new server/money.js, dates.js, businessIds.js: exact arithmetic, calendar-safe PostgreSQL date handling and reference allocation.
- server/auth.js, rateLimit.js: PostgreSQL-safe errors and boolean writes.
- server/routes/customers.js, finance.js, loanApplications.js, loans.js, publicApplications.js, repayments.js, reports.js: exact financial call sites and business references; public document gate.
- server/routes/loanProducts.js, settings.js: strict PostgreSQL financial input boundaries with unchanged MariaDB path.
- postgres.env.example: empty configuration template, no credentials; not auto-loaded.
- migration-preparation/060_business_reference_sequences.sql and README.md: unexecuted migration addition/order.
- tests/postgres/core.test.mjs, routes.test.mjs, startup.test.mjs: synthetic-only tests.
- This report. Ignored node_modules/dist/development-tool scratch and empty test upload directory are local artifacts only.

## Actual verification

PASS: npm.cmd run test:postgres — 26 tests / 0 failures, Node 24.14.1. Node's experimental module-mocking flag is required; its warning is expected. All database/pool calls are fakes. HTTP tests bind only an ephemeral 127.0.0.1 port and use generated in-memory session identifiers with synthetic users/loan amounts. No production account, database, document or service is contacted.

Tests cover driver default/source equivalence, lexer isolation, bind validation, known query rewrites, decimal precision and unsafe input rejection, policy gating, installment reconciliation, original MariaDB helper behavior, one-client transactions/rollback/release/savepoints, row/error mapping, TLS/timezone configuration rejection, raw type parsers, calendar dates, real session/role middleware with a fake DB, exact route-level repayments/disbursement/report values, simulated late-failure rollback, exact settlement, disabled document access, and metadata-only PostgreSQL initialization with a mocked pg module. Fake transactions/role checks/TLS options are NOT real database transactions, RLS grants, schema validation or TLS handshakes.

PASS: targeted ESLint over changed server modules/routes and tests/postgres, using installed local ESLint. PASS: npm.cmd run build, Vite 8.2.2, 71 modules, unchanged committed frontend baseline in this branch. PASS: git diff --check (ordinary LF/CRLF notices only). No server startup/import-all command or real database verification scripts were run; scripts/check-server-imports.mjs imports server/index.js and would start the application, so it was deliberately not used.

An initial source-equivalence test compared CRLF checkout bytes to an LF Git blob and failed. It now compares normalized-source hashes, not a huge source dump; final source check passes. No MariaDB logic was edited in the retained implementation. Intermediate converter-edit/parser issues from the earlier migration preparation remain separate historical work, not rerun here.

## Remaining blockers / next safe step

1. Review/approve historical DOUBLE-to-NUMERIC representation and currency/rate/reporting policy. The offline package keeps dump tokens; this task did not convert or recalculate any real amounts. Do not enable reviewed-exact-v1 as a substitute for business sign-off.
2. Confirm timestamp interpretation and pin matching TZ/PG_TIME_ZONE. Validate defaults, expiry, quarter boundaries and native month-end convention using approved staging.
3. Resolve ICU equality/uniqueness/trailing-space/search semantics and PostgreSQL version. Search stays disabled until independently tested/reviewed.
4. Review/apply the existing migration package plus new sequence DDL and least-privilege runtime grants ONLY under separate execution approval. Verify every column/index/relationship/count/financial cell and audit baseline in real PostgreSQL. Runtime startup's count check is not that verification.
5. Implement/test private document storage and mapping before enabling PostgreSQL public submissions/downloads. Keep all original SQL/document backups and MariaDB operational.
6. Update/test frontend financial input/output contract to preserve decimal strings, especially fractional amounts, spreadsheets, exports and browser-side totals. This backend branch intentionally does not change the user's frontend. Reconcile PostgreSQL NUMERIC ratio reports against the original business definitions.
7. Real PostgreSQL syntax/driver/constraint/RLS/concurrency/TLS integration tests and end-to-end MariaDB regression were not run under the current restrictions. Current tests prove code paths against synthetic doubles only. Existing security/credential remediation and Cloudflare proxy work are separate and are NOT merged into this branch; do not expose this backend publicly.
8. Staging identity/endpoint/CA/runtime role ownership and network restrictions require review; no endpoint/credential was requested or connected here. Do not use the migration-owner account in the backend. Standard application startup/housekeeping may write session/login state once separately authorized; do not casually run npm start/dev in this preparation worktree.

Exact next safe action: review this local patch and the proposed accounting/date/search decisions. Then scope a separately approved isolated PostgreSQL integration rehearsal using synthetic fixtures and a dedicated target. A real snapshot load, financial-data conversion, commit, push or deployment requires separate approval. Existing MariaDB remains the unchanged operational authority.

## Primary documentation used

- https://node-postgres.com/features/types
- https://node-postgres.com/features/transactions
- https://node-postgres.com/features/ssl
- https://mikemcl.github.io/decimal.js/

These support driver/parser/transaction/TLS and decimal API choices; implementation/test results above were observed locally.

## Dedicated Railway LOGIN preparation (21 October 2026)

Added clean_supabase/004_railway_login_role.sql and RAILWAY_LOGIN_PROVISIONING.md. Credential-free SQL Editor script provisions adele_railway LOGIN INHERIT, PASSWORD NULL on first creation only, with membership solely in adele_backend and no ADMIN OPTION. PostgreSQL 16+ also disables SET for that membership. Reruns preserve credentials and reject unexpected role attributes, memberships, ownership, ACLs and effective privileges. Authentication identity grants and financial/column/sequence denial are asserted before commit. Private password provisioning uses a separately approved interactive psql SCRAM password prompt, never saved SQL. Provider password-DDL logging policy remains to be confirmed. No SQL from this new script was executed or engine-parsed, and no service was contacted. The prior 38-test result applies to the prior setup/backend package, not a runtime validation of this role script.
