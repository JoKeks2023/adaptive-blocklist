import { useState } from 'react'
import { Rich, useI18n } from '../lib/i18n'

interface Props {
  urls: { label: string; url: string }[]
  isProfile: boolean
  docsUrl: string | null
}

type Tool = 'pihole' | 'adguard'

export function SetupGuide({ urls, isProfile, docsUrl }: Props) {
  const { t } = useI18n()
  const [tool, setTool] = useState<Tool>('pihole')
  if (urls.length === 0) return null
  const plural = urls.length > 1
  return (
    <section aria-labelledby="h-setup" className="guide">
      <h2 id="h-setup">{t('guide.title')}</h2>
      <div className="tabs" role="radiogroup" aria-label={t('guide.tool')}>
        {(['pihole', 'adguard'] as const).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={tool === id} className="tab" onClick={() => setTool(id)}>
            {id === 'pihole' ? 'Pi-hole' : 'AdGuard Home'}
          </button>
        ))}
      </div>
      <ol className="steps">
        <li>
          <Rich text={t(plural ? 'guide.copy.many' : 'guide.copy.one')} />
          <Rich text={t('guide.copy.rest')} />
          {!isProfile && plural && <span className="muted">{t('guide.split')}</span>}
        </li>
        {tool === 'pihole' ? (
          <>
            <li><Rich text={t('guide.pihole.1')} /></li>
            <li><Rich text={t('guide.pihole.2')} /></li>
            <li><Rich text={t('guide.pihole.3')} /></li>
          </>
        ) : (
          <>
            <li><Rich text={t('guide.adguard.1')} /></li>
            <li><Rich text={t('guide.adguard.2')} /></li>
          </>
        )}
        <li><Rich text={t('guide.check')} /></li>
      </ol>
      <p className="hint">
        <Rich text={t('guide.broke')} />
        {docsUrl ? <a href={docsUrl} target="_blank" rel="noreferrer noopener">{t('guide.beginner')}</a> : t('guide.beginner')}.
      </p>
    </section>
  )
}
