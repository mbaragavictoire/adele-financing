# ADELE clean Supabase PostgreSQL setup

Prepared locally on 21 October 2026 in branch preparation/postgresql-backend-20261021. PASS for local schema preparation; hosted Supabase execution and application integration have not been performed.

The owner confirmed that MariaDB contains test data only. This package creates a fresh database structure and imports NONE of the historical 454 records. Earlier historical-import and reconciliation instructions are superseded for this clean setup. The original MariaDB database, backup and prior migration package are unchanged.

## Files and exact application order

1. 001_clean_setup.sql ? standalone, idempotent SQL Editor setup. Creates an empty private schema and security grants. Exact local path: C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\postgresql_backend_patch_20261021\adele-financing\migration-preparation\clean_supabase\001_clean_setup.sql
2. 002_optional_synthetic_seed.sql ? OPTIONAL 15 synthetic reference/demo rows. No existing MariaDB rows are read or imported.
3. 003_verify_readonly.sql ? read-only table counts, constraints, indexes, RLS and permission checks.
4. schema-contract.json ? schema metadata only, used by validation tests; not an import file.

No file contains a database connection string, password, API token, usable application account or historical record dump.

## Supabase SQL Editor instructions (manual future action)

These instructions do not authorize this agent to connect or execute remote SQL.

1. Open the intended Supabase project dashboard. Confirm the correct project reference and that this is the approved clean target. The previously named project is adele-loan-management; its current configuration has NOT been inspected remotely.
2. Open SQL Editor, choose New query, and select the project database administrator role (usually postgres). Paste the ENTIRE contents of 001_clean_setup.sql and run once. It includes BEGIN/COMMIT and requires schema, ICU collation, temporary-table and restricted-role creation privileges.
3. Expect the final status: ADELE clean schema ready; financial writes remain disabled. The script also validates its own schema definitions. An unrelated existing adele_private schema, conflicting backend role or incompatible drift aborts. Do not drop objects or change the guard to work around an error. If a session remains in an aborted transaction, execute ROLLBACK before investigating/retrying. No application tables are dropped or truncated.
4. Optionally create a separate query containing the ENTIRE 002_optional_synthetic_seed.sql and run as the same setup owner. Omit this step for a completely empty database. Existing conflicting fixtures cause an error, rather than overwriting rows.
5. Run 003_verify_readonly.sql in another query. Expect 18 tables, 18 RLS-enabled tables, 18 primary keys, 23 validated foreign keys, 23 validated CHECK constraints and 59 valid indexes. Expect adele_backend NOLOGIN/non-superuser/non-BYPASSRLS, browser/service roles with no private-schema USAGE, and financial_writes=false on every listed table. Active users and sessions must be zero. Record the query results before any application connection is approved.
6. In Table Editor, select schema adele_private to inspect tables; they are intentionally absent from public. Keep adele_private OUT of the exposed Data API schemas. Never connect a frontend directly to it or place database credentials in Vite variables.

Do not execute the older historical data-loading scripts, identity resets, 060_business_reference_sequences.sql or 050 runtime-grant templates alongside this setup. The clean setup already creates its sequences and deliberately narrower grants. Older broad write grants would undo the financial write restriction.

## Schema and authentication

All 18 original table names and 162 columns are retained: application_documents, audit_logs, contact_messages, customers, expenses, incomes, loan_applications, loan_products, loans, login_attempts, payments, repayment_schedules, repayments, revoked_tokens, roles, sessions, settings and users.

The 38 original indexes (18 primary and 20 other indexes) are retained; 21 supporting foreign-key indexes bring the total to 59. The 23 operational relationships are validated, DEFERRABLE INITIALLY IMMEDIATE with NO ACTION updates/deletes. The audit_logs.user_id attribution remains an intentional soft reference, preserving audit records when an actor is absent; user_name remains available. No cascading deletion of financial or audit data is introduced.

Sixteen identity columns and seven independent business-reference sequences replace AUTO_INCREMENT and unsafe MAX+1 allocation. Setup reruns do not reset sequences or modify application rows. An unmarked/older private schema is refused instead of adopted. Definition checks cover columns/defaults/identities/collations, indexes, operational foreign keys and CHECK constraints; this is a controlled rerun script, not an arbitrary schema-repair engine.

NUMERIC amounts are unconstrained exact decimals, with finite/nonnegative checks. No float conversion or automatic two-decimal rounding is introduced. New loan rows require exact principal+interest=total_payable and amount_paid+outstanding_balance=total_payable. Date-only columns remain DATE, and existing TIMESTAMP(0) WITHOUT TIME ZONE structures remain compatible with the patch. For a new empty environment, explicitly select a consistent backend/database timezone (UTC is recommended); do not allow implicit timezone guessing.

