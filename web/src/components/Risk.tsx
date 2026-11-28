import { useI18n } from '../lib/i18n'
import type { Risk as RiskT } from '../lib/types'

/** Status dot + text: state is never carried by color alone. */
export function RiskLabel({ risk }: { risk: RiskT | null }) {
  const { t } = useI18n()
  if (!risk) return null
  return (
    <span className={`risk risk-${risk.level}`}>
      <span className="dot" aria-hidden="true" />
      {t(`risk.${risk.level}`)}
    </span>
  )
}
