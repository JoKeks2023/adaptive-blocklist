import { parseDomainLines } from '../lib/extras'
import { useI18n } from '../lib/i18n'

interface Props {
  allow: string
  deny: string
  onAllow: (v: string) => void
  onDeny: (v: string) => void
}

function Field({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const { t } = useI18n()
  const { invalid } = parseDomainLines(value)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <p className="hint" id={`${id}-hint`}>{hint}</p>
      <textarea
        id={id}
        rows={4}
        value={value}
        spellCheck={false}
        autoCapitalize="none"
        aria-describedby={`${id}-hint${invalid.length ? ` ${id}-err` : ''}`}
        aria-invalid={invalid.length > 0}
        placeholder="example.com"
        onChange={(e) => onChange(e.target.value)}
      />
      {invalid.length > 0 && (
        <p className="error" id={`${id}-err`}>{t('adv.invalid', { list: invalid.slice(0, 3).join(', ') + (invalid.length > 3 ? t('adv.more', { n: invalid.length - 3 }) : '') })}</p>
      )}
    </div>
  )
}

export function Advanced({ allow, deny, onAllow, onDeny }: Props) {
  const { t } = useI18n()
  return (
    <details className="more adv">
      <summary>{t('adv.summary')}</summary>
      <p className="hint">{t('adv.intro')}</p>
      <Field id="allow" label={t('adv.allow')} hint={t('adv.allow.hint')} value={allow} onChange={onAllow} />
      <Field id="deny" label={t('adv.deny')} hint={t('adv.deny.hint')} value={deny} onChange={onDeny} />
    </details>
  )
}
