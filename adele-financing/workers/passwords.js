import {getWorkerServices} from './database.js'
// Public non-account timing pad only. No user credential or reusable admin password.
const DUMMY="$2b$12$......................7v9.iLBtGAm5fKpmzlL5DNEuCdG5EFa"
function service(){const env=getWorkerServices();if(!env.PASSWORD_CPU?.getByName)throw new Error('Private password CPU binding required');return env.PASSWORD_CPU.getByName('adele-password-cpu-v1')}
export default {
 hashSync(value,salt){if(value!=='adele-timing-equaliser'||salt!=='$2b$12$......................')throw new Error('Synchronous password hashing is not permitted in the Worker');return DUMMY},
 compare(value,hash){return service().compare(String(value),String(hash))},
 hash(value,rounds){if(rounds!==12)throw new Error('Reviewed bcrypt work factor required');return service().hash(String(value))}
}
