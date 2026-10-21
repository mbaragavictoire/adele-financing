-- ADELE Railway runtime LOGIN provisioning. Review in Supabase SQL Editor; no credentials.
-- Run AFTER 001_clean_setup.sql. No data migration, password rotation or financial grants.
-- New roles have PASSWORD NULL and cannot use password authentication until privately provisioned.
-- Reruns preserve existing passwords; unsafe role/ACL drift aborts rather than repairing silently.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(16428,20261021);
DO $provision$
DECLARE backend_oid oid; runtime_oid oid; r record; object_record record; p record;
 table_names text[]:=ARRAY['application_documents','audit_logs','contact_messages','customers','expenses','incomes','loan_applications','loan_products','loans','login_attempts','payments','repayment_schedules','repayments','revoked_tokens','roles','sessions','settings','users'];
 auth_tables text[]:=ARRAY['users','roles','sessions','login_attempts','revoked_tokens'];
 identity_names text[]:=ARRAY['users_id_seq','roles_id_seq','login_attempts_id_seq','audit_logs_id_seq','contact_messages_id_seq'];
 role_name text; operation text; expected boolean; actual boolean;
 marker constant text:='ADELE Railway restricted runtime v1';
BEGIN
 IF obj_description(to_regnamespace('adele_private'),'pg_namespace') IS DISTINCT FROM 'ADELE clean setup v1: empty start, no historical import' THEN
  RAISE EXCEPTION 'Expected the reviewed clean ADELE schema. Apply 001 first; do not bypass this guard.';
 END IF;
 SELECT * INTO r FROM pg_roles WHERE rolname='adele_backend';
 IF NOT FOUND THEN RAISE EXCEPTION 'Required adele_backend group is missing'; END IF;
 backend_oid:=r.oid;
 IF r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR NOT r.rolinherit
    OR shobj_description(r.oid,'pg_authid') IS DISTINCT FROM 'ADELE clean setup backend privilege group v1' THEN
  RAISE EXCEPTION 'Unexpected adele_backend attributes or provenance';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=backend_oid) THEN
  RAISE EXCEPTION 'adele_backend must not inherit another role';
 END IF;
 SELECT * INTO r FROM pg_roles WHERE rolname='adele_railway';
 IF NOT FOUND THEN
  CREATE ROLE adele_railway LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 5 PASSWORD NULL;
  COMMENT ON ROLE adele_railway IS 'ADELE Railway restricted runtime v1';
 ELSE
  IF shobj_description(r.oid,'pg_authid') IS DISTINCT FROM marker OR NOT r.rolcanlogin OR NOT r.rolinherit
     OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolconnlimit<>5 THEN
   RAISE EXCEPTION 'Existing adele_railway is not this restricted runtime; no attributes or password were changed';
  END IF;
 END IF;
 SELECT oid INTO runtime_oid FROM pg_roles WHERE rolname='adele_railway';
 -- Reject ownership anywhere in the cluster (shared ownership dependencies), not only this schema.
 IF EXISTS(SELECT 1 FROM pg_shdepend WHERE refclassid='pg_authid'::regclass AND refobjid IN (runtime_oid,backend_oid) AND deptype='o') THEN
  RAISE EXCEPTION 'Runtime/group must not own database objects';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_auth_members WHERE member=runtime_oid AND (roleid<>backend_oid OR admin_option)) THEN
  RAISE EXCEPTION 'Runtime has unexpected membership or ADMIN OPTION';
 END IF;
 -- No direct object ACLs or default grants for the LOGIN. All ADELE permissions come from the group.
 IF EXISTS(SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) a WHERE a.grantee=runtime_oid)
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE a.grantee=runtime_oid)
 OR EXISTS(SELECT 1 FROM pg_attribute c CROSS JOIN LATERAL aclexplode(c.attacl) a WHERE a.grantee=runtime_oid)
 OR EXISTS(SELECT 1 FROM pg_proc f CROSS JOIN LATERAL aclexplode(f.proacl) a WHERE a.grantee=runtime_oid)
 OR EXISTS(SELECT 1 FROM pg_database d CROSS JOIN LATERAL aclexplode(d.datacl) a WHERE a.grantee=runtime_oid)
 OR EXISTS(SELECT 1 FROM pg_default_acl d WHERE d.defaclrole=runtime_oid OR EXISTS(SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee=runtime_oid)) THEN
  RAISE EXCEPTION 'Runtime has direct/default object grants; review rather than silently revoke';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_db_role_setting WHERE setrole=runtime_oid) THEN
  RAISE EXCEPTION 'Runtime has unexpected role settings; connection settings belong in the reviewed backend configuration';
 END IF;
 IF current_setting('server_version_num')::integer>=160000 THEN
  IF EXISTS(SELECT 1 FROM pg_auth_members m WHERE member=runtime_oid AND roleid=backend_oid AND
    (NOT COALESCE((to_jsonb(m)->>'inherit_option')::boolean,true) OR COALESCE((to_jsonb(m)->>'set_option')::boolean,false))) THEN
   RAISE EXCEPTION 'Existing membership has unexpected INHERIT/SET options';
  END IF;
  EXECUTE 'GRANT adele_backend TO adele_railway WITH ADMIN FALSE, INHERIT TRUE, SET FALSE';
 ELSE
  -- PostgreSQL 15 has no per-membership SET/INHERIT options. SET ROLE can only select the same restricted group.
  GRANT adele_backend TO adele_railway;
 END IF;
 EXECUTE format('GRANT CONNECT ON DATABASE %I TO adele_backend',current_database());
 IF (SELECT count(*) FROM pg_auth_members WHERE member=runtime_oid)<>1
    OR NOT pg_has_role('adele_railway','adele_backend','USAGE') THEN
  RAISE EXCEPTION 'Exactly one automatically inherited non-admin membership is required';
 END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind IN ('r','p'))<>18
 OR EXISTS(SELECT 1 FROM unnest(table_names) t WHERE to_regclass('adele_private.'||t) IS NULL) THEN
  RAISE EXCEPTION 'Expected exactly the 18 ADELE tables';
 END IF;
 IF (SELECT count(*) FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='S')<>23 THEN
  RAISE EXCEPTION 'Expected 16 identity and 7 business sequences';
 END IF;
 -- Check effective permissions for BOTH group and LOGIN, including inherited PUBLIC privileges.
 FOREACH role_name IN ARRAY ARRAY['adele_backend','adele_railway'] LOOP
  IF NOT has_database_privilege(role_name,current_database(),'CONNECT')
     OR has_database_privilege(role_name,current_database(),'CREATE')
     OR NOT has_schema_privilege(role_name,'adele_private','USAGE') THEN
   RAISE EXCEPTION 'Unexpected database/schema permissions for %',role_name;
  END IF;
  IF EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND has_schema_privilege(role_name,n.oid,'CREATE')) THEN
   RAISE EXCEPTION 'Role % can CREATE in an application schema (possibly via PUBLIC); review separately',role_name;
  END IF;
  FOR object_record IN SELECT oid,relname,relrowsecurity FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='r' LOOP
   IF NOT object_record.relrowsecurity THEN RAISE EXCEPTION 'RLS disabled on %',object_record.relname; END IF;
   SELECT * INTO p FROM pg_policy WHERE polrelid=object_record.oid AND polname='adele_backend_access';
   IF NOT FOUND THEN RAISE EXCEPTION 'Backend RLS policy missing on %',object_record.relname; END IF;
   IF p.polcmd<>'*' OR NOT p.polpermissive OR p.polroles<>ARRAY[backend_oid]
      OR pg_get_expr(p.polqual,p.polrelid)<>'true' OR pg_get_expr(p.polwithcheck,p.polrelid)<>'true'
      OR (SELECT count(*) FROM pg_policy WHERE polrelid=object_record.oid)<>1 THEN
    RAISE EXCEPTION 'Unexpected RLS policy on %',object_record.relname;
   END IF;
   FOREACH operation IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    expected:=operation='SELECT'
      OR (object_record.relname=ANY(auth_tables) AND operation=ANY(ARRAY['INSERT','UPDATE','DELETE']))
      OR (object_record.relname='audit_logs' AND operation='INSERT')
      OR (object_record.relname='contact_messages' AND operation=ANY(ARRAY['INSERT','UPDATE']));
    actual:=has_table_privilege(role_name,object_record.oid,operation);
    IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected % on % for %',operation,object_record.relname,role_name; END IF;
    IF operation=ANY(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) THEN
     IF has_any_column_privilege(role_name,object_record.oid,operation) IS DISTINCT FROM expected THEN
      RAISE EXCEPTION 'Unexpected column-level % on % for %',operation,object_record.relname,role_name;
     END IF;
    END IF;
   END LOOP;
  END LOOP;
  FOR object_record IN SELECT oid,relname FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='S' LOOP
   FOREACH operation IN ARRAY ARRAY['USAGE','SELECT','UPDATE'] LOOP
    expected:=object_record.relname=ANY(identity_names) AND operation=ANY(ARRAY['USAGE','SELECT']);
    IF has_sequence_privilege(role_name,object_record.oid,operation) IS DISTINCT FROM expected THEN
     RAISE EXCEPTION 'Unexpected sequence % on % for %',operation,object_record.relname,role_name;
    END IF;
   END LOOP;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_proc f WHERE f.pronamespace='adele_private'::regnamespace AND f.prosecdef AND has_function_privilege(role_name,f.oid,'EXECUTE')) THEN
   RAISE EXCEPTION 'Unexpected executable SECURITY DEFINER routine in ADELE schema';
  END IF;
 END LOOP;
END $provision$;
COMMIT;
-- Safe status only. Never query or display pg_authid.rolpassword or a connection URI.
SELECT 'adele_railway' AS login_role,'adele_backend' AS inherited_group,
 pg_has_role('adele_railway','adele_backend','USAGE') AS inheritance_verified,
 'Financial writes denied; password provisioning is separate; existing passwords unchanged' AS status;
