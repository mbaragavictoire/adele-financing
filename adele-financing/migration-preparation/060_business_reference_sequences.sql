-- PREPARATION ONLY; NOT EXECUTED. Apply only to approved staging after snapshot load.
-- New sequences for concurrency-safe business references; no source/history IDs changed.
BEGIN;
DO $refs$
DECLARE item record; bad bigint; next_number bigint;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('customers','customer_id','CUS'),('loan_applications','application_id','APP'),
    ('loans','loan_id','LON'),('repayments','repayment_id','RPT'),
    ('payments','payment_id','PAY'),('incomes','income_id','INC'),('expenses','expense_id','EXP')
  ) AS refs(tab,col,prefix) LOOP
    EXECUTE format('SELECT count(*) FROM adele_private.%I WHERE %I COLLATE "C" !~ %L',item.tab,item.col,'^'||item.prefix||'-[0-9]+$') INTO bad;
    IF bad<>0 THEN RAISE EXCEPTION 'Noncanonical business IDs in %',item.tab; END IF;
    EXECUTE format('SELECT COALESCE(MAX(substring(%I::text from 5)::bigint),0)+1 FROM adele_private.%I',item.col,item.tab) INTO next_number;
    EXECUTE format('CREATE SEQUENCE adele_private.%I AS bigint MAXVALUE 9999999999999999 START WITH %s','business_'||item.tab,next_number);
    -- Grant only to the separately reviewed backend role, never anon/authenticated/PUBLIC.
  END LOOP;
END $refs$;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA adele_private FROM PUBLIC;
COMMIT;
-- Apply the reviewed 050 runtime role grants after these sequences exist.
-- Sequence gaps after rolled-back allocations are intentional; do not reset to MAX on startup.
