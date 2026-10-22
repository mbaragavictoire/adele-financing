import { RW_COUNTRY_CODE, RW_LOCAL_LENGTH, sanitizeLocalPhone, rwPhoneFull } from './phone.js'
import { useI18n } from '../i18n/index.jsx'

export function StatusBadge({ status }) {
  const { t } = useI18n()
  const key = `status.${status}`
  const translated = t(key)
  // A missing translation returns the key itself; fall back to the raw value.
  const label = translated === key ? status?.replace(/_/g, ' ') : translated
  return <span className={`status-badge status-${status}`}>{label}</span>
}

export function RoleChip({ role }) {
  const { t } = useI18n()
  const key = `role.${role}`
  const translated = t(key)
  const label = translated === key ? role?.replace(/_/g, ' ') : translated
  return <span className={`role-chip role-${role}`}>{label}</span>
}

export function Empty({ message }) {
  const { t } = useI18n()
  return <div className="admin-empty">{message || t('ui.empty')}</div>
}

export function Loading({ label }) {
  const { t } = useI18n()
  return <div className="admin-loader">{label || t('ui.loading')}</div>
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