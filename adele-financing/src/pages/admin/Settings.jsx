import { useEffect, useState, useCallback } from 'react'
import { api, apiGet } from '../../admin/api.js'
import { Loading, PhoneInput } from '../../admin/ui.jsx'
import { useI18n } from '../../i18n/index.jsx'

const SETTING_FIELDS = [
  { key: 'company_name', labelKey: 'settings.companyName' },
  { key: 'company_email', labelKey: 'settings.companyEmail' },
  { key: 'company_phone', labelKey: 'settings.companyPhone' },
  { key: 'company_address', labelKey: 'settings.companyAddress' },
]

function Settings() {
  const { t } = useI18n()
  const [values, setValues] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet('/settings')
      const map = {}
      data.settings.forEach((s) => {
        map[s.key] = s.value
      })
      setValues(map)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  async function save() {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      const payload = {}
      for (const f of SETTING_FIELDS) {
        payload[f.key] = values[f.key] || ''
      }
      await api('/settings', { method: 'PUT', body: payload })
      setSuccess(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div style={{ maxWidth: 640 }}>
      {error && <div className="admin-alert admin-alert-error">{error}</div>}
      {success && (
        <div className="admin-alert admin-alert-success">
          {t('settings.saved')}
        </div>
      )}

      <div className="admin-panel">
        <div className="admin-panel-head">
          <h2>{t('settings.title')}</h2>
        </div>
        <div className="admin-panel-body">
          {SETTING_FIELDS.map((f) => (
            <div className="admin-form-group" key={f.key}>
              <label>{t(f.labelKey)}</label>
              {f.key === 'company_phone' ? (
                <PhoneInput
                  className="admin-input"
                  value={values[f.key] || ''}
                  onChange={(v) => setValues((val) => ({ ...val, [f.key]: v }))}
                  placeholder="78XXXXXXX"
                />
              ) : (
                <input
                  className="admin-input"
                  value={values[f.key] || ''}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [f.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
          <button
            className="admin-btn admin-btn-primary"
            onClick={save}
            disabled={saving}
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Settings