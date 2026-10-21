import { assertFinancialPolicy } from '../databaseDriver.js'
import fs from 'node:fs'
import { compile, tokenize } from './sql.js'

export function postgresConfig(env, types) {
  if (['postgres','anon','authenticated','service_role','authenticator'].includes((env.PGUSER || '').split('.')[0])) throw Error('A dedicated non-owner backend role is required, never a privileged/browser role.')
  if(!env.PGHOST || !env.PGDATABASE || !env.PGUSER || !env.PGSSLROOTCERT)throw Error('PostgreSQL requires explicit host/database/user and CA file; no MariaDB fallback.')
  if(env.DATABASE_URL || (env.PGSSLMODE && env.PGSSLMODE!=='verify-full') || env.NODE_TLS_REJECT_UNAUTHORIZED==='0')throw Error('Use explicit PostgreSQL TLS parameters; insecure/global connection overrides are refused.')
  if(!env.PG_TIME_ZONE || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+)+$|^UTC$/.test(env.PG_TIME_ZONE) || env.TZ!==env.PG_TIME_ZONE)throw Error('Review the historical timestamp policy and set matching TZ and PG_TIME_ZONE explicitly.')
  try { new Intl.DateTimeFormat('en',{timeZone:env.PG_TIME_ZONE}) } catch { throw Error('Invalid PostgreSQL timezone') }
  const port=Number(env.PGPORT||5432),max=Number(env.PG_POOL_MAX||5)
  if(!Number.isInteger(port)||port<1||port>65535||port===6543||!Number.isInteger(max)||max<1||max>20)throw Error('Use a reviewed direct/session connection and bounded pool; transaction pooler port is refused.')
  return {host:env.PGHOST,port,database:env.PGDATABASE,user:env.PGUSER,password:env.PGPASSWORD,
    ssl:{ca:fs.readFileSync(env.PGSSLROOTCERT,'utf8'),rejectUnauthorized:true},
    max,connectionTimeoutMillis:10000,idleTimeoutMillis:30000,
    options:`-c search_path=adele_private,pg_catalog -c TimeZone=${env.PG_TIME_ZONE} -c DateStyle=ISO,YMD`,types}
}
export function normalizePostgresError(error) {
  if(error.code==='23505') { const e=new Error('Unique value already exists.');e.code='ER_DUP_ENTRY';e.statusCode=409;return e }
  if(['23503','23514','22P02','22003','22007','22008'].includes(error.code)) {const e=new Error('Record violates a database constraint or value format.');e.code=error.code;e.statusCode=400;return e}
  return error
}
export function createPostgresAdapter(pool) {
  async function query(executor,sql,params,returning=false) {
    const compiled=compile(sql,params,{returning})
    const codeTokens=tokenize(sql)
    if (codeTokens.some(t=>t.kind==='code' && ['LIKE','ILIKE'].includes(t.raw.toUpperCase())) && process.env.ADELE_PG_SEARCH_REVIEWED!=='true') {
      const error=new Error('PostgreSQL collation/search behavior requires staging review before search is enabled.');error.statusCode=503;throw error
    }
    let tableIndex=({INSERT:2,UPDATE:1,DELETE:2})[codeTokens[0]?.raw.toUpperCase()]
    if (tableIndex!==undefined && codeTokens[tableIndex+1]?.raw==='.') tableIndex+=2
    const table=(codeTokens[tableIndex]?.raw || '').replace(/^["`]|["`]$/g,'')
    const financialTables=new Set(['customers','loan_products','loan_applications','loans','repayment_schedules','repayments','payments','incomes','expenses','settings'])
    if (financialTables.has(table) || codeTokens.some(t=>t.kind==='code' && t.raw==='/')) assertFinancialPolicy()
    try { return await executor.query(compiled) } catch(error) { throw normalizePostgresError(error) }
  }
  const apiFor=(executor,transaction=false)=>{
    let queue=Promise.resolve(), savepointNumber=0
    const write=async(sql,params)=>{
      const savepoint='adele_write_'+(++savepointNumber)
      if(transaction)await executor.query('SAVEPOINT '+savepoint)
      try {
        const result=await query(executor,sql,params,true)
        if(transaction)await executor.query('RELEASE SAVEPOINT '+savepoint)
        return {lastInsertRowid:result.rows[0]?.id ?? null,changes:result.rowCount ?? 0}
      }catch(error){
        if(transaction){
          try{await executor.query('ROLLBACK TO SAVEPOINT '+savepoint);await executor.query('RELEASE SAVEPOINT '+savepoint)}catch{/* outer rollback will restore the transaction */}
        }
        throw error
      }
    }
    return {
      queryAll:async(sql,params)=>(await query(executor,sql,params)).rows,
      queryOne:async(sql,params)=>(await query(executor,sql,params)).rows[0],
      run(sql,params){if(!transaction)return write(sql,params);const task=queue.then(()=>write(sql,params));queue=task.catch(()=>{});return task},
    }
  }
  return {...apiFor(pool), pool,
    async withTransaction(callback) {
      const connection=await pool.connect()
      try {
        await connection.query('BEGIN')
        const value=await callback(apiFor(connection,true))
        await connection.query('COMMIT')
        return value
      } catch(error) {
        try { await connection.query('ROLLBACK') } catch { /* preserve original error */ }
        throw error
      } finally { connection.release() }
    },
  }
}
export async function initializePostgres(env=process.env) {
  const {default:pg}=await import('pg')
  const types=postgresTypes(pg.types)
  const pool=new pg.Pool(postgresConfig(env,types))
  pool.on('error', error => console.error('PostgreSQL pool error', {code:error.code || 'CONNECTION_ERROR'}))
  try {
    const identity=await pool.query("SELECT r.rolsuper, r.rolbypassrls, pg_has_role(r.oid,n.nspowner,'MEMBER') AS owns_schema FROM pg_roles r JOIN pg_namespace n ON n.nspname='adele_private' WHERE r.rolname=current_user")
    const role=identity.rows[0]
    if(!role || role.rolsuper || role.rolbypassrls || role.owns_schema)throw Error('Runtime must use a non-owner, non-superuser, non-BYPASSRLS role')
    const result=await pool.query("SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema='adele_private' AND table_type='BASE TABLE'")
    if(result.rows[0]?.count!==18)throw Error('Expected the separately migrated 18-table private schema; startup never creates or seeds it.')
    return createPostgresAdapter(pool)
  } catch(error) { await pool.end();throw error }
}

// DATE/TIMESTAMP/NUMERIC/BIGINT remain raw strings; no UTC or IEEE-754 conversion.
export function postgresTypes(baseTypes) {
  const rawOids=new Set([20,700,701,1082,1114,1184,1700])
  return {getTypeParser(oid,format){return rawOids.has(oid)&&format!=='binary' ? value=>value : baseTypes.getTypeParser(oid,format)}}
}
