import { useEffect, useState } from 'react'
import { useI18n } from '../lib/i18n'
import { copyText } from '../lib/net'

export function CopyButton({ text, label, caption, className = '' }: { text: string; label: string; caption?: string; className?: string }) {
  const { t } = useI18n()
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const id = setTimeout(() => setState('idle'), 1800)
    return () => clearTimeout(id)
  }, [state])
  return (
    <button
      type="button"
      className={`btn btn-secondary btn-sm ${className}`}
      onClick={async () => setState((await copyText(text)) ? 'ok' : 'fail')}
      aria-label={t('copy.aria', { label })}
    >
      <span aria-live="polite">{state === 'ok' ? t('copy.copied') : state === 'fail' ? t('copy.failed') : (caption ?? t('copy.copy'))}</span>
    </button>
  )
}
