import { useState } from 'react'
import { formatCount } from '../lib/lists'
import type { ModuleEntry, SourceEntry } from '../lib/types'
import { CopyButton } from './CopyButton'

const RISK_LABEL = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' } as const

interface Props {
  module: ModuleEntry
  enabled: boolean
  sources: SourceEntry[]
  url: string
  onToggle: () => void
}

export function ModuleRow({ module, enabled, sources, url, onToggle }: Props) {
  const [open, setOpen] = useState(false)
  const detailsId = `details-${module.id}`
  const active = sources.filter((s) => module.sources.includes(s.id))
  const pending = sources.filter((s) => module.pending_sources.includes(s.id))
  return (
    <li className={`row ${enabled ? '' : 'row-off'}`}>
      <div className="row-main">
        <div className="row-text">
          <div className="row-title">
            <span>{module.name}</span>
            {module.risk && <span className={`badge badge-${module.risk.level}`}>{RISK_LABEL[module.risk.level]}</span>}
          </div>
          <p className="row-desc">{module.description}</p>
          <button
            type="button"
            className="link"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen(!open)}
          >
            {formatCount(module.domains)} domains · {open ? 'Hide details' : 'Sources & risks'}
          </button>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${module.name} module`}
          className="switch"
          onClick={onToggle}
        >
          <span className="switch-thumb" />
        </button>
      </div>
      {open && (
        <div className="details" id={detailsId}>
          {module.risk && (
            <p className={`callout callout-${module.risk.level}`}>
              <strong>{RISK_LABEL[module.risk.level]}.</strong> {module.risk.text}
            </p>
          )}
          <h3>Sources</h3>
          <ul className="sources">
            {active.map((s) => (
              <li key={s.id}>
                <a href={s.homepage} target="_blank" rel="noreferrer noopener">{s.name}</a>
                <span className="muted"> · {s.license} · {formatCount(s.domains)} domains</span>
                <div className="muted small">{s.purpose}</div>
              </li>
            ))}
            {pending.map((s) => (
              <li key={s.id} className="pending">
                <span>{s.name}</span> <span className="badge badge-pending">Pending</span>
                <div className="muted small">{s.error}</div>
              </li>
            ))}
          </ul>
          <div className="url-line">
            <code title={url}>{url}</code>
            <CopyButton text={url} label={`${module.name} module URL`} />
          </div>
        </div>
      )}
    </li>
  )
}
