import { QUARTER_OPTIONS } from './quarters.js'

export function QuarterPicker({ q, year, onChange }) {
  const thisYear = new Date().getFullYear()
  const yearOptions = []
  for (let y = thisYear; y >= thisYear - 3; y--) yearOptions.push(y)

  return (
    <div className="quarter-controls">
      <label>
        Quarter
        <select value={q} onChange={(e) => onChange(Number(e.target.value), year)}>
          {QUARTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Year
        <select value={year} onChange={(e) => onChange(q, Number(e.target.value))}>
          {yearOptions.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}