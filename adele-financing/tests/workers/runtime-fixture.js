// LOCAL SYNTHETIC RUNTIME TEST ONLY. Not referenced by the deployment configuration.
import '../../workers/policy.js'
import {env} from 'cloudflare:workers'
import {httpServerHandler} from 'cloudflare:node'
import {createWorkerApp} from '../../workers/app.js'
import {createWorkerHandler} from '../../workers/handler.js'
if(env.ADELE_LOCAL_RUNTIME_TEST!=='true'||!env.SYNTHETIC_TEST_PASSWORD)throw new Error('Local fixture environment required')
const user={id:1,full_name:'Synthetic Worker Tester',email:'worker@example.invalid',role:'super_admin',status:'active',password_hash:null}
const sessions=new Map()
const adapter={
 async queryOne(sql,values=[]){if(sql.includes('COUNT(*)'))return {c:0};if(sql.includes('FROM users'))return user;if(sql.includes('FROM sessions'))return sessions.get(values[0])||null;throw new Error('Unexpected synthetic query')},
 async queryAll(sql){if(sql.includes('COUNT(*)'))return [{c:0}];if(sql.includes('FROM sessions'))return [];throw new Error('Unexpected synthetic query')},
 async run(sql,v=[]){if(sql.startsWith('INSERT INTO sessions'))sessions.set(v[0],{id:v[0],user_id:v[1],created_at:v[2],last_seen_at:v[3],absolute_expires_at:v[4],idle_expires_at:v[5],revoked_at:null});if(sql.startsWith('UPDATE sessions SET revoked_at')&&sessions.has(v[2]))sessions.get(v[2]).revoked_at=new Date();return {changes:1,lastInsertRowid:1}},pool:{query:async()=>({rows:[]})}}
const app=createWorkerApp();app.listen(8080);const bridge=httpServerHandler({port:8080})
const handler=createWorkerHandler({dispatch:(request,e,ctx)=>bridge.fetch(request,e,ctx),openDatabase:async()=>({adapter,commit:async()=>{},close:async()=>{}})})
export default {async fetch(request,e,ctx){if(new URL(request.url).pathname==='/__local_password_service')return e.PASSWORD_CPU.getByName('adele-password-cpu-v1').fetch('https://private-binding.invalid/');if(new URL(request.url).pathname==='/__local_verify_egress')return fetch('https://blocked-external.invalid/');user.password_hash ||= await e.PASSWORD_CPU.getByName('adele-password-cpu-v1').hash(e.SYNTHETIC_TEST_PASSWORD);return handler(request,e,ctx)}}

export {PasswordCpu} from '../../workers/password-cpu.js'
