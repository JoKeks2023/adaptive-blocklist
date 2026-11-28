import { useI18n } from '../lib/i18n'
import type { Catalog } from '../lib/types'

interface Props {
  catalog: Catalog
  profileId: string
  onSelect: (id: string) => void
}

export function DeviceTypes({ catalog, profileId, onSelect }: Props) {
  const { t, content } = useI18n()
  return (
    <div className="types" role="radiogroup" aria-label={t('types.label')}>
      {catalog.profiles.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={p.id === profileId} className="type" onClick={() => onSelect(p.id)}>
          <span className="type-name">{content.name(p)}</span>
          <span className="type-desc">{content.description(p)}</span>
        </button>
      ))}
    </div>
  )
}
