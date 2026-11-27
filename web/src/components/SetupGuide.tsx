import { useState } from 'react'
import { CopyButton } from './CopyButton'

interface Props {
  /** URLs to paste into the DNS filter: one for a published profile, otherwise one per module. */
  urls: { label: string; url: string }[]
  isProfile: boolean
  docsUrl: string | null
}

type Tool = 'pihole' | 'adguard'

export function SetupGuide({ urls, isProfile, docsUrl }: Props) {
  const [tool, setTool] = useState<Tool>('pihole')
  if (urls.length === 0) return null
  return (
    <section aria-labelledby="h-setup">
      <h2 id="h-setup">How to use your list</h2>
      <div className="card">
        <div className="segmented" role="radiogroup" aria-label="DNS filter">
          {(['pihole', 'adguard'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={tool === t}
              className={tool === t ? 'seg seg-on' : 'seg'}
              onClick={() => setTool(t)}
            >
              {t === 'pihole' ? 'Pi-hole' : 'AdGuard Home'}
            </button>
          ))}
        </div>

        <ol className="steps">
          <li>
            <strong>Copy the list address{urls.length > 1 ? 'es' : ''}.</strong>
            {!isProfile && <span className="muted"> Your combination has no single address, so add each module separately.</span>}
            <ul className="mini-urls">
              {urls.map((u) => (
                <li key={u.url} className="url-line">
                  {urls.length > 1 && <span className="mini-name">{u.label}</span>}
                  <code title={u.url}>{u.url}</code>
                  <CopyButton text={u.url} label={`${u.label} URL`} />
                </li>
              ))}
            </ul>
          </li>
          {tool === 'pihole' ? (
            <>
              <li>Open the Pi-hole web interface and go to <strong>Group Management → Adlists</strong> (called <strong>Lists</strong> in Pi-hole v6).</li>
              <li>Paste the address, click <strong>Add</strong>. Repeat for each address.</li>
              <li>Go to <strong>Tools → Update Gravity</strong> (or run <code>pihole -g</code>) and wait until it finishes.</li>
            </>
          ) : (
            <>
              <li>Open AdGuard Home and go to <strong>Filters → DNS blocklists</strong>.</li>
              <li>Click <strong>Add blocklist → Add a custom list</strong>, give it a name, paste the address and save. Repeat for each address.</li>
            </>
          )}
          <li>
            <strong>Check that it works:</strong> open a test page such as an ad-heavy news site, or look at the
            query log – blocked requests are marked as blocked.
          </li>
        </ol>
        <p className="hint">
          Something broke? Turn the list off for a moment by removing it or disabling the filter, and use{' '}
          <em>Report a problem</em> below. New to DNS filtering? See the{' '}
          {docsUrl ? <a href={docsUrl} target="_blank" rel="noreferrer noopener">beginner guide</a> : 'beginner guide'}.
        </p>
      </div>
    </section>
  )
}
