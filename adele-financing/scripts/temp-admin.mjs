/**
 * Creates a throwaway super_admin so the Sessions page can be checked in a
 * browser, and prints the credentials. Delete it with:
 *   node scripts/temp-admin.mjs delete
 */
import bcrypt from 'bcryptjs'
import '../server/env.js'
import { initDb, run, queryOne } from '../server/db.js'

const EMAIL = 'temporary-preview@adele.invalid'
const PASSWORD = 'temporary-preview-pass-7c1e'

async function main() {
  await initDb()
  const action = process.argv[2] || 'create'

  if (action === 'delete') {
    const user = await queryOne('SELECT id FROM users WHERE email = ?', [EMAIL])
    if (!user) {
      console.log('nothing to remove')
      return
    }
    await run('DELETE FROM sessions WHERE user_id = ?', [user.id])
    await run('DELETE FROM users WHERE id = ?', [user.id])
    console.log('removed the throwaway account and its sessions')
    return
  }

  const existing = await queryOne('SELECT id FROM users WHERE email = ?', [EMAIL])
  if (existing) {
    await run('DELETE FROM sessions WHERE user_id = ?', [existing.id])
    await run('DELETE FROM users WHERE id = ?', [existing.id])
  }

  await run(
    `INSERT INTO users (full_name, email, phone, password_hash, role, status)
     VALUES (?, ?, ?, ?, 'super_admin', 'active')`,
    ['Temporary Preview Account', EMAIL, '+250788000999', bcrypt.hashSync(PASSWORD, 12)],
  )
  console.log(`email:    ${EMAIL}`)
  console.log(`password: ${PASSWORD}`)
}

main()