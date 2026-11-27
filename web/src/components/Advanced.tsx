import { parseDomainLines } from '../lib/extras'

interface Props {
  allow: string
  deny: string
  onAllow: (v: string) => void
  onDeny: (v: string) => void
}

function Field({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string; onChange: (v: string) => void }) {
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
        <p className="error" id={`${id}-err`}>Not valid domains (ignored): {invalid.slice(0, 3).join(', ')}{invalid.length > 3 ? ` and ${invalid.length - 3} more` : ''}</p>
      )}
    </div>
  )
}

export function Advanced({ allow, deny, onAllow, onDeny }: Props) {
  return (
    <details className="more adv">
      <summary>Advanced: your own allow and block domains</summary>
      <p className="hint">
        Applied in your browser to a download. Because this changes the list, the result becomes a custom file (no permanent
        address). In Pi-hole or AdGuard Home you can also keep your own rules there.
      </p>
      <Field id="allow" label="Never block (allowlist)" hint="One domain per line. Also unblocks its subdomains." value={allow} onChange={onAllow} />
      <Field id="deny" label="Always block (denylist)" hint="One domain per line." value={deny} onChange={onDeny} />
    </details>
  )
}
