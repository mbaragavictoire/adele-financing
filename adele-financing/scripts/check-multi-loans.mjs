// Read-only sanity check for the new customers loan-count query,
// run over the Railway tunnel (127.0.0.1:13306).
import mysql from 'mysql2/promise'

const conn = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'railway',
})

const loansCountSql =
  '(SELECT COUNT(*) FROM loans l WHERE l.customer_id = customers.id)'

const sql = `
  SELECT customers.id, customers.customer_id, customers.full_name,
         ${loansCountSql} AS loans_count
  FROM customers
 WHERE ${loansCountSql} >= ?
 ORDER BY loans_count DESC, customers.id DESC
 LIMIT 50
`
const [rows] = await conn.execute(sql, [2])
console.log('=== customers with 2+ loans (live) ===')
console.log(JSON.stringify(rows, null, 2))

const [all] = await conn.execute(
  `SELECT COUNT(*) AS customers, COALESCE(SUM(${loansCountSql} >= 1), 0) AS with_loans,
          COALESCE(SUM(${loansCountSql} >= 2), 0) AS multi_loans
   FROM customers`
)
console.log('=== totals (live) ===')
console.log(JSON.stringify(all, null, 2))

await conn.end()