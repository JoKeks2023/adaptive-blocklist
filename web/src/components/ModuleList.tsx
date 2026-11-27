import { useState } from 'react'
import { formatCount } from '../lib/lists'
import type { ModuleEntry, SourceEntry } from '../lib/types'
import { RiskLabel } from './Risk'

interface Props {
  modules: ModuleEntry[]
  enabled: string[]
  sources: SourceEntry[]
  onToggle: (id: string) => void
}

export function ModuleList({ modules, enabled, sources, onToggle }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <ul className="mods">
      {modules.map((m) => {
        const on = enabled.includes(m.id)
        const isOpen = open === m.id
        const active = sources.filter((s) => m.sources.includes(s.id))
        const pending = sources.filter((s) => m.pending_sources.includes(s.id))
        return (
          <li key={m.id} className="mod">
            <div className="mod-main">
              <div className="mod-text">
                <div className="mod-title">
                  <span className="mod-name">{m.name}</span>
                  <RiskLabel risk={m.risk} />
                </div>
                <p className="mod-desc">{m.description}</p>
                <div className="mod-meta">
                  <span className="mono">{formatCount(m.domains)} domains</span>
                  <button
                    type="button"
                    className="link"
                    aria-expanded={isOpen}
                    aria-controls={`d-${m.id}`}
                    onClick={() => setOpen(isOpen ? null : m.id)}
                  >
                    {isOpen ? 'Hide details' : 'Sources and risks'}
                  </button>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${m.name} module`}
                className="switch"
                onClick={() => onToggle(m.id)}
              >
                <span className="switch-thumb" />
              </button>
            </div>
            {isOpen && (
              <div className="details" id={`d-${m.id}`}>
                {m.risk && <p className="note">{m.risk.text}</p>}
                <SourceList active={active} pending={pending} />
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export function SourceList({ active, pending }: { active: SourceEntry[]; pending: SourceEntry[] }) {
  return (
    <ul className="sources">
      {active.map((s) => (
        <li key={s.id}>
          <a href={s.homepage} target="_blank" rel="noreferrer noopener">{s.name}</a>
          <span className="muted"> · {s.license} · <span className="mono">{formatCount(s.domains)}</span> domains</span>
          <div className="muted small">{s.purpose}</div>
        </li>
      ))}
      {pending.map((s) => (
        <li key={s.id}>
          <span>{s.name}</span> <span className="muted">(pending)</span>
          <div className="muted small">{s.error}</div>
        </li>
      ))}
    </ul>
  )
}
