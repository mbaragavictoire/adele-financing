export function parseQuarter(q, year) {
  const now = new Date()
  const y = Number(year)
  const yy = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : now.getFullYear()

  let qn = Number(q)
  if (!Number.isInteger(qn) || qn < 1 || qn > 4) {
    qn = Math.floor(now.getMonth() / 3) + 1
  }

  const start = new Date(Date.UTC(yy, (qn - 1) * 3, 1))
  const end = new Date(Date.UTC(yy, qn * 3, 0))
  // First day of the NEXT quarter. Use it as an exclusive upper bound for
  // DATETIME columns (approvals, rejections) so the whole last day of the
  // quarter is included: col >= start AND col < endExclusive.
  const endExclusive = new Date(Date.UTC(yy, qn * 3, 1))
  const iso = (d) => d.toISOString().slice(0, 10)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return {
    q: qn,
    year: yy,
    label: `Q${qn} ${yy}`,
    start: iso(start),
    end: iso(end),
    endExclusive: iso(endExclusive),
    dateRangeLabel: `${start.getUTCDate()} ${monthNames[start.getUTCMonth()]} – ${end.getUTCDate()} ${monthNames[end.getUTCMonth()]} ${yy}`,
  }
}

/**
 * Validates the ?q= and ?year= query params used by quarter-aware endpoints.
 * Returns { quarter } on success or { error } when a supplied value is invalid.
 * Absent params fall back to the current quarter (same default as parseQuarter).
 */
export function quarterFromQuery(q, year) {
  if (q !== undefined && q !== '') {
    const n = Number(q)
    if (!Number.isInteger(n) || n < 1 || n > 4) {
      return { error: 'Invalid quarter. Use q=1, 2, 3 or 4.' }
    }
  }
  if (year !== undefined && year !== '') {
    const y = Number(year)
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return { error: 'Invalid year. Use a year between 2000 and 2100.' }
    }
  }
  return { quarter: parseQuarter(q, year) }
}