import {DurableObject} from 'cloudflare:workers'
import bcrypt from 'bcryptjs'
// Private compute only: no SQL/KV writes, password storage, database credentials or public HTTP route.
export class PasswordCpu extends DurableObject {
 async compare(password,hash){
  if(typeof password!=='string'||typeof hash!=='string'||password.length>262144||hash.length>128)throw new Error('Invalid password operation')
  const rounds=bcrypt.getRounds(hash)
  if(!Number.isInteger(rounds)||rounds<4||rounds>14)throw new Error('Bcrypt work factor requires review')
  return bcrypt.compare(password,hash)
 }
 async hash(password){if(typeof password!=='string'||password.length>262144)throw new Error('Invalid password operation');return bcrypt.hash(password,12)}
 async fetch(){return new Response('Private password service',{status:403})}
}
