import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {icuDataDir} from '@electric-sql/pglite-icu-full';
const root=new URL('../../migration-preparation/clean_supabase/',import.meta.url);
const setup=await readFile(new URL('001_clean_setup.sql',root),'utf8');
const seed=await readFile(new URL('002_optional_synthetic_seed.sql',root),'utf8');
const verify=await readFile(new URL('003_verify_readonly.sql',root),'utf8');
const contract=JSON.parse(await readFile(new URL('schema-contract.json',root),'utf8'));
test('clean setup executes locally with ICU, isolation and repeatability',async t=>{
 const db=await PGlite.create({icuDataDir:await icuDataDir()});
 const scalar=async sql=>(await db.query(sql)).rows[0].n;
 const counts=async()=>Object.fromEntries(await Promise.all(contract.tables.map(async name=>[name,await scalar('SELECT count(*)::integer AS n FROM adele_private.'+name)])));
 const denied=async(sql,code)=>assert.rejects(db.exec(sql),e=>e.code===code);
 try{
  await db.exec('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;');
  await t.test('creates all 18 tables, 162 columns, 59 indexes, 23 validated FKs and 23 checks',async()=>{
   await db.exec(setup);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='r'"),18);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='adele_private'"),162);
   for(const [type,count] of [['p',18],['f',23],['c',23]])assert.equal(await scalar("SELECT count(*)::integer AS n FROM pg_constraint WHERE connamespace='adele_private'::regnamespace AND contype='"+type+"' AND convalidated"),count);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid WHERE t.relnamespace='adele_private'::regnamespace AND i.indisvalid"),59);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='r' AND relrowsecurity"),18);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='adele_private' AND is_identity='YES'"),16);
   assert.equal(await scalar("SELECT count(*)::integer AS n FROM pg_class WHERE relnamespace='adele_private'::regnamespace AND relkind='S' AND relname LIKE 'business_%'"),7);
  });
  await t.test('empty setup imports zero historical rows and is idempotent',async()=>{
   const before=await counts();assert.equal(Object.values(before).reduce((a,b)=>a+b,0),0);
   await db.exec(setup);assert.deepEqual(await counts(),before);
  });
  await t.test('optional seed repeats without changes, credentials or financial transactions',async()=>{
   await db.exec(seed);const before=await counts();assert.equal(Object.values(before).reduce((a,b)=>a+b,0),15);
   await db.exec(seed);assert.deepEqual(await counts(),before);
   for(const table of ['users','sessions','loans','repayment_schedules','payments','repayments','incomes','expenses','application_documents','audit_logs'])assert.equal(before[table],0);
   await db.exec(setup);assert.deepEqual(await counts(),before);
   assert.equal((await db.query('SELECT last_value::text,is_called FROM adele_private.business_customers')).rows[0].last_value,'90002');
   assert.equal((await db.query("SELECT nextval('adele_private.business_customers')::text AS n")).rows[0].n,'90002');
   await db.exec(setup);assert.equal((await db.query("SELECT nextval('adele_private.business_customers')::text AS n")).rows[0].n,'90003');
  });
  await t.test('foreign keys and finite exact money constraints reject invalid records',async()=>{
   await denied("INSERT INTO adele_private.loan_applications(application_id,customer_id,loan_product_id,requested_amount,duration,application_date) VALUES('APP-INVALID',2147483647,1,100,3,'2026-10-21')",'23503');
   for(const amount of ["'-1'","'NaN'","'Infinity'","'-Infinity'"])await denied('UPDATE adele_private.customers SET amount='+amount+" WHERE customer_id='CUS-90001'",'23514');
   await denied("INSERT INTO adele_private.loans(loan_id,customer_id,principal,interest,total_payable,outstanding_balance,start_date,due_date,duration) VALUES('LN-INVALID',(SELECT id FROM adele_private.customers WHERE customer_id='CUS-90001'),100,1,100,100,'2026-10-21','2026-11-21',1)",'23514');
   assert.equal((await db.query("SELECT (0.1::numeric+0.2::numeric)::text AS value")).rows[0].value,'0.3');
  });
  await t.test('browser and service roles cannot access the private schema',async()=>{
   for(const role of ['anon','authenticated','service_role']){
    assert.equal((await db.query("SELECT has_schema_privilege($1,'adele_private','USAGE') AS allowed",[role])).rows[0].allowed,false);
    await db.exec('SET ROLE '+role);try{await denied('SELECT * FROM adele_private.customers','42501');}finally{await db.exec('RESET ROLE');}
   }
  });
  await t.test('backend group cannot write any financial table or use business sequences',async()=>{
   await db.exec('SET ROLE adele_backend');try{
    for(const table of contract.financialTables){for(const op of ['INSERT','UPDATE','DELETE','TRUNCATE'])assert.equal((await db.query('SELECT has_table_privilege(current_user,$1,$2) AS allowed',['adele_private.'+table,op])).rows[0].allowed,false);await denied('DELETE FROM adele_private.'+table,'42501');}
    await denied("SELECT nextval('adele_private.business_loans')",'42501');
    assert.equal(await scalar('SELECT count(*)::integer AS n FROM adele_private.customers'),1);
   }finally{await db.exec('RESET ROLE');}
  });
  await t.test('authentication DML, hashed sessions and append-only audits remain functional',async()=>{
   await db.exec('BEGIN;SET LOCAL ROLE adele_backend');try{
    await db.exec("INSERT INTO adele_private.users(full_name,email,password_hash,role,status) VALUES('Synthetic inactive fixture','disabled@example.invalid','!disabled!','super_admin','inactive')");
    await db.exec("INSERT INTO adele_private.sessions(id,user_id,absolute_expires_at,idle_expires_at) SELECT repeat('a',64),id,'2026-10-22','2026-10-22' FROM adele_private.users WHERE email='disabled@example.invalid'");
    await db.exec("INSERT INTO adele_private.audit_logs(action,description) VALUES('synthetic-test','Local memory only')");
    assert.equal(await scalar('SELECT count(*)::integer AS n FROM adele_private.sessions'),1);
   }finally{await db.exec('ROLLBACK');}
   await db.exec('SET ROLE adele_backend');try{await denied("UPDATE adele_private.audit_logs SET action='changed'",'42501');await denied("INSERT INTO adele_private.sessions(id,user_id,absolute_expires_at,idle_expires_at) VALUES('not-a-session-hash',1,'2026-10-22','2026-10-22')",'23514');}finally{await db.exec('RESET ROLE');}
   assert.equal(await scalar('SELECT count(*)::integer AS n FROM adele_private.users'),0);
  });
  await t.test('read-only verification SQL executes',async()=>{await db.exec(verify);});
  await t.test('schema drift aborts rather than silently adopting changes',async()=>{
   await db.exec("ALTER TABLE adele_private.customers ALTER COLUMN status SET DEFAULT 'unexpected'");
   await assert.rejects(db.exec(setup),/contract differences/);await db.exec('ROLLBACK');
   await db.exec("ALTER TABLE adele_private.customers ALTER COLUMN status SET DEFAULT 'active'");await db.exec(setup);
  });
  await t.test('unmarked schemas and privileged backend roles are refused',async()=>{
   await db.exec("COMMENT ON SCHEMA adele_private IS 'unrelated setup'");
   await assert.rejects(db.exec(setup),/already exists outside this clean setup/);await db.exec('ROLLBACK');
   await db.exec("COMMENT ON SCHEMA adele_private IS 'ADELE clean setup v1: empty start, no historical import'");
   await db.exec('ALTER ROLE adele_backend LOGIN');
   await assert.rejects(db.exec(setup),/restricted non-login group/);await db.exec('ROLLBACK');
   await db.exec('ALTER ROLE adele_backend NOLOGIN');await db.exec(setup);
  });
  await t.test('seed collisions fail without overwriting existing rows',async()=>{
   await db.exec("UPDATE adele_private.customers SET full_name='Changed synthetic fixture' WHERE customer_id='CUS-90001'");
   await assert.rejects(db.exec(seed),/fixture collision/);await db.exec('ROLLBACK');
   assert.equal((await db.query("SELECT full_name FROM adele_private.customers WHERE customer_id='CUS-90001'")).rows[0].full_name,'Changed synthetic fixture');
  });
 }finally{await db.close();}
});
