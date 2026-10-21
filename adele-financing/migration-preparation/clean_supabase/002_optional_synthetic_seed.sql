-- OPTIONAL synthetic fixtures only. No users, passwords, sessions, documents or financial transactions.
-- Run as setup owner after 001. Existing fixture collisions abort rather than overwrite.
BEGIN;
SET LOCAL search_path=pg_catalog;
SELECT pg_advisory_xact_lock(16428,20261021);
DO $seed$
BEGIN
 IF obj_description(to_regnamespace('adele_private'),'pg_namespace') IS DISTINCT FROM 'ADELE clean setup v1: empty start, no historical import' THEN RAISE EXCEPTION 'Apply clean setup first'; END IF;
 IF EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='super_admin' AND NOT(to_jsonb(t) @> '{"name":"super_admin","description":"Synthetic sandbox role"}'::jsonb)) OR (SELECT count(*) FROM adele_private.roles t WHERE t."name"='super_admin')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: roles.name'; END IF;
 INSERT INTO adele_private.roles ("name","description") SELECT 'super_admin','Synthetic sandbox role' WHERE NOT EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='super_admin');
 IF EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='loan_officer' AND NOT(to_jsonb(t) @> '{"name":"loan_officer","description":"Synthetic sandbox role"}'::jsonb)) OR (SELECT count(*) FROM adele_private.roles t WHERE t."name"='loan_officer')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: roles.name'; END IF;
 INSERT INTO adele_private.roles ("name","description") SELECT 'loan_officer','Synthetic sandbox role' WHERE NOT EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='loan_officer');
 IF EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='finance_officer' AND NOT(to_jsonb(t) @> '{"name":"finance_officer","description":"Synthetic sandbox role"}'::jsonb)) OR (SELECT count(*) FROM adele_private.roles t WHERE t."name"='finance_officer')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: roles.name'; END IF;
 INSERT INTO adele_private.roles ("name","description") SELECT 'finance_officer','Synthetic sandbox role' WHERE NOT EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='finance_officer');
 IF EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='manager' AND NOT(to_jsonb(t) @> '{"name":"manager","description":"Synthetic sandbox role"}'::jsonb)) OR (SELECT count(*) FROM adele_private.roles t WHERE t."name"='manager')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: roles.name'; END IF;
 INSERT INTO adele_private.roles ("name","description") SELECT 'manager','Synthetic sandbox role' WHERE NOT EXISTS(SELECT 1 FROM adele_private.roles t WHERE t."name"='manager');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_name' AND NOT(to_jsonb(t) @> '{"key":"company_name","value":"ADELE Synthetic Sandbox"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='company_name')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'company_name','ADELE Synthetic Sandbox' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_name');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_email' AND NOT(to_jsonb(t) @> '{"key":"company_email","value":"sandbox@example.invalid"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='company_email')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'company_email','sandbox@example.invalid' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_email');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_phone' AND NOT(to_jsonb(t) @> '{"key":"company_phone","value":"SYNTHETIC-ONLY"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='company_phone')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'company_phone','SYNTHETIC-ONLY' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_phone');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_address' AND NOT(to_jsonb(t) @> '{"key":"company_address","value":"Synthetic test environment"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='company_address')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'company_address','Synthetic test environment' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='company_address');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='opening_cash' AND NOT(to_jsonb(t) @> '{"key":"opening_cash","value":"0"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='opening_cash')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'opening_cash','0' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='opening_cash');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='equipment_value' AND NOT(to_jsonb(t) @> '{"key":"equipment_value","value":"0"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='equipment_value')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'equipment_value','0' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='equipment_value');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='owner_capital' AND NOT(to_jsonb(t) @> '{"key":"owner_capital","value":"0"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='owner_capital')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'owner_capital','0' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='owner_capital');
 IF EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='liabilities_value' AND NOT(to_jsonb(t) @> '{"key":"liabilities_value","value":"0"}'::jsonb)) OR (SELECT count(*) FROM adele_private.settings t WHERE t."key"='liabilities_value')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: settings.key'; END IF;
 INSERT INTO adele_private.settings ("key","value") SELECT 'liabilities_value','0' WHERE NOT EXISTS(SELECT 1 FROM adele_private.settings t WHERE t."key"='liabilities_value');
 IF EXISTS(SELECT 1 FROM adele_private.loan_products t WHERE t."name"='Synthetic preview product' AND NOT(to_jsonb(t) @> '{"name":"Synthetic preview product","description":"SYNTHETIC ONLY; financial writes disabled","min_amount":100,"max_amount":10000,"interest_rate":0,"max_duration":6,"repayment_frequency":"Monthly","status":"active","created_at":"2026-10-21T00:00:00"}'::jsonb)) OR (SELECT count(*) FROM adele_private.loan_products t WHERE t."name"='Synthetic preview product')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: loan_products.name'; END IF;
 INSERT INTO adele_private.loan_products ("name","description","min_amount","max_amount","interest_rate","max_duration","repayment_frequency","status","created_at") SELECT 'Synthetic preview product','SYNTHETIC ONLY; financial writes disabled',100,10000,0,6,'Monthly','active','2026-10-21T00:00:00' WHERE NOT EXISTS(SELECT 1 FROM adele_private.loan_products t WHERE t."name"='Synthetic preview product');
 IF EXISTS(SELECT 1 FROM adele_private.customers t WHERE t."customer_id"='CUS-90001' AND NOT(to_jsonb(t) @> '{"customer_id":"CUS-90001","full_name":"Synthetic Borrower","phone_number":"SYNTHETIC-ONLY","gender":"","email":"synthetic-borrower@example.invalid","status":"active","registration_date":"2026-10-21","amount":1000,"duration":3}'::jsonb)) OR (SELECT count(*) FROM adele_private.customers t WHERE t."customer_id"='CUS-90001')>1 THEN RAISE EXCEPTION 'Synthetic fixture collision: customers.customer_id'; END IF;
 INSERT INTO adele_private.customers ("customer_id","full_name","phone_number","gender","email","status","registration_date","amount","duration") SELECT 'CUS-90001','Synthetic Borrower','SYNTHETIC-ONLY','','synthetic-borrower@example.invalid','active','2026-10-21',1000,3 WHERE NOT EXISTS(SELECT 1 FROM adele_private.customers t WHERE t."customer_id"='CUS-90001');
 IF EXISTS(SELECT 1 FROM adele_private.loan_applications a WHERE application_id='APP-90001' AND (customer_id IS DISTINCT FROM (SELECT id FROM adele_private.customers WHERE customer_id='CUS-90001') OR loan_product_id IS DISTINCT FROM (SELECT id FROM adele_private.loan_products WHERE name='Synthetic preview product') OR requested_amount<>1000 OR duration<>3 OR status<>'pending' OR approved_by IS NOT NULL OR approved_amount IS NOT NULL)) THEN RAISE EXCEPTION 'Synthetic application fixture collision'; END IF;
 INSERT INTO adele_private.loan_applications(application_id,customer_id,loan_product_id,requested_amount,duration,purpose,application_date,status,created_at) SELECT 'APP-90001',(SELECT id FROM adele_private.customers WHERE customer_id='CUS-90001'),id,1000,3,'SYNTHETIC ONLY; no approval or disbursement','2026-10-21','pending','2026-10-21 00:00:00' FROM adele_private.loan_products WHERE name='Synthetic preview product' AND NOT EXISTS(SELECT 1 FROM adele_private.loan_applications WHERE application_id='APP-90001');
END $seed$;
-- Only advance fixture business sequences; never rewind or reset a previously used sequence.
DO $sequences$
DECLARE t text; current_next bigint;
BEGIN
 FOREACH t IN ARRAY ARRAY['customers','loan_applications'] LOOP
  EXECUTE format('SELECT last_value+CASE WHEN is_called THEN 1 ELSE 0 END FROM adele_private.business_%I',t) INTO current_next;
  IF current_next<90002 THEN PERFORM setval(('adele_private.business_'||t)::regclass,90002,false); END IF;
 END LOOP;
END $sequences$;
COMMIT;
SELECT '15 synthetic reference/demo rows; no credentials or financial transactions' AS status;
