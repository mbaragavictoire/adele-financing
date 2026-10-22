import { useI18n } from '../i18n/index.jsx'

/**
 * Compact three-way language switch (EN / RW / FR).
 *
 * Renders real buttons with aria-pressed so it is usable by keyboard and
 * screen readers, and stays tappable on small screens. `variant` only changes
 * the colour treatment (public header vs. admin header).
 */
function LanguageSelector({ variant = 'public', onChange }) {
  const { lang, setLang, languages, t } = useI18n()

  function choose(code) {
    setLang(code)
    if (onChange) onChange(code)
  }

  return (
    <div
      className={`lang-selector lang-${variant}`}
      role="group"
      aria-label={t('lang.label')}
    >
      <span className="lang-globe" aria-hidden="true">
        🌐
      </span>
      {languages.map((l) => (
        <button
          key={l.code}
          type="button"
          className={`lang-option${lang === l.code ? ' active' : ''}`}
          aria-pressed={lang === l.code}
          title={t(`lang.${l.code}`)}
          onClick={() => choose(l.code)}
        >
          {l.code.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

export default LanguageSelector
