export function databaseDriver(env = process.env) {
  const value = env.DB_DRIVER || 'mysql'
  if (['mysql', 'mariadb'].includes(value)) return 'mysql'
  if (['postgres', 'postgresql'].includes(value)) return 'postgres'
  throw new Error('Unsupported DB_DRIVER; expected mysql or postgres.')
}
export const isPostgres = () => databaseDriver() === 'postgres'
export function financialPolicy(env = process.env) {
  return env.ADELE_DEPLOYMENT_MODE !== 'postgres-restricted' && env.ADELE_PG_FINANCIAL_POLICY === 'reviewed-exact-v1'
}
export function assertFinancialPolicy(env = process.env) {
  if (databaseDriver(env) === 'postgres' && !financialPolicy(env)) {
    const error = new Error('PostgreSQL financial policy requires review before financial operations.')
    error.statusCode = 503
    throw error
  }
}
