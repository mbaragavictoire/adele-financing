/** Credential-free descriptor for offline preview tests. Never creates database users. */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const syntheticAdminFixture = Object.freeze({
  kind: 'synthetic-only',
  id: 'synthetic-admin',
  displayName: 'Synthetic Preview Administrator',
  role: 'super_admin',
  status: 'inactive',
  canAuthenticate: false,
})

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.error('Database account creation/deletion is disabled. Use offline synthetic fixtures only.')
  process.exitCode = 1
}
