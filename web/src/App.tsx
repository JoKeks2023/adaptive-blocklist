import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CopyButton } from './components/CopyButton'
import { ModuleRow } from './components/ModuleRow'
import { SetupGuide } from './components/SetupGuide'
import { formatBytes, formatCount, mergeDomains, parseHostsList, renderCustomList } from './lib/lists'
import { downloadBlob, fetchCatalog, fetchHead, fetchText } from './lib/net'
import { matchingProfile, parseShareParams, selectProfile, serializeSelection, toggleModule } from './lib/state'
import type { Catalog, Selection } from './lib/types'
import { absoluteUrl, issueUrl, siteBase } from './lib/urls'

type Theme = 'system' | 'light' | 'dark'
const PREVIEW_LINES = 80

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const t = document.documentElement.dataset.theme
    return t === 'light' || t === 'dark' ? t : 'system'
  })
  const cycle = () => {
    const next: Theme = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system'
    setTheme(next)
    try {
      if (next === 'system') {
        delete document.documentElement.dataset.theme
        localStorage.removeItem('ubl-theme')
      } else {
        document.documentElement.dataset.theme = next
        localStorage.setItem('ubl-theme', next)
      }
    } catch {
      /* storage may be unavailable; theme still applies for this session */
    }
  }
  return [theme, cycle]
}

