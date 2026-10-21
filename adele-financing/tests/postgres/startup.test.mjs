import test,{mock,after} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'adele-pg-config-'))
const ca=path.join(directory,'synthetic-ca.txt')
fs.writeFileSync(ca,'SYNTHETIC CONFIG FIXTURE ONLY; NO TLS HANDSHAKE')
after(()=>{fs.unlinkSync(ca);fs.rmdirSync(directory)})
let options,queries=[],ended=false,owner=false,count=18
class FakePool {
 constructor(config){options=config}
 on(){}
 async query(sql){
  queries.push(sql)
  if(sql.includes('pg_roles'))return {rows:[{rolsuper:false,rolbypassrls:false,owns_schema:owner}]}
  return {rows:[{count}]}
 }
 async end(){ended=true}
}
mock.module('pg',{defaultExport:{Pool:FakePool,types:{getTypeParser:()=>v=>v}}})
const {initializePostgres}=await import('../../server/postgres/adapter.js')
const env={PGHOST:'synthetic.invalid',PGDATABASE:'adele_synthetic',PGUSER:'adele_synthetic_runtime',PGSSLROOTCERT:ca,PG_TIME_ZONE:'UTC',TZ:'UTC'}
test('PostgreSQL initialization only checks role/schema metadata, pins TLS and never runs DDL/seeds',async()=>{
 const adapter=await initializePostgres(env)
 assert.equal(typeof adapter.queryAll,'function')
 assert.equal(queries.length,2)
 assert.ok(queries.every(q=>q.startsWith('SELECT ')))
 assert.equal(options.ssl.rejectUnauthorized,true)
 assert.match(options.options,/search_path=adele_private,pg_catalog/)
 assert.equal(options.types.getTypeParser(1700)('0.100000000000000001'),'0.100000000000000001')
 assert.equal(ended,false)
})
test('schema-owning runtime identities are rejected before any application data query',async()=>{
 owner=true;queries=[];ended=false
 await assert.rejects(initializePostgres(env),/non-owner/)
 assert.equal(ended,true);assert.equal(queries.length,1)
 owner=false
})
test('missing separately migrated schema fails closed without creating anything',async()=>{
 count=17;queries=[];ended=false
 await assert.rejects(initializePostgres(env),/18-table/)
 assert.equal(ended,true)
 assert.ok(queries.every(q=>q.startsWith('SELECT ')))
})
