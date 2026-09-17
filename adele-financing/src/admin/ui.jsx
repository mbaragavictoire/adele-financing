import { RW_COUNTRY_CODE, RW_LOCAL_LENGTH, sanitizeLocalPhone, rwPhoneFull } from './phone.js'

export function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{status?.replace(/_/g, ' ')}</span>
}

export function RoleChip({ role }) {
  return <span className={`role-chip role-${role}`}>{role?.replace(/_/g, ' ')}</span>
}

export function Empty({ message = 'Nothing to display.' }) {
  return <div className="admin-empty">{message}</div>
}

export function Loading({ label = 'Loading…' }) {
  return <div className="admin-loader">{label}</div>
}

export function PhoneInput({ className, value, onChange, style, ...rest }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', ...style }}>
      <span
        style={{
          background: '#f1f5f9',
          border: '1px solid #cbd5e1',
          borderRight: 'none',
          borderRadius: '6px 0 0 6px',
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          color: '#475569',
          fontWeight: 600,
          fontSize: 14,
          whiteSpace: 'nowrap',
        }}
      >
        {RW_COUNTRY_CODE}
      </span>
      <input
        className={className}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={RW_LOCAL_LENGTH}
        value={sanitizeLocalPhone(value)}
        onChange={(e) => onChange(rwPhoneFull(e.target.value))}
        style={{ flex: 1, borderRadius: '0 6px 6px 0' }}
        {...rest}
      />
    </div>
  )
}