Private-schema ICU nondeterministic collation retains case/accent-insensitive equality and uniqueness. MySQL-specific queries use the existing bounded PostgreSQL adapter. LIKE/ILIKE search remains fail-closed unless its separate review flag is approved. Hosted PostgreSQL version/ICU support and equality/search behavior still require verification on the chosen target.

Express users/password_hash/roles, SHA-256-shaped session IDs, session expiry/revocation, login attempts and revoked tokens remain intact as structures. There is no automatic Supabase Auth conversion and no historical session import. The synthetic seed creates NO user or password hash. A secure first-admin bootstrap and separate restricted backend LOGIN must be prepared/approved later; there is no shared default login. The adele_backend role is only a NOLOGIN privilege group, not a usable credential. A future backend login must not own the schema, bypass RLS or inherit broad write privileges.

## Financial writes stay disabled

The existing PostgreSQL backend requires ADELE_PG_FINANCIAL_POLICY=reviewed-exact-v1 for financial writes; leave it unset. The SQL adds an independent permission boundary: adele_backend receives SELECT only on customers, loan_products, loan_applications, loans, repayment_schedules, repayments, payments, incomes, expenses, settings and application_documents. It receives no business-sequence privileges. Even setting the application flag would not grant financial DML through this group.

Authentication tables retain their required DML and identity-sequence grants; contact messages allow insert/update; audit logs allow insert/read but no update/delete. RLS is enabled on all tables with a backend-only policy. anon, authenticated, service_role and PUBLIC receive no access to this private application schema. Existing administrator/owner privileges are not a safe backend identity; an administrator could still write manually, so never use that role for the application.

Before enabling writes, approve currency and fractional-unit rules, interest formula/rate interpretation, rounding/allocation, payment allocation, early settlement, overdue handling, overpayment and closing tolerance. Test end-to-end transactions, rollback and concurrent writes against a separately approved PostgreSQL environment. Historical amount conversion decisions are no longer required because no history is imported. Keep document routes disabled until private storage and authorization are reviewed.

## Optional seed inventory

roles=4; settings=8; loan_products=1; customers=1; loan_applications=1. Every other table=0. Total=15.

Customer CUS-90001 and pending application APP-90001 are explicitly synthetic; their relationship uses numeric parent IDs. Emails use example.invalid and there are no uploaded documents, approved loans, disbursements, repayments, payments, income or expense transactions. Business sequences for those two fixtures advance to at least 90002 without rewinding existing allocations. PostgreSQL sequence advances are not transactional; an interrupted seed can leave harmless gaps. Do not run this optional demo seed after putting an environment into real use.

## Actual local validation

- npm run test:postgres: PASS, 38/38 tests (26 existing tests plus 12 clean-setup test nodes, including the parent).
- New SQL tests execute the delivered files in an in-memory PostgreSQL 18.6 engine, PGlite 0.5.11, with @electric-sql/pglite-icu-full 0.1.0. No database server, Supabase connection, Docker or Ubuntu was used.
- Covered: exact table/column/index/constraint/identity counts; empty initial tables; repeated setup and seed; preserved fixture rows and sequence positions; invalid FK/NaN/Infinity/negative/inconsistent money rejection; exact decimal arithmetic; browser/service-role denial; financial DML/business-sequence denial; authentication/session inserts; malformed session hash rejection; append-only audits; read-only verification; schema drift, unmarked schema, privileged role and fixture-collision refusal. Synthetic auth fixture rows exist only in a rolled-back local-memory transaction and contain no usable password.
- Targeted ESLint over the backend patch and PostgreSQL tests: PASS.
- npm run build: PASS, Vite 8.2.2, 71 modules.
- git diff --check: PASS, only existing checkout line-ending notices.

Rerun locally with npm run test:clean-schema or npm run test:postgres. The PGlite packages are development dependencies only. Local engine validation is not proof of hosted Supabase permissions, version compatibility, network/TLS configuration or full Express-to-hosted-PostgreSQL integration.

## Remaining blockers and next action

Clean SQL preparation is ready for owner review and manual application to an approved empty Supabase target. Hosted execution is not yet verified. Application operation still requires separately approved restricted backend login provisioning, secure first-admin bootstrap, explicit TLS/timezone settings, hosted collation/search checks and an application integration rehearsal. Financial writes and document routes stay blocked. No commit, push, deployment, remote execution or MariaDB changes were made.

Official references: [Supabase SQL Editor/table creation](https://supabase.com/docs/guides/database/tables), [private tables and RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [PGlite ICU support](https://pglite.dev/docs/localesupport).

## Dedicated backend LOGIN (separate manual step)

See 004_railway_login_role.sql and RAILWAY_LOGIN_PROVISIONING.md. The script provisions a passwordless LOGIN inheriting only adele_backend, checks effective privileges and preserves any existing password on reruns. Password provisioning is a separate private interactive psql step; never add a password to SQL Editor. Script 004 has been statically reviewed only and has NOT been executed, locally or remotely.
