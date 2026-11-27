import { useEffect, useState } from 'react'
import { copyText } from '../lib/net'

export function CopyButton({ text, label, caption = 'Copy', className = '' }: { text: string; label: string; caption?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(t)
  }, [state])
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${className}`}
      onClick={async () => setState((await copyText(text)) ? 'ok' : 'fail')}
      aria-label={`Copy ${label}`}
    >
      <span aria-live="polite">{state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy failed' : caption}</span>
    </button>
  )
}
