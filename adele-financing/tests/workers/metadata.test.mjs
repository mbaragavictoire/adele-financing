import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {icuDataDir} from '@electric-sql/pglite-icu-full'
import {openHyperdrive} from '../../workers/hyperdrive.js'
test('actual Worker metadata SQL validates restricted group membership in an in-memory PostgreSQL database',async()=>{
 const db=await PGlite.create({icuDataDir:await icuDataDir()})
 try{
  await db.exec(await readFile(new URL('../../migration-preparation/clean_supabase/001_clean_setup.sql',import.meta.url),'utf8'))
  await db.exec('CREATE ROLE adele_railway LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;GRANT adele_backend TO adele_railway;SET ROLE adele_railway')
  let closed=false
  class Client{async connect(){}query(sql,values){return typeof sql==='string'?db.query(sql,values):db.query(sql.text,sql.values)}async end(){closed=true}}
  const connection=await openHyperdrive({ADELE_WORKERS_DATABASE_REVIEWED:'verify-full-no-cache',HYPERDRIVE:{connectionString:'postgres://adele_railway:synthetic@hyperdrive.invalid/postgres'}},Client)
  assert.equal((await connection.adapter.queryOne('SELECT COUNT(*)::integer AS n FROM users')).n,0)
  await connection.commit();await connection.close();assert.equal(closed,true)
  await assert.rejects(db.query('DELETE FROM adele_private.loans'),e=>e.code==='42501')
 }finally{await db.close()}
})
