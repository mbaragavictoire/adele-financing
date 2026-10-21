import { isPostgres } from './databaseDriver.js'
export function loanDueDate(startDate, months) {
  if (!isPostgres()) {
    const due = new Date(`${startDate}T00:00:00`)
    due.setMonth(due.getMonth() + months)
    return due.toISOString().slice(0,10)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isInteger(months)) {
    const e=new Error('Invalid date-only loan term');e.statusCode=400;throw e
  }
  const due = new Date(`${startDate}T00:00:00Z`)
  if (!Number.isFinite(due.getTime()) || due.toISOString().slice(0,10)!==startDate) {
    const e=new Error('Invalid loan calendar date');e.statusCode=400;throw e
  }
  // Proposed compatibility rule: retain native month overflow, avoid timezone day shifts.
  due.setUTCMonth(due.getUTCMonth()+months)
  return due.toISOString().slice(0,10)
}
