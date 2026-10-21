import pg from 'pg'
import {createPostgresAdapter,postgresTypes} from '../server/postgres/adapter.js'
export function hyperdriveConfig(env){
 if(env.ADELE_WORKERS_DATABASE_REVIEWED!=='verify-full-no-cache' || !env.HYPERDRIVE?.connectionString)throw new Error('Reviewed Hyperdrive binding required')
 // This operator gate is NOT a cryptographic attestation of the remote Hyperdrive configuration.
 // Origin TLS verify-full, the proper CA and disabled caching must be independently audited.
 const url=new URL(env.HYPERDRIVE.connectionString)
 if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.username)!=='adele_railway'||url.search||url.hash)throw new Error('Unexpected Hyperdrive runtime role/options')
 return {connectionString:env.HYPERDRIVE.connectionString,types:postgresTypes(pg.types),connectionTimeoutMillis:10000,query_timeout:10000}
}
export async function openHyperdrive(env,Client=pg.Client){
 const client=new Client(hyperdriveConfig(env));let transaction=false
 try{
  await client.connect();await client.query('BEGIN');transaction=true
  await client.query("SET LOCAL search_path=adele_private,pg_catalog");await client.query("SET LOCAL TimeZone='UTC'");await client.query("SET LOCAL DateStyle='ISO,YMD'")
  const result=await client.query("SELECT current_user AS name,r.rolsuper,r.rolbypassrls,r.rolcreatedb,r.rolcreaterole,r.rolreplication,((SELECT count(*) FROM pg_auth_members m WHERE m.member=r.oid)=1 AND EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles g ON g.oid=m.roleid WHERE m.member=r.oid AND g.rolname='adele_backend' AND NOT m.admin_option) AND pg_has_role(r.oid,'adele_backend','USAGE')) AS membership_valid,pg_has_role(r.oid,n.nspowner,'MEMBER') AS owns_schema,(SELECT count(*)::integer FROM information_schema.tables WHERE table_schema='adele_private' AND table_type='BASE TABLE') AS tables FROM pg_roles r JOIN pg_namespace n ON n.nspname='adele_private' WHERE r.rolname=current_user")
  const role=result.rows[0];if(!role||role.name!=='adele_railway'||role.rolsuper||role.rolbypassrls||role.rolcreatedb||role.rolcreaterole||role.rolreplication||role.membership_valid!==true||role.owns_schema||role.tables!==18)throw new Error('Restricted ADELE database required')
  const denied=await client.query("SELECT bool_and(NOT has_table_privilege(current_user,'adele_private.'||t,'INSERT') AND NOT has_any_column_privilege(current_user,'adele_private.'||t,'INSERT') AND NOT has_table_privilege(current_user,'adele_private.'||t,'UPDATE') AND NOT has_any_column_privilege(current_user,'adele_private.'||t,'UPDATE') AND NOT has_table_privilege(current_user,'adele_private.'||t,'DELETE') AND NOT has_table_privilege(current_user,'adele_private.'||t,'TRUNCATE')) AS denied FROM unnest(ARRAY['customers','loan_products','loan_applications','loans','repayment_schedules','repayments','payments','incomes','expenses','settings','application_documents']) t")
  if(denied.rows[0]?.denied!==true)throw new Error('Financial write privileges must be denied')
  return {adapter:createPostgresAdapter(client),async commit(){await client.query('COMMIT');transaction=false},async close(){try{if(transaction)await client.query('ROLLBACK')}finally{await client.end()}}}
 }catch{try{if(transaction)await client.query('ROLLBACK')}finally{await client.end().catch(()=>{})}throw new Error('Database readiness failed')}
}
