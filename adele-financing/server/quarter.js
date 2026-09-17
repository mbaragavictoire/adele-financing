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
  const iso = (d) => d.toISOString().slice(0, 10)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  return {
    q: qn,
    year: yy,
    label: `Q${qn} ${yy}`,
    start: iso(start),
    end: iso(end),
    dateRangeLabel: `${start.getUTCDate()} ${monthNames[start.getUTCMonth()]} – ${end.getUTCDate()} ${monthNames[end.getUTCMonth()]} ${yy}`,
  }
}