export function App() {
  const base = useMemo(() => siteBase(window.location.href), [])
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [theme, cycleTheme] = useTheme()

  useEffect(() => {
    fetchCatalog(base)
      .then((c) => {
        setCatalog(c)
        setSelection(parseShareParams(window.location.search, c))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [base])

  // Keep the address bar in sync so the page URL is always the share link.
  useEffect(() => {
    if (!catalog || !selection) return
    const url = new URL(window.location.href)
    url.search = serializeSelection(selection, catalog)
    window.history.replaceState(null, '', url)
  }, [catalog, selection])

  if (error) {
    return (
      <main className="page">
        <h1>Universal Blocklist</h1>
        <p className="callout callout-high" role="alert">
          The published lists could not be loaded ({error}). If you are running locally, build them first:{' '}
          <code>python -m blocklist build</code>.
        </p>
      </main>
    )
  }
  if (!catalog || !selection) {
    return (
      <main className="page">
        <h1>Universal Blocklist</h1>
        <p className="muted" role="status">Loading…</p>
      </main>
    )
  }
  return <Configurator catalog={catalog} selection={selection} setSelection={setSelection} base={base} theme={theme} cycleTheme={cycleTheme} />
}

interface Props {
  catalog: Catalog
  selection: Selection
  setSelection: (s: Selection) => void
  base: URL
  theme: Theme
  cycleTheme: () => void
}

function Configurator({ catalog, selection, setSelection, base, theme, cycleTheme }: Props) {
  const cache = useRef(new Map<string, string[]>())
  const [previewOpen, setPreviewOpen] = useState(false)
  const [preview, setPreview] = useState<{ lines: string[]; total: number | null } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const empty = selection.modules.length === 0
  const profile = catalog.profiles.find((p) => p.id === selection.profileId)!
  const matched = matchingProfile(selection, catalog)
  const modules = catalog.modules.filter((m) => !(m.include_deny && m.domains === 0))
  const selectedModules = catalog.modules.filter((m) => selection.modules.includes(m.id))
  const sumDomains = selectedModules.reduce((n, m) => n + m.domains, 0)
  const url = useCallback((path: string) => absoluteUrl(path, base), [base])

  const loadModules = useCallback(async (ids: string[]): Promise<string[][]> => {
    return Promise.all(
      ids.map(async (id) => {
        const hit = cache.current.get(id)
        if (hit) return hit
        const m = catalog.modules.find((x) => x.id === id)!
        const domains = parseHostsList(await fetchText(absoluteUrl(m.file, base)))
        cache.current.set(id, domains)
        return domains
      }),
    )
  }, [catalog, base])

  // Preview: published profile -> stream only the head of the file; custom -> compose from module lists.
  useEffect(() => {
    if (!previewOpen) return
    let cancelled = false
    setLoadError(null)
    setPreview(null)
    ;(async () => {
      try {
        if (matched) {
          const head = await fetchHead(absoluteUrl(matched.file, base), 64 * 1024)
          if (!cancelled) setPreview({ lines: parseHostsList(head).slice(0, PREVIEW_LINES), total: matched.domains })
        } else {
          const merged = mergeDomains(await loadModules(selection.modules))
          if (!cancelled) setPreview({ lines: merged.slice(0, PREVIEW_LINES), total: merged.length })
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
  }, [previewOpen, matched, selection.modules, loadModules, base])

  const highRisk = catalog.modules.filter((m) => m.risk?.level === 'high').map((m) => m.id)
  const riskyOn = selection.modules.some((id) => highRisk.includes(id))
  const guideUrls = empty
    ? []
    : matched
      ? [{ label: matched.name, url: url(matched.file) }]
      : selectedModules.map((m) => ({ label: m.name, url: url(m.file) }))
  const names = selectedModules.map((m) => m.name)
  const onDownload = async () => {
    setLoadError(null)
    if (matched) return // handled by the plain link below
    setBusy(true)
    try {
      const merged = mergeDomains(await loadModules(selection.modules))
      downloadBlob('universal-blocklist-custom.txt', renderCustomList(merged, names, catalog.build.time, catalog.build.commit.slice(0, 7)))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const shareUrl = (() => {
    const u = new URL(base)
    u.search = serializeSelection(selection, catalog)
    return u.toString()
  })()
  const repo = catalog.build.repository
  const reportUrl = issueUrl(repo, 'broken-service.yml', { config: shareUrl, build: catalog.build.version })
  const suggestUrl = issueUrl(repo, 'block-domain.yml', {})
  const built = new Date(catalog.build.time)

  return (
    <main className="page">
      <header className="top">
        <div>
          <p className="eyebrow">DNS blocklists</p>
          <h1>Universal Blocklist</h1>
        </div>
        <button type="button" className="icon-btn" onClick={cycleTheme} aria-label={`Theme: ${theme}. Switch theme`}>
          {theme === 'system' ? 'Auto' : theme === 'light' ? 'Light' : 'Dark'}
        </button>
      </header>
      <p className="lead">
        Pick a device profile, adjust the modules, and subscribe in Pi-hole or AdGuard Home. Lists are rebuilt daily from
        public sources.
      </p>

      <details className="explain">
        <summary>New here? What is this?</summary>
        <p>
          A <strong>DNS filter</strong> such as Pi-hole or AdGuard Home runs on a small computer in your network and
          decides which internet addresses (domains) your devices may look up. A <strong>blocklist</strong> tells it which
          domains belong to ads, trackers or malware, so those requests never leave your home.
        </p>
        <p>
          Here you choose which kinds of domains to block, then paste one address into your DNS filter. You do not need to
          download anything; the filter fetches and updates the list itself.
        </p>
      </details>

      <section aria-labelledby="h-profile">
        <h2 id="h-profile">Device profile</h2>
        <div className="segmented" role="radiogroup" aria-label="Device profile">
          {catalog.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={p.id === selection.profileId}
              className={p.id === selection.profileId ? 'seg seg-on' : 'seg'}
              onClick={() => setSelection(selectProfile(p.id, catalog))}
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="hint">{profile.description}</p>
      </section>

      <section aria-labelledby="h-modules">
        <h2 id="h-modules">Modules</h2>
        <ul className="group">
          {modules.map((m) => (
            <ModuleRow
              key={m.id}
              module={m}
              enabled={selection.modules.includes(m.id)}
              sources={catalog.sources}
              url={url(m.file)}
              onToggle={() => setSelection(toggleModule(selection, m.id, catalog))}
            />
          ))}
        </ul>
        {riskyOn && (
          <p className="hint">
            First DNS filter? Modules marked <em>high risk</em> can break updates or smart devices.{' '}
            <button type="button" className="link inline" onClick={() => setSelection({ ...selection, modules: selection.modules.filter((id) => !highRisk.includes(id)) })}>
              Switch them off to start safely
            </button>
          </p>
        )}
      </section>

      <section aria-labelledby="h-result" className="result">
        <h2 id="h-result">Your list</h2>
        {empty ? (
          <p className="hint">Enable at least one module.</p>
        ) : matched ? (
          <>
            <p className="status status-ok">
              <strong>{matched.name}</strong> profile · {formatCount(matched.domains)} domains · {formatBytes(matched.bytes)}
            </p>
            <p className="hint">This is a published profile with a permanent, subscribable URL:</p>
            <div className="url-line">
              <code title={url(matched.file)}>{url(matched.file)}</code>
              <CopyButton text={url(matched.file)} label="profile URL" />
            </div>
          </>
        ) : (
          <>
            <p className="status status-custom">
              Custom combination · up to {formatCount(sumDomains)} domains{preview?.total != null && !matched ? ` (${formatCount(preview.total)} unique)` : ''}
            </p>
            <p className="callout callout-medium">
              This combination is assembled in your browser and has <strong>no permanent subscription URL</strong>. Download
              the TXT, or subscribe to the individual module URLs instead:
            </p>
            <ul className="mini-urls">
              {selectedModules.map((m) => (
                <li key={m.id} className="url-line">
                  <span className="mini-name">{m.name}</span>
                  <code title={url(m.file)}>{url(m.file)}</code>
                  <CopyButton text={url(m.file)} label={`${m.name} URL`} />
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="actions">
          {matched ? (
            <a className="btn btn-primary" href={url(matched.file)} download={`${matched.id}.txt`}>Download TXT</a>
          ) : (
            <button type="button" className="btn btn-primary" disabled={empty || busy} onClick={onDownload}>
              {busy ? 'Preparing…' : 'Download TXT'}
            </button>
          )}
          <CopyButton text={shareUrl} label="share link" caption="Copy share link" className="btn-secondary" />
          <button type="button" className="btn btn-secondary" aria-expanded={previewOpen} disabled={empty} onClick={() => setPreviewOpen(!previewOpen)}>
            {previewOpen ? 'Hide preview' : 'Preview'}
          </button>
        </div>
        <p className="hint">The share link stores only your profile and module choice, not the list itself.</p>
        {loadError && <p className="callout callout-high" role="alert">{loadError}</p>}

        {previewOpen && !empty && (
          <div className="preview" aria-live="polite">
            {preview ? (
              <>
                <pre tabIndex={0}>{preview.lines.map((d) => `0.0.0.0 ${d}`).join('\n')}</pre>
                <p className="hint">First {preview.lines.length} of {preview.total != null ? formatCount(preview.total) : '…'} entries.</p>
              </>
            ) : (
              <p className="muted" role="status">Loading preview…</p>
            )}
          </div>
        )}
      </section>

      <SetupGuide urls={guideUrls} isProfile={!!matched} docsUrl={repo ? `https://github.com/${repo}/blob/main/docs/getting-started.md` : null} />

      {(reportUrl || suggestUrl) && (
        <section aria-labelledby="h-help">
          <h2 id="h-help">Help improve the lists</h2>
          <ul className="group">
            {reportUrl && (
              <li className="row help-row">
                <div>
                  <div className="row-title">Something stopped working?</div>
                  <p className="row-desc">Report a blocked service. Your current configuration is attached automatically.</p>
                </div>
                <a className="btn btn-secondary" href={reportUrl} target="_blank" rel="noreferrer noopener">Report a problem</a>
              </li>
            )}
            {suggestUrl && (
              <li className="row help-row">
                <div>
                  <div className="row-title">Found a domain that should be blocked?</div>
                  <p className="row-desc">Submit ad, tracking, telemetry or malware domains for review.</p>
                </div>
                <a className="btn btn-secondary" href={suggestUrl} target="_blank" rel="noreferrer noopener">Suggest domains</a>
              </li>
            )}
          </ul>
          <p className="hint">Opens a GitHub issue form; a GitHub account is required.</p>
        </section>
      )}

      <footer className="foot">
        <p>
          Built {Number.isNaN(built.getTime()) ? catalog.build.time : built.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })} ·
          version {catalog.build.version} ·{' '}
          <a href={url('data/catalog.json')}>catalog.json</a> · <a href={url('data/stats.json')}>stats.json</a>
        </p>
        <p>
          Entries are exact domains (hosts format, <code>0.0.0.0 domain</code>). Review the Telemetry module before using it on
          devices that depend on updates or cloud features.
        </p>
      </footer>
    </main>
  )
}
