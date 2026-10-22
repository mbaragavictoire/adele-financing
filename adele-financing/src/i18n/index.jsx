import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { setFormatLanguage } from './locale.js'

/*
 * Lightweight, dependency-free translation layer.
 *
 * Every module under ./messages exports `{ en, rw, fr }` objects of flat,
 * dotted keys. Vite bundles them eagerly and they are merged into one
 * dictionary per language, so adding a new area only means adding a new file —
 * no central registry to keep in sync (and no merge conflicts when several
 * people translate different pages at once).
 *
 * `t(key, vars)` returns the active language's value, falling back to English
 * and finally to the key itself, so a missing translation degrades to readable
 * English rather than a blank label.
 */

const modules = import.meta.glob('./messages/*.js', { eager: true })

const DICTS = { en: {}, rw: {}, fr: {} }
for (const mod of Object.values(modules)) {
  const data = mod && mod.default ? mod.default : mod
  if (!data) continue
  for (const lang of Object.keys(DICTS)) {
    if (data[lang]) Object.assign(DICTS[lang], data[lang])
  }
}

const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'rw', label: 'Kinyarwanda', native: 'Ikinyarwanda' },
  { code: 'fr', label: 'French', native: 'Français' },
]

const DEFAULT_LANG = 'en'
const STORAGE_KEY = 'adele_language'

function isSupported(code) {
  return Object.prototype.hasOwnProperty.call(DICTS, code)
}

/** Reads the saved preference, then the browser language, then English. */
function getInitialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && isSupported(stored)) return stored
  } catch {
    // Storage can be blocked in private mode; the default still applies.
  }
  const nav = (typeof navigator !== 'undefined' && navigator.language) || ''
  const short = nav.slice(0, 2).toLowerCase()
  if (short === 'rw') return 'rw'
  if (short === 'fr') return 'fr'
  return DEFAULT_LANG
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(getInitialLanguage)

  useEffect(() => {
    // Keep the document language in sync for screen readers and the browser.
    document.documentElement.lang = lang
    // Let the date/number formatters follow the selected language too.
    setFormatLanguage(lang)
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // Ignore storage failures; translation still works for this session.
    }
  }, [lang])

  const setLang = useCallback((code) => {
    if (isSupported(code)) setLangState(code)
  }, [])

  const t = useCallback(
    (key, vars) => {
      const dict = DICTS[lang] || {}
      let value = dict[key]
      if (value === undefined) value = DICTS[DEFAULT_LANG][key]
      if (value === undefined) value = key
      if (vars && typeof value === 'string') {
        for (const name of Object.keys(vars)) {
          value = value.split(`{${name}}`).join(String(vars[name]))
        }
      }
      return value
    },
    [lang],
  )

  const value = useMemo(
    () => ({ lang, setLang, t, languages: LANGUAGES }),
    [lang, setLang, t],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

/* eslint-disable-next-line react-refresh/only-export-components */
export function useI18n() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider')
  return ctx
}
