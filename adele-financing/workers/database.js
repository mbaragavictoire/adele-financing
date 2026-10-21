import {randomUUID} from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
const scope=new AsyncLocalStorage()
const active=new Map()
const current=()=>{const state=scope.getStore();if(!state)throw new Error('Request-scoped Workers database required');return state}
export async function withWorkerDatabase(database,callback,services={}){const id=randomUUID(),state={database,services,pending:new Set(),savepoints:0};active.set(id,state);try{return await scope.run(state,()=>callback(id))}finally{active.delete(id)}}
export function resumeWorkerDatabase(id,callback){const state=active.get(id);if(!state)throw new Error('Unrecognized internal request context');return scope.run(state,callback)}
function call(name,args){const state=current();const promise=Promise.resolve().then(()=>state.database[name](...args));state.pending.add(promise);promise.then(()=>state.pending.delete(promise),()=>state.pending.delete(promise));return promise}
export const queryAll=(...args)=>call('queryAll',args)
export const queryOne=(...args)=>call('queryOne',args)
export const run=(...args)=>call('run',args)
export async function flushWorkerDatabase(){const state=current();while(state.pending.size)await Promise.allSettled([...state.pending])}
export async function withTransaction(callback){const state=current(),name='adele_worker_'+(++state.savepoints);await state.database.pool.query('SAVEPOINT '+name);try{const value=await callback({queryAll,queryOne,run});await state.database.pool.query('RELEASE SAVEPOINT '+name);return value}catch(error){await state.database.pool.query('ROLLBACK TO SAVEPOINT '+name);await state.database.pool.query('RELEASE SAVEPOINT '+name);throw error}}
export function initDb(){throw new Error('Workers never bootstrap a database')}
export const pool=null

export const getWorkerServices=()=>current().services
