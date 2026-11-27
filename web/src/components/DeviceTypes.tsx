import type { Catalog } from '../lib/types'

interface Props {
  catalog: Catalog
  profileId: string
  onSelect: (id: string) => void
}

export function DeviceTypes({ catalog, profileId, onSelect }: Props) {
  return (
    <div className="types" role="radiogroup" aria-label="Device type">
      {catalog.profiles.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={p.id === profileId}
          className="type"
          onClick={() => onSelect(p.id)}
        >
          <span className="type-name">{p.name}</span>
          <span className="type-desc">{p.description}</span>
        </button>
      ))}
    </div>
  )
}
