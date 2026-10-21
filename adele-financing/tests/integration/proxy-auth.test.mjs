import test,{mock} from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {randomBytes} from 'node:crypto'
import express from 'express'
import bcrypt from 'bcryptjs'
import {PGlite} from '@electric-sql/pglite'
import {icuDataDir} from '@electric-sql/pglite-icu-full'
import {createApiProxy} from '../../cloudflare/api-proxy.js'
import {createRestrictedPostgresProxyIngress} from '../../server/proxyIngress.js'
import {createPostgresAdapter} from '../../server/postgres/adapter.js'
const FRONTEND='https://integration.example.invalid',SECRET=randomBytes(32).toString('base64url')
const env={TZ:'UTC',PG_TIME_ZONE:'UTC',DB_DRIVER:'postgres',PGUSER:'adele_railway.integration',ADELE_DEPLOYMENT_MODE:'postgres-restricted',NODE_ENV:'production',SESSION_COOKIE_SECURE:'true',SESSION_COOKIE_SAMESITE:'strict',API_ALLOWED_ORIGIN:FRONTEND,CORS_ORIGINS:FRONTEND,API_PROXY_SECRET:SECRET}
Object.assign(process.env,env);delete process.env.ADELE_PG_FINANCIAL_POLICY
const edgeEnv={API_MODE:'railway-postgres',API_STAGE:'postgres-restricted',API_UPSTREAM:'https://adele-financing-production.up.railway.app',API_ALLOWED_ORIGIN:FRONTEND,API_PROXY_SECRET:SECRET}
const password=randomBytes(32).toString('base64url')
const db=await PGlite.create({icuDataDir:await icuDataDir()})
await db.exec(await readFile(new URL('../../migration-preparation/clean_supabase/001_clean_setup.sql',import.meta.url),'utf8'))
await db.exec(await readFile(new URL('../../migration-preparation/clean_supabase/002_optional_synthetic_seed.sql',import.meta.url),'utf8'))
await db.query("INSERT INTO adele_private.users(full_name,email,password_hash,role) VALUES('Synthetic integration tester','tester@example.invalid',$1,'super_admin')",[await bcrypt.hash(password,4)])
// SQL executes under the restricted group in a disposable in-memory database only.
await db.exec('SET ROLE adele_backend;SET search_path=adele_private,pg_catalog;SET TimeZone=UTC')
const executor={async query(config){const result=typeof config==='string'?await db.query(config):await db.query(config.text,config.values);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length}}}
const adapter=createPostgresAdapter(executor)
mock.module('../../server/db.js',{namedExports:{...adapter,initDb:async()=>{throw Error('Remote startup forbidden')}}})
const {default:auth}=await import('../../server/routes/auth.js')
const app=express();app.set('trust proxy',false);app.use('/api',createRestrictedPostgresProxyIngress(env));app.use(express.json());app.get('/api/health',(_req,res)=>res.json({status:'ok'}));app.use('/api/auth',auth)
app.post('/api/loans',()=>{throw Error('Financial handler must not execute')})
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
const loopback='http://127.0.0.1:'+server.address().port
let fetches=0
const handle=createApiProxy({fetchImpl:async(url,init)=>{const u=new URL(url);assert.equal(u.origin,edgeEnv.API_UPSTREAM);fetches++;return fetch(loopback+u.pathname+u.search,init)}})
function request(route,{method='GET',body,cookie,origin=FRONTEND}={}){const r=new Request(FRONTEND+route,{method,headers:{Origin:origin,'CF-Connecting-IP':'203.0.113.25',...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});Object.defineProperty(r,'cf',{value:{colo:'TEST'}});return r}
const invoke=(route,options)=>handle({request:request(route,options),env:edgeEnv})
test('restricted proxy + Express auth + exact PostgreSQL engine integration; synthetic loopback only',async t=>{
 let cookie
 try{
  await t.test('health probe is public for Railway but all direct application access requires the proxy',async()=>{
   assert.equal((await fetch(loopback+'/api/health')).status,200)
   assert.equal((await fetch(loopback+'/api/auth/me')).status,403)
   const r=await invoke('/api/auth/me');assert.equal(r.status,401);assert.match(r.headers.get('cache-control'),/no-store/)
  })
  await t.test('wrong identity/stage cannot forward to the old backend',async()=>{
   const old=createApiProxy({fetchImpl:async()=>new Response(JSON.stringify({kind:'adele-synthetic-sandbox'}),{headers:{'Content-Type':'application/json','X-Adele-Data-Class':'synthetic-only'}})})
   assert.equal((await old({request:request('/api/auth/me'),env:edgeEnv})).status,502)
   assert.equal((await handle({request:request('/api/auth/me'),env:{...edgeEnv,API_STAGE:'synthetic-sandbox'}})).status,503)
  })
  await t.test('login, session rotation, authenticated reads, logout and replay rejection work with Secure Strict cookies',async()=>{
   const login=()=>invoke('/api/auth/login',{method:'POST',body:{email:'tester@example.invalid',password}})
   const first=await login();assert.equal(first.status,200)
   const header=first.headers.getSetCookie()[0];assert.match(header,/HttpOnly/i);assert.match(header,/Secure/i);assert.match(header,/SameSite=Strict/i);assert.doesNotMatch(header,/Domain=/i)
   cookie=header.split(';')[0]
   assert.equal((await invoke('/api/auth/me',{cookie})).status,200)
   const second=await login();assert.equal(second.status,200);assert.notEqual(second.headers.getSetCookie()[0].split(';')[0],cookie)
   const logout=await invoke('/api/auth/logout',{method:'POST',body:{},cookie});assert.equal(logout.status,200);assert.match(logout.headers.getSetCookie()[0],/^adele_session=;/)
   assert.equal((await invoke('/api/auth/me',{cookie})).status,401)
  })
  await t.test('CSRF, malformed routes and financial writes fail before upstream calls',async()=>{
   const before=fetches
   assert.equal((await invoke('/api/auth/login',{method:'POST',body:{},origin:'https://evil.example.invalid'})).status,403)
   for(const route of ['/api//loans','/api%2Floans','/API/loans'])assert.equal((await invoke(route)).status,400)
   for(const route of ['/api/loans','/api/repayments','/api/payments','/api/settings','/api/customers','/api/apply','/api/Loans'])assert.equal((await invoke(route,{method:'POST',body:{amount:'1'},cookie})).status,503)
   assert.equal(fetches,before)
   const direct=await fetch(loopback+'/api/loans',{method:'POST',headers:{Origin:FRONTEND,'X-Adele-Proxy-Secret':SECRET,'X-Adele-Client-IP':'203.0.113.25','X-Adele-Proxy-Stage':'postgres-restricted'}});assert.equal(direct.status,503)
  })
  await t.test('database financial grants remain denied and only authenticated proxy client IP is recorded',async()=>{
   await assert.rejects(db.query('DELETE FROM loans'),e=>e.code==='42501')
   const rows=(await db.query('SELECT ip FROM login_attempts')).rows;assert.ok(rows.length>0);assert.ok(rows.every(r=>r.ip==='203.0.113.25'));assert.ok((await db.query('SELECT ip FROM sessions')).rows.every(r=>r.ip==='203.0.113.25'))
   assert.equal((await db.query('SELECT count(*)::integer AS n FROM loans')).rows[0].n,0)
  })
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await db.close()}
})
