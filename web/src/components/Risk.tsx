import type { Risk as RiskT } from '../lib/types'

const LABEL = { low: 'Low risk', medium: 'Medium risk', high: 'High risk' } as const

/** Status dot + text: state is never carried by color alone. */
export function RiskLabel({ risk }: { risk: RiskT | null }) {
  if (!risk) return null
  return (
    <span className={`risk risk-${risk.level}`}>
      <span className="dot" aria-hidden="true" />
      {LABEL[risk.level]}
    </span>
  )
}
