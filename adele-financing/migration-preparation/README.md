# Current clean setup ? supersedes historical imports

The owner confirmed MariaDB contains TEST DATA ONLY. Use clean_supabase/001_clean_setup.sql and clean_supabase/README.md for the fresh empty setup. Do not import the old 454 rows or run the older broad runtime grants/sequence initialization. Clean scripts were executed only in disposable local-memory PGlite validation; no Supabase or MariaDB connection occurred. Financial writes remain disabled.

## Earlier preparation notes (historical scope; not the current clean procedure)

﻿# Backend migration additions — preparation only

No SQL here was executed. The verified database snapshot and prepared load remain in the original protected package:
C:\Users\MBARAGA🥰🥰😍\Desktop\adele\adele-financing\server\data\migration_preparation\20261021_postgresql_review\EXECUTION_RUNBOOK.md

Keep that package's schema/data/exact row verification/financial reconciliation gates. The original package and runbook are unchanged.

060_business_reference_sequences.sql is NEW DDL for a future, separately approved staging rehearsal. Apply only AFTER the original schema and final snapshot load/identity resets, and BEFORE the reviewed 050 backend runtime-role grants. It creates seven independent sequences for customer/application/loan/repayment/payment/income/expense business IDs. Existing ID strings, primary keys, relationships and audit records are not updated. Invalid prefixes/non-numeric suffixes or an existing sequence cause failure; no destructive retry or automatic repair is supplied.

Initial values are MAX(current business suffix)+1. Deleted historical maxima cannot be recovered from the snapshot; after initialization, nextval avoids reuse of subsequently deleted IDs and is safe for concurrent allocation. Rolled-back attempts leave normal sequence gaps. The sequence DDL must be parser/runtime-tested on approved staging; this task ran no PostgreSQL server or SQL migration.

Use a separate non-owner backend login after grants/RLS policy review; migration ownership must never be used by the backend. Private schema must remain excluded from Supabase Data API exposure. Do not enable financial policy or search-review configuration until the business/staging checks documented in ADELE_POSTGRESQL_BACKEND_PATCH_REPORT.md pass. Document storage remains intentionally unavailable in PostgreSQL mode.
