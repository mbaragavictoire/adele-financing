import {sessionCookie,secureCookies} from '../cloudflare/api-proxy.js'
import {isIP} from 'node:net'
import {blockedFinancialWrite} from '../cloudflare/financial-boundary.js'
import {withWorkerDatabase,flushWorkerDatabase} from './database.js'
function json(status,error){return Response.json({error},{status,headers:{'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}
export function createWorkerHandler({dispatch,openDatabase}){return async(request,env,ctx)=>{
 const url=new URL(request.url),pathname=url.pathname
 if(/^\/+[^/]*%/.test(pathname))return json(400,'Invalid path.')
 if(/^\/+(?:server|uploads|backups)(?:\/|$)/i.test(pathname)||/^\/+\.(?:env|git)(?:[/.]|$)/i.test(pathname))return json(403,'Private path.')
 if(!/^\/+api/i.test(pathname))return env.ASSETS.fetch(request)
 if(!/^\/api(?:\/[A-Za-z0-9_-]+)*\/?$/.test(pathname))return json(400,'Invalid API path.')
 const origin=request.headers.get('Origin'),safe=['GET','HEAD','OPTIONS'].includes(request.method)
 if((origin&&origin!==url.origin)||(!safe&&origin!==url.origin)||!['same-origin','none',null].includes(request.headers.get('Sec-Fetch-Site')))return json(403,'Origin refused.')
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}})
 if(!['GET','HEAD','POST','PUT','DELETE'].includes(request.method))return json(405,'Method refused.')
 if(env.ADELE_WORKERS_API_ENABLED!=='true')return json(pathname==='/api/auth/me'?401:503,'Workers API is disabled pending verification.')
 if(env.API_ALLOWED_ORIGIN!==url.origin||url.protocol!=='https:')return json(503,'Origin configuration required.')
 if(blockedFinancialWrite(request.method,pathname))return json(503,'Financial writes remain disabled.')
 if(/^\/api\/(?:apply|contact)(?:\/|$)/i.test(pathname))return json(503,'Unreviewed application storage/contact features are disabled.')
 if(!safe&&/^\/api\/(?:auth|users)(?:\/|$)/i.test(pathname)&&env.ADELE_WORKERS_AUTH_CPU_REVIEWED!=='true')return json(503,'Password authentication requires CPU-budget verification.')
 if(!request.cf?.colo)return json(503,'Trusted platform request context required.')
 const ip=request.headers.get('CF-Connecting-IP')||''
 if(!isIP(ip))return json(503,'Client identity unavailable.')
 let cookie
 try{cookie=sessionCookie(request.headers.get('cookie'))}catch{return json(400,'Invalid session cookie.')}
 const headers=new Headers(request.headers)
 headers.delete('Cookie');if(cookie)headers.set('Cookie',cookie)
 for(const key of [...headers.keys()])if(key.startsWith('x-forwarded-')||key.startsWith('x-adele-')||key==='authorization')headers.delete(key)
 // The Node bridge receives these only after platform context/origin checks; no network proxy is involved.
 headers.set('x-adele-worker-ip',ip)
 let connection
 try{
  connection=await openDatabase(env)
  return await withWorkerDatabase(connection.adapter,async(id)=>{
   headers.set('x-adele-worker-context',id)
   const clean=new Request(request,{headers})
   const response=pathname==='/api/health'?Response.json({status:'ok',service:'adele-workers'}):await dispatch(clean,env,ctx)
   secureCookies(response.headers)
   const body=['HEAD'].includes(request.method)||[204,304].includes(response.status)?null:await response.arrayBuffer()
   await flushWorkerDatabase();await connection.commit()
   const output=new Headers(response.headers);for(const key of ['Cache-Control','CDN-Cache-Control','Cloudflare-CDN-Cache-Control'])output.set(key,'no-store')
   return new Response(body,{status:response.status,headers:output})
  },env)
 }catch{return json(503,'API unavailable; configuration or database verification failed.')}
 finally{if(connection)await connection.close().catch(()=>{})}
}}
