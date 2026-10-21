import passwords from '../../workers/passwords.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import {createWorkerHandler} from '../../workers/handler.js'
import {withWorkerDatabase,queryOne,flushWorkerDatabase} from '../../workers/database.js'
import {hyperdriveConfig,openHyperdrive} from '../../workers/hyperdrive.js'
const origin='https://adele-test.example.invalid'
const env={ADELE_WORKERS_API_ENABLED:'true',API_ALLOWED_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('asset')},ADELE_WORKERS_AUTH_CPU_REVIEWED:'true'}
function req(path,method='GET',extra={}){const r=new Request(origin+path,{method,headers:{Origin:origin,'CF-Connecting-IP':'203.0.113.20',...extra}});Object.defineProperty(r,'cf',{value:{colo:'TEST'}});return r}
test('disabled, malformed, origin, financial and unreviewed requests never open a database',async()=>{
 let opens=0;const handle=createWorkerHandler({openDatabase:()=>{opens++;throw Error('Unexpected connection')},dispatch:()=>{throw Error('Unexpected dispatch')}})
 assert.equal((await handle(req('/api/auth/me'),{...env,ADELE_WORKERS_API_ENABLED:'false'})).status,401)
 for(const path of ['/api//loans','/API/loans','/api%2floans','/%61pi/auth/me'])assert.equal((await handle(req(path),env)).status,400)
 for(const path of ['/server/.env','/uploads/private.pdf','/.git/config'])assert.equal((await handle(req(path),env)).status,403)
 assert.equal((await handle(req('/api/auth/login','POST',{Origin:'https://evil.invalid'}),env)).status,403)
 assert.equal((await handle(req('/api/auth/login','POST'),{...env,ADELE_WORKERS_AUTH_CPU_REVIEWED:'false'})).status,503)
 for(const path of ['/api/loans','/api/Loans','/api/payments','/api/repayments','/api/settings','/api/apply'])assert.equal((await handle(req(path,'POST'),env)).status,503)
 assert.equal((await handle(req('/api/contact'),env)).status,503);assert.equal(opens,0)
})
test('request scope preserves separate adapters during concurrent asynchronous requests',async()=>{
 assert.throws(()=>queryOne('outside'),/Request-scoped/)
 const run=value=>withWorkerDatabase({queryOne:async()=>{await new Promise(r=>setTimeout(r,2));return value}},async()=>{const result=await queryOne('SELECT');await flushWorkerDatabase();return result})
 assert.deepEqual(await Promise.all([run('one'),run('two')]),['one','two'])
})
test('trusted client identity replaces forwarding spoofing; response is private and connection closes',async()=>{
 let committed=0,closed=0;const handle=createWorkerHandler({openDatabase:async()=>({adapter:{},commit:async()=>committed++,close:async()=>closed++}),dispatch:async request=>{
 assert.equal(request.headers.get('x-forwarded-for'),null);assert.equal(request.headers.get('authorization'),null);assert.equal(request.headers.get('x-adele-worker-ip'),'203.0.113.20');return Response.json({ok:true})}})
 const result=await handle(req('/api/auth/me','GET',{'X-Forwarded-For':'198.51.100.99',Authorization:'ignored'}),env)
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(committed,1);assert.equal(closed,1)
})
const config={ADELE_WORKERS_DATABASE_REVIEWED:'verify-full-no-cache',HYPERDRIVE:{connectionString:'postgres://adele_railway:synthetic@hyperdrive.invalid:5432/postgres'}}
test('Hyperdrive binding requires explicit independent review, restricted username and no URI overrides',()=>{
 assert.equal(hyperdriveConfig(config).types.getTypeParser(1700)('0.10000000000000001'),'0.10000000000000001')
 for(const change of [{ADELE_WORKERS_DATABASE_REVIEWED:''},{HYPERDRIVE:undefined},{HYPERDRIVE:{connectionString:'postgres://postgres:synthetic@hyperdrive.invalid/postgres'}},{HYPERDRIVE:{connectionString:config.HYPERDRIVE.connectionString+'?sslmode=disable'}}])assert.throws(()=>hyperdriveConfig({...config,...change}))
})
test('each Hyperdrive request sets LOCAL transaction state, verifies role and write denial, then releases',async()=>{
 const sql=[];let ended=0;class Client{async connect(){}async query(text){sql.push(text);return {rows:text.includes('current_user AS name')?[{name:'adele_railway',rolsuper:false,rolbypassrls:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,owns_schema:false,membership_valid:true,tables:18}]:text.includes('bool_and')?[{denied:true}]:[]}}async end(){ended++}}
 const db=await openHyperdrive(config,Client);assert.equal(sql[0],'BEGIN');assert.ok(sql.some(s=>s.startsWith('SET LOCAL search_path')));await db.commit();await db.close();assert.equal(sql.at(-1),'COMMIT');assert.equal(ended,1)
})

test('Worker discards unrelated cookies and rejects duplicate sessions and unsafe response cookies',async()=>{
 let calls=0
 const handle=createWorkerHandler({openDatabase:async()=>{calls++;return {adapter:{},commit:async()=>{},close:async()=>{}}},dispatch:async r=>{assert.equal(r.headers.get('Cookie'),null);return new Response('unsafe',{headers:{'Set-Cookie':'adele_session=; Path=/; Domain=example.invalid'}})}})
 assert.equal((await handle(req('/api/auth/me','GET',{Cookie:'other=value'}),env)).status,503)
 assert.equal((await handle(req('/api/auth/me','GET',{Cookie:'adele_session=a; adele_session=b'}),env)).status,400)
 assert.equal(calls,1)
})

test('password shim permits only the public timing pad synchronously and requires a private request binding',async()=>{
 assert.equal(passwords.hashSync('adele-timing-equaliser','$2b$12$......................').length,60)
 assert.throws(()=>passwords.hashSync('any-user-password',12))
 assert.throws(()=>passwords.compare('synthetic','synthetic'),/Request-scoped/)
 assert.throws(()=>passwords.hash('synthetic',10),/work factor/)
})
test('password hashing and comparison use private RPC without changing the bcrypt work factor',async()=>{
 const calls=[],actor={compare:async(...args)=>{calls.push(['compare',...args]);return true},hash:async value=>{calls.push(['hash',value]);return 'synthetic-hash'}}
 await withWorkerDatabase({},async()=>{assert.equal(await passwords.compare('synthetic','synthetic-hash'),true);assert.equal(await passwords.hash('synthetic',12),'synthetic-hash')},{PASSWORD_CPU:{getByName:name=>{assert.equal(name,'adele-password-cpu-v1');return actor}}})
 assert.deepEqual(calls.map(c=>c[0]),['compare','hash'])
})
