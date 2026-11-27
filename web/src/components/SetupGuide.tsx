import { useState } from 'react'

interface Props {
  urls: { label: string; url: string }[]
  isProfile: boolean
  docsUrl: string | null
}

type Tool = 'pihole' | 'adguard'

export function SetupGuide({ urls, isProfile, docsUrl }: Props) {
  const [tool, setTool] = useState<Tool>('pihole')
  if (urls.length === 0) return null
  const plural = urls.length > 1
  return (
    <section aria-labelledby="h-setup" className="guide">
      <h2 id="h-setup">How to use your list</h2>
      <div className="tabs" role="radiogroup" aria-label="DNS filter">
        {(['pihole', 'adguard'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tool === t} className="tab" onClick={() => setTool(t)}>
            {t === 'pihole' ? 'Pi-hole' : 'AdGuard Home'}
          </button>
        ))}
      </div>
      <ol className="steps">
        <li>
          <strong>Copy the address{plural ? 'es' : ''}</strong> from <em>Your list</em>.
          {!isProfile && plural && <span className="muted"> Your combination has no single address, so add each one separately.</span>}
        </li>
        {tool === 'pihole' ? (
          <>
            <li>Open the Pi-hole web interface and go to <strong>Group Management → Adlists</strong> (called <strong>Lists</strong> in Pi-hole v6).</li>
            <li>Paste the address and click <strong>Add</strong>. Repeat for each address.</li>
            <li>Go to <strong>Tools → Update Gravity</strong> (or run <code>pihole -g</code>) and wait until it finishes.</li>
          </>
        ) : (
          <>
            <li>Open AdGuard Home and go to <strong>Filters → DNS blocklists</strong>.</li>
            <li>Click <strong>Add blocklist → Add a custom list</strong>, name it, paste the address and save. Repeat for each address.</li>
          </>
        )}
        <li><strong>Check that it works:</strong> browse an ad-heavy site or open the query log; blocked requests are marked as blocked.</li>
      </ol>
      <p className="hint">
        Something broke? Remove the list or pause blocking for a moment, then use <em>Report a problem</em> below. New to DNS
        filtering? Read the {docsUrl ? <a href={docsUrl} target="_blank" rel="noreferrer noopener">beginner guide</a> : 'beginner guide'}.
      </p>
    </section>
  )
}
