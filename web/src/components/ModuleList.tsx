import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import type { ModuleEntry, SourceEntry } from '../lib/types'
import { RiskLabel } from './Risk'

interface Props {
  modules: ModuleEntry[]
  enabled: string[]
  sources: SourceEntry[]
  excluded: string[]
  onToggle: (id: string) => void
  onToggleSource: (id: string) => void
}

export function ModuleList({ modules, enabled, sources, excluded, onToggle, onToggleSource }: Props) {
  const { t, content, number } = useI18n()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="mods">
      {modules.map((m) => {
        const on = enabled.includes(m.id)
        const isOpen = open === m.id
        const active = sources.filter((s) => m.sources.includes(s.id))
        const pending = sources.filter((s) => m.pending_sources.includes(s.id))
        const off = active.filter((s) => excluded.includes(s.id) && s.file).length
        const risk = content.risk(m)
        return (
          <li key={m.id} className="mod">
            <div className="mod-main">
              <div className="mod-text">
                <div className="mod-title">
                  <span className="mod-name">{content.name(m)}</span>
                  <RiskLabel risk={risk} />
                </div>
                <p className="mod-desc">{content.description(m)}</p>
                <div className="mod-meta">
                  <span className="mono">{t('mod.domains', { n: number(m.domains) })}</span>
                  {on && off > 0 && <span className="muted">{t('result.sources.n', { n: off })}</span>}
                  <button type="button" className="link" aria-expanded={isOpen} aria-controls={`d-${m.id}`} onClick={() => setOpen(isOpen ? null : m.id)}>
                    {isOpen ? t('mod.hide') : t('mod.show')}
                  </button>
                </div>
              </div>
              <button type="button" role="switch" aria-checked={on} aria-label={t('mod.switch', { name: content.name(m) })} className="switch" onClick={() => onToggle(m.id)}>
                <span className="switch-thumb" />
              </button>
            </div>
            {isOpen && (
              <div className="details" id={`d-${m.id}`}>
                {risk && <p className="note">{risk.text}</p>}
                {active.length > 1 && <p className="hint">{t('mod.sources.hint')}</p>}
                <SourceList
                  active={active}
                  pending={pending}
                  selectable={active.length > 1}
                  excluded={excluded}
                  onToggle={onToggleSource}
                />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

interface SourceListProps {
  active: SourceEntry[]
  pending: SourceEntry[]
  /** Offer a checkbox per source (modules only). */
  selectable?: boolean
  excluded?: string[]
  onToggle?: (id: string) => void
}

export function SourceList({ active, pending, selectable = false, excluded = [], onToggle }: SourceListProps) {
  const { t, number } = useI18n()
  const remaining = active.filter((s) => !excluded.includes(s.id)).length
  return (
    <ul className="sources">
      {active.map((s) => {
        const can = selectable && !!s.file
        const included = !excluded.includes(s.id)
        return (
          <li key={s.id} className={can ? 'src-row' : undefined}>
            {can && (
              <input
                type="checkbox"
                className="src-check"
                checked={included}
                disabled={included && remaining <= 1}
                aria-label={t('mod.source.include', { name: s.name })}
                onChange={() => onToggle?.(s.id)}
              />
            )}
            <div>
              <a href={s.homepage} target="_blank" rel="noreferrer noopener">{s.name}</a>
              <span className="muted"> · {s.license} · <span className="mono">{t('mod.source.domains', { n: number(s.domains) })}</span></span>
              <div className="muted small">{s.purpose}</div>
            </div>
          </li>
        )
      })}
      {pending.map((s) => (
        <li key={s.id}>
          <span>{s.name}</span> <span className="muted">{t('mod.pending')}</span>
          <div className="muted small">{s.error}</div>
        </li>
      ))}
    </ul>
  )
}
