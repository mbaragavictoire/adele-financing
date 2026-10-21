-- Read-only post-setup verification. No historical record-count baseline applies.
BEGIN READ ONLY;
SELECT 'application_documents' AS table_name,count(*) AS records FROM adele_private.application_documents
UNION ALL
SELECT 'audit_logs' AS table_name,count(*) AS records FROM adele_private.audit_logs
UNION ALL
SELECT 'contact_messages' AS table_name,count(*) AS records FROM adele_private.contact_messages
UNION ALL
SELECT 'customers' AS table_name,count(*) AS records FROM adele_private.customers
UNION ALL
SELECT 'expenses' AS table_name,count(*) AS records FROM adele_private.expenses
UNION ALL
SELECT 'incomes' AS table_name,count(*) AS records FROM adele_private.incomes
UNION ALL
SELECT 'loan_applications' AS table_name,count(*) AS records FROM adele_private.loan_applications
UNION ALL
SELECT 'loan_products' AS table_name,count(*) AS records FROM adele_private.loan_products
UNION ALL
SELECT 'loans' AS table_name,count(*) AS records FROM adele_private.loans
UNION ALL
SELECT 'login_attempts' AS table_name,count(*) AS records FROM adele_private.login_attempts
UNION ALL
SELECT 'payments' AS table_name,count(*) AS records FROM adele_private.payments
UNION ALL
SELECT 'repayment_schedules' AS table_name,count(*) AS records FROM adele_private.repayment_schedules
UNION ALL
SELECT 'repayments' AS table_name,count(*) AS records FROM adele_private.repayments
UNION ALL
SELECT 'revoked_tokens' AS table_name,count(*) AS records FROM adele_private.revoked_tokens
UNION ALL
SELECT 'roles' AS table_name,count(*) AS records FROM adele_private.roles
UNION ALL
SELECT 'sessions' AS table_name,count(*) AS records FROM adele_private.sessions
UNION ALL
SELECT 'settings' AS table_name,count(*) AS records FROM adele_private.settings
UNION ALL
SELECT 'users' AS table_name,count(*) AS records FROM adele_private.users;
SELECT count(*) AS tables,count(*) FILTER(WHERE relrowsecurity) AS rls_enabled FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='r';
SELECT contype,count(*) AS constraints,bool_and(convalidated) AS validated FROM pg_constraint WHERE connamespace='adele_private'::regnamespace GROUP BY contype ORDER BY contype;
SELECT count(*) AS indexes,bool_and(indisvalid AND indisready) AS valid FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid WHERE t.relnamespace='adele_private'::regnamespace;
SELECT rolname,rolcanlogin,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='adele_backend';
SELECT rolname,has_schema_privilege(rolname,'adele_private','USAGE') AS private_schema_access FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role');
SELECT t,has_table_privilege('adele_backend','adele_private.'||t,'SELECT') AS can_read,has_table_privilege('adele_backend','adele_private.'||t,'INSERT') OR has_table_privilege('adele_backend','adele_private.'||t,'UPDATE') OR has_table_privilege('adele_backend','adele_private.'||t,'DELETE') AS financial_writes FROM unnest(ARRAY['customers','loan_products','loan_applications','loans','repayment_schedules','repayments','payments','incomes','expenses','settings','application_documents']) t;
SELECT count(*) AS active_users FROM adele_private.users WHERE status='active';
SELECT count(*) AS sessions FROM adele_private.sessions;
COMMIT;
