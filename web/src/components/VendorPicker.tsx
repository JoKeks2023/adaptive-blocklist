import { formatCount } from '../lib/lists'
import type { ModuleEntry, SourceEntry } from '../lib/types'
import { SourceList } from './ModuleList'
import { RiskLabel } from './Risk'

interface Props {
  vendors: ModuleEntry[]
  suggestedIds: string[]
  suggestedFor: string
  selected: string[]
  covered: Map<string, string>
  sources: SourceEntry[]
  onToggle: (id: string) => void
}

function Chip({ v, on, coveredBy, onToggle }: { v: ModuleEntry; on: boolean; coveredBy?: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={on || !!coveredBy}
      aria-disabled={coveredBy ? true : undefined}
      onClick={coveredBy ? undefined : onToggle}
      title={coveredBy ? `Already included in the ${coveredBy} module` : undefined}
    >
      <span className="chip-check" aria-hidden="true">{on || coveredBy ? '✓' : ''}</span>
      <span className="chip-name">{v.name}</span>
      <span className="chip-risk" aria-hidden="true"><span className={`dot dot-${v.risk?.level ?? 'low'}`} /></span>
      <span className="visually-hidden">
        {v.risk ? `${v.risk.level} risk. ` : ''}
        {coveredBy ? `Included in ${coveredBy}.` : ''}
      </span>
    </button>
  )
}

export function VendorPicker({ vendors, suggestedIds, suggestedFor, selected, covered, sources, onToggle }: Props) {
  const suggested = suggestedIds.map((id) => vendors.find((v) => v.id === id)).filter((v): v is ModuleEntry => !!v)
  const others = vendors.filter((v) => !suggestedIds.includes(v.id))
  const none = selected.length === 0 && covered.size === 0
  const chips = (list: ModuleEntry[]) => (
    <div className="chips">
      {list.map((v) => (
        <Chip key={v.id} v={v} on={selected.includes(v.id)} coveredBy={covered.get(v.id)} onToggle={() => onToggle(v.id)} />
      ))}
    </div>
  )
  return (
    <div>
      {suggested.length > 0 && (
        <>
          <p className="sub">Common for {suggestedFor}</p>
          {chips(suggested)}
        </>
      )}
      {others.length > 0 && (
        <details className="more" open={suggested.length === 0}>
          <summary>{suggested.length > 0 ? 'More brands' : 'Brands'}</summary>
          {chips(others)}
        </details>
      )}
      {none && suggested.length > 0 && (
        <p className="nudge">
          Pick your {suggestedFor.toLowerCase()} brand. Until you do, nothing brand-specific is blocked, so nothing of yours can break.
        </p>
      )}
      <details className="more">
        <summary>About these brands</summary>
        <ul className="about">
          {vendors.map((v) => (
            <li key={v.id}>
              <div className="about-title">
                <strong>{v.name}</strong> <RiskLabel risk={v.risk} /> <span className="mono muted">{formatCount(v.domains)} domains</span>
              </div>
              {v.risk && <p className="note">{v.risk.text}</p>}
              <SourceList active={sources.filter((s) => v.sources.includes(s.id))} pending={sources.filter((s) => v.pending_sources.includes(s.id))} />
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
