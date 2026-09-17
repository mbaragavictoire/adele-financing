export const QUARTER_OPTIONS = [
  { value: 1, label: 'Q1 (Jan–Mar)' },
  { value: 2, label: 'Q2 (Apr–Jun)' },
  { value: 3, label: 'Q3 (Jul–Sep)' },
  { value: 4, label: 'Q4 (Oct–Dec)' },
]

export function currentQuarter() {
  const now = new Date()
  return { q: Math.floor(now.getMonth() / 3) + 1, year: now.getFullYear() }
}

export function quarterLabel(q, year) {
  return `Q${q} ${year}`
}