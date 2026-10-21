import {Miniflare,Log,LogLevel,convertV4MiniflareOptions} from '../../tools/runtime/node_modules/miniflare/dist/src/index.js'
import assert from 'node:assert/strict'
import {randomBytes} from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
const root=process.cwd(),password=randomBytes(32).toString('base64url'),origin='https://adele-worker.local.invalid'
let outboundAttempts=0
const mf=new Miniflare(convertV4MiniflareOptions({cf:false,telemetry:{enabled:false},host:"127.0.0.1",port:0,rootPath:root,modules:true,durableObjects:{PASSWORD_CPU:{className:'PasswordCpu',useSQLite:true}},scriptPath:path.join(root,'server/data/workers-runtime-fixture/runtime-fixture.js'),compatibilityDate:'2026-10-21',compatibilityFlags:['nodejs_compat','enable_nodejs_http_server_modules'],log:new Log(LogLevel.ERROR),bindings:{ADELE_LOCAL_RUNTIME_TEST:'true',SYNTHETIC_TEST_PASSWORD:password,ADELE_WORKERS_API_ENABLED:'true',ADELE_WORKERS_AUTH_CPU_REVIEWED:'true',API_ALLOWED_ORIGIN:origin},serviceBindings:{ASSETS:()=>new Response('<html>synthetic</html>',{headers:{'Content-Type':'text/html'}})},outboundService(){outboundAttempts++;return new Response('External network denied',{status:503})}}))
const results=[]
const check=async(name,callback)=>{await callback();results.push({name,status:'PASS'})}
const request=(route,{method='GET',body,cookie,originHeader=origin}={})=>mf.dispatchFetch(origin+route,{method,headers:{Origin:originHeader,'CF-Connecting-IP':'203.0.113.30',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),cf:{colo:'TEST'}})
try{
 await mf.ready
 await check('workerd outbound HTTP egress is denied by the local test service',async()=>{assert.equal((await request('/__local_verify_egress')).status,503);assert.equal(outboundAttempts,1)})
 await check('password Durable Object has no public HTTP API',async()=>assert.equal((await request('/__local_password_service')).status,403))
 await check('workerd Express app imports and unauthenticated session returns 401',async()=>assert.equal((await request('/api/auth/me')).status,401))
 let cookie
 await check('real Express login sets secure host-only HttpOnly Strict cookie',async()=>{const r=await request('/api/auth/login',{method:'POST',body:{email:'worker@example.invalid',password}});assert.equal(r.status,200);const value=r.headers.getSetCookie()[0];assert.match(value,/Secure/);assert.match(value,/HttpOnly/);assert.match(value,/SameSite=Strict/);assert.doesNotMatch(value,/Domain=/);cookie=value.split(';')[0]})
 await check('request scoped authentication works through Workers HTTP bridge',async()=>assert.equal((await request('/api/auth/me',{cookie})).status,200))
 await check('parallel signed-in and anonymous requests stay separate',async()=>assert.deepEqual((await Promise.all([request('/api/auth/me',{cookie}),request('/api/auth/me')])).map(r=>r.status),[200,401]))
 await check('CSRF, malformed API, private documents and financial writes fail closed',async()=>{assert.equal((await request('/api/auth/login',{method:'POST',body:{},originHeader:'https://evil.invalid'})).status,403);assert.equal((await request('/api//loans')).status,400);assert.equal((await request('/uploads/customer.pdf')).status,403);assert.equal((await request('/api/loans',{method:'POST',body:{},cookie})).status,503)})
 await check('logout clears cookie and previous session is rejected',async()=>{assert.equal((await request('/api/auth/logout',{method:'POST',body:{},cookie})).status,200);assert.equal((await request('/api/auth/me',{cookie})).status,401)})
 await check('private responses are no-store and no further network operation was attempted',async()=>{assert.equal((await request('/api/auth/me')).headers.get('cache-control'),'no-store');assert.equal(outboundAttempts,1)})
 console.log(JSON.stringify({runtime:'local workerd',results,externalNetworkAttempts:outboundAttempts,cpuLimitsEnforced:false,browserTlsHandshakeTested:false},null,2))
 fs.mkdirSync('server/data/workers-verification',{recursive:true});fs.writeFileSync('server/data/workers-verification/runtime-results.json',JSON.stringify({results,outboundAttempts},null,2))
}finally{await mf.dispose()}

const production=new Miniflare(convertV4MiniflareOptions({cf:false,telemetry:{enabled:false},host:'127.0.0.1',port:0,rootPath:root,modules:true,scriptPath:path.join(root,'server/data/workers-build/index.js'),compatibilityDate:'2026-10-21',compatibilityFlags:['nodejs_compat','enable_nodejs_http_server_modules'],log:new Log(LogLevel.ERROR),bindings:{ADELE_WORKERS_API_ENABLED:'false',ADELE_WORKERS_AUTH_CPU_REVIEWED:'false'},serviceBindings:{ASSETS:()=>new Response('synthetic asset')},outboundService(){throw new Error('Production-shaped disabled runtime must not perform external IO')}}))
try{await production.ready;assert.equal((await production.dispatchFetch(origin+'/api/auth/me')).status,401);assert.equal((await production.dispatchFetch(origin+'/api/health')).status,503);assert.equal((await production.dispatchFetch(origin+'/uploads/private.pdf')).status,403);assert.equal((await production.dispatchFetch(origin+'/deep/link')).status,200);console.log('Production-shaped Worker bundle: startup, disabled API, private paths and static/deep links PASS; no database binding supplied.')}finally{await production.dispose()}
