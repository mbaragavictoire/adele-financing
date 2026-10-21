import * as mysql from './db.mysql.js'
import { databaseDriver } from './databaseDriver.js'
export let pool = null
let postgres = null
function selected() {
  if (databaseDriver() === 'mysql') return mysql
  if (!postgres) throw new Error('PostgreSQL is not initialized. No implicit database connection is allowed.')
  return postgres
}
export async function initDb() {
  if (databaseDriver() === 'mysql') { await mysql.initDb();pool=mysql.pool;return }
  const { initializePostgres } = await import('./postgres/adapter.js')
  postgres = await initializePostgres()
  pool = postgres.pool
}
export const queryAll = (...args) => selected().queryAll(...args)
export const queryOne = (...args) => selected().queryOne(...args)
export const run = (...args) => selected().run(...args)
export const withTransaction = (...args) => selected().withTransaction(...args)
