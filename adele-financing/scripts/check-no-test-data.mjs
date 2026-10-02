/**
 * Confirms no throwaway accounts or sessions are left behind by the
 * verification scripts. Safe to run at any time.
 */
import '../server/env.js'
import { initDb, queryAll, queryOne } from '../server/db.js'

await initDb()

const users = await queryAll(
  'SELECT id, email, role FROM users WHERE email LIKE ?',
  ['%adele.invalid'],
)
const sessions = await queryOne('SELECT COUNT(*) AS c FROM sessions')
const live = await queryOne(
  'SELECT COUNT(*) AS c FROM sessions WHERE revoked_at IS NULL AND absolute_expires_at > NOW()',
)

console.log('leftover test users:', users.length ? JSON.stringify(users) : 'none')
console.log('total session rows:', String(sessions.c))
console.log('live sessions:', String(live.c))
process.exit(0)