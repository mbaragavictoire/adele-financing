# Private Railway backend role provisioning

Prepared 21 October 2026. Script: 004_railway_login_role.sql. Dedicated PostgreSQL LOGIN name: adele_railway. Supabase Session Pooler username, once provisioned: adele_railway.<PROJECT_REFERENCE>. The suffix is pooler routing metadata; do not create a database role with that suffix.

Status: static security review complete; NOT executed, parsed by a live engine, or verified against the hosted project. No database connection or Railway change was made. Existing 001 setup/local tests remain separate evidence; they do not constitute a test of 004.

## 1. Apply the credential-free script in SQL Editor

After separate approval for execution, confirm the intended Supabase project and that 001_clean_setup.sql has completed. Open SQL Editor > New query as the setup administrator, paste the entire 004_railway_login_role.sql and run it once. This script contains no password, verifier, placeholder to replace with a password, or credential-bearing URL.

A fresh adele_railway role is LOGIN INHERIT with PASSWORD NULL, CONNECTION LIMIT 5, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION and NOBYPASSRLS. Password authentication cannot work until step 2. An existing marked role retains its password unchanged; a rerun is not a password rotation. A new role grants no automatic access until its membership is established in the same transaction.

Only adele_backend membership is granted to the LOGIN; no direct schema/table/sequence privileges are granted to it. The group receives CONNECT to the current database. On PostgreSQL 16+, membership has INHERIT TRUE, ADMIN FALSE, SET FALSE. PostgreSQL 15 uses role-level INHERIT without ADMIN OPTION; it cannot forbid SET ROLE to the same restricted group, which confers no extra privileges. No role, object or credential is dropped/reset. Any failed assertion aborts the transaction, including new role/grant creation. If necessary issue ROLLBACK before investigating; do not weaken assertions to make the script run.

The script refuses an unmarked/conflicting existing role, extra outgoing memberships, ADMIN OPTION, role configuration overrides, direct/default object grants and owned objects. It checks the group cannot inherit other roles. It will refuse inherited CREATE on an application schema, including an unsafe PUBLIC grant; it does not revoke shared PUBLIC grants because that could affect other applications. Normal existing PUBLIC baseline privileges (such as database CONNECT/TEMP and built-in functions) are not newly granted or removed.

## 2. Provision a password privately, outside SQL Editor

SQL Editor has no reviewed private password-input mechanism in this package. Do NOT edit the SQL to add a password, paste ALTER ROLE ... PASSWORD into SQL Editor, generate/return a password using SELECT, or put a password in a command, URI, source file or report.

Use a trusted local interactive psql client and a password manager. This is a future manual credential step; nothing in the package performs it automatically. Confirm terminal recording, debug SQL tracing and session capture are disabled. Confirm the provider's password-DDL logging/redaction policy before proceeding: psql avoids plaintext logging, but PostgreSQL necessarily stores a SCRAM verifier and managed verifier/audit retention has not been inspected here. If that policy cannot be established, stop before password provisioning and use a provider-supported private credential workflow after review.

Connect as the setup administrator using the approved Session Pooler endpoint, strict TLS and the correct CA file. The following command contains placeholders only and prompts for the administrator password; do not put either password in command arguments or PGPASSWORD:

    psql -X --set=ON_ERROR_STOP=1 "host=<SESSION_POOLER_HOST> port=5432 dbname=postgres user=postgres.<PROJECT_REFERENCE> sslmode=verify-full sslrootcert=<ABSOLUTE_CA_FILE>" -W

Inside that private psql session, enter:

    \set ECHO none
    \set ECHO_HIDDEN off
    SET password_encryption = 'scram-sha-256';
    \password adele_railway
    \q

At the two hidden prompts, supply the same newly generated password from a password manager (at least 32 random characters). The psql client sends a SCRAM verifier rather than plaintext password SQL. Do not run this step on a rerun unless a separate password rotation is intended and approved. Do not query pg_authid.rolpassword or return the verifier. No generated secret belongs in project files, saved SQL snippets, screenshots, tickets or this report.

The administrator password and runtime password are distinct. Store the new runtime password privately; setting Railway PGPASSWORD is a separate, later approved operation and is not authorized by this preparation task. The PostgreSQL backend must never use the administrator login.

## 3. Review the built-in verification

The final result must show login_role=adele_railway, inherited_group=adele_backend, inheritance_verified=true, with financial writes denied. Assertions check effective permissions for BOTH roles, rather than assuming the grants are safe:

- Exactly the 18 ADELE tables and 23 sequences are present; all tables have the expected sole backend-only RLS policy.
- USAGE on adele_private and SELECT on all tables; no CREATE on application schemas or the current database; no owned objects.
- users, roles, sessions, login_attempts and revoked_tokens: INSERT/UPDATE/DELETE for authentication and session maintenance.
- audit_logs: SELECT/INSERT only; no UPDATE/DELETE.
- contact_messages: SELECT/INSERT/UPDATE only.
- All 11 financial/document tables: SELECT only. INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER are denied; column-level INSERT/UPDATE grants are checked too.
- USAGE/SELECT on users_id_seq, roles_id_seq, login_attempts_id_seq, audit_logs_id_seq and contact_messages_id_seq only. No sequence UPDATE and no access to financial identity sequences or seven business-reference sequences.
- No executable SECURITY DEFINER routine in the ADELE schema.

No authentication login, financial DML, sequence advancement or application-row query is performed by these assertions. Password validity and an actual TLS handshake are not tested. Future schema/grant changes require re-verification; this is not a continuous policy monitor. PostgreSQL administrators can still change grants, so administrator credentials must not be used by the backend.

Keep ADELE_PG_FINANCIAL_POLICY and ADELE_PG_SEARCH_REVIEWED unset. The script does not change Railway variables or enable financial calculations, search or document routes. It does not provision an ADELE application administrator; users/password_hash remains a separate application concern.

## Remaining blockers

Owner approval for remote execution; hosted PostgreSQL version and role-creation privileges; permission assertions on the actual project; private password provisioning with reviewed logging controls; trusted pooler CA/TLS validation; separately approved Railway configuration and backend login/integration testing. No commit, push or deployment has occurred.
