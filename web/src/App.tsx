import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Advanced } from './components/Advanced'
import { CopyButton } from './components/CopyButton'
import { DeviceTypes } from './components/DeviceTypes'
import { ModuleList } from './components/ModuleList'
import { SetupGuide } from './components/SetupGuide'
import { VendorPicker } from './components/VendorPicker'
import { applyExtras, parseDomainLines } from './lib/extras'
import { formatBytes, formatCount, mergeDomains, parseHostsList, renderCustomList } from './lib/lists'
import { downloadBlob, fetchCatalog, fetchHead, fetchText } from './lib/net'
import { coveredVendors, effectiveItems, matchingProfile, parseShareParams, selectProfile, serializeSelection, toggleModule, toggleVendor, vendorsOf } from './lib/state'
import type { Catalog, ModuleEntry, Selection } from './lib/types'
import { absoluteUrl, issueUrl, siteBase } from './lib/urls'

type Theme = 'system' | 'light' | 'dark'
const PREVIEW_LINES = 60
const THEME_LABEL = { system: 'Auto', light: 'Light', dark: 'Dark' } as const

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
        <p className="note" role="alert">
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
  const [allowText, setAllowText] = useState('')
  const [denyText, setDenyText] = useState('')

  const allow = useMemo(() => parseDomainLines(allowText).valid, [allowText])
  const deny = useMemo(() => parseDomainLines(denyText).valid, [denyText])
  const hasExtras = allow.length > 0 || deny.length > 0

  const items = effectiveItems(selection, catalog)
  const itemsKey = items.map((i) => i.file).join()
  const covered = coveredVendors(selection, catalog)
  const vendors = vendorsOf(catalog)
  const empty = items.length === 0 && deny.length === 0
  const profile = catalog.profiles.find((p) => p.id === selection.profileId)!
  const matched = hasExtras ? null : matchingProfile(selection, catalog)
  const modules = catalog.modules.filter((m) => !(m.include_deny && m.domains === 0))
  const sumDomains = items.reduce((n, m) => n + m.domains, 0)
  const url = useCallback((path: string) => absoluteUrl(path, base), [base])

  const loadItems = useCallback(async (list: ModuleEntry[]): Promise<string[][]> => {
    return Promise.all(
      list.map(async (m) => {
        const hit = cache.current.get(m.file)
        if (hit) return hit
        const domains = parseHostsList(await fetchText(absoluteUrl(m.file, base)))
        cache.current.set(m.file, domains)
        return domains
      }),
    )
  }, [base])

  const compose = useCallback(async () => applyExtras(mergeDomains(await loadItems(items)), allow, deny), [items, allow, deny, loadItems])

  // Preview: published profile -> stream only the head of the file; custom -> compose in the browser.
  useEffect(() => {
    if (!previewOpen || empty) return
    let cancelled = false
    setLoadError(null)
    setPreview(null)
    ;(async () => {
      try {
        if (matched) {
          const head = await fetchHead(absoluteUrl(matched.file, base), 64 * 1024)
          if (!cancelled) setPreview({ lines: parseHostsList(head).slice(0, PREVIEW_LINES), total: matched.domains })
        } else {
          const merged = await compose()
          if (!cancelled) setPreview({ lines: merged.slice(0, PREVIEW_LINES), total: merged.length })
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, matched, itemsKey, allowText, denyText, base])

  const isHigh = (m: ModuleEntry) => m.risk?.level === 'high'
  const riskyOn = items.some(isHigh)
  const switchOffRisky = () =>
    setSelection({
      ...selection,
      modules: selection.modules.filter((id) => !isHigh(catalog.modules.find((m) => m.id === id)!)),
      vendors: selection.vendors.filter((id) => !isHigh(vendors.find((v) => v.id === id)!)),
    })

  const guideUrls = empty
    ? []
    : matched
      ? [{ label: matched.name, url: url(matched.file) }]
      : items.map((m) => ({ label: m.name, url: url(m.file) }))

  const onDownload = async () => {
    setLoadError(null)
    setBusy(true)
    try {
      const merged = await compose()
      const names = [...items.map((m) => m.name), ...(deny.length ? ['Your block list'] : [])]
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
  const wikiUrl = repo ? `https://github.com/${repo}/wiki` : null
  const built = new Date(catalog.build.time)
  const suggested = profile.suggested_vendors ?? []
  const summary = `${profile.name} · ${selection.vendors.length ? `${selection.vendors.length} brand${selection.vendors.length > 1 ? 's' : ''} · ` : ''}${matched ? formatCount(matched.domains) : `up to ${formatCount(sumDomains)}`} domains`

  return (
    <>
      <main className="page">
        <header className="top">
          <span className="brand">Universal Blocklist</span>
          <button type="button" className="btn btn-ghost" onClick={cycleTheme} aria-label={`Theme: ${THEME_LABEL[theme]}. Activate to change`}>
            Theme: {THEME_LABEL[theme]}
          </button>
        </header>

        <section className="hero">
          <h1>Block ads, trackers and telemetry on your network.</h1>
          <p className="lead">
            Choose your device type and the brands you own. Paste one address into Pi-hole or AdGuard Home. Lists are rebuilt
            daily from public sources.
          </p>
          <details className="more">
            <summary>New here? What is this?</summary>
            <p>
              A <strong>DNS filter</strong> such as Pi-hole or AdGuard Home runs on a small computer in your network and decides
              which internet addresses your devices may look up. A <strong>blocklist</strong> tells it which addresses belong to
              ads, trackers or malware, so those requests never leave your home. You do not download anything: the filter fetches
              and updates the list itself.
            </p>
          </details>
        </section>

        <div className="layout">
          <div className="config">
            <section aria-labelledby="h-type">
              <h2 id="h-type"><span className="step">1</span>Device type</h2>
              <DeviceTypes catalog={catalog} profileId={selection.profileId} onSelect={(id) => setSelection(selectProfile(id, catalog))} />
            </section>

            {vendors.length > 0 && (
              <section aria-labelledby="h-brands">
                <h2 id="h-brands"><span className="step">2</span>Your brands</h2>
                <p className="sect-desc">Select the brands of your devices. Only their built-in telemetry is blocked, so nothing is blocked by accident.</p>
                <VendorPicker
                  vendors={vendors}
                  suggestedIds={suggested}
                  suggestedFor={profile.name}
                  selected={selection.vendors}
                  covered={covered}
                  sources={catalog.sources}
                  onToggle={(id) => setSelection(toggleVendor(selection, id, catalog))}
                />
              </section>
            )}

            <section aria-labelledby="h-modules">
              <h2 id="h-modules"><span className="step">3</span>What to block</h2>
              <ModuleList modules={modules} enabled={selection.modules} sources={catalog.sources} onToggle={(id) => setSelection(toggleModule(selection, id, catalog))} />
              {riskyOn && (
                <p className="hint">
                  First DNS filter? Entries marked high risk can break updates or smart devices.{' '}
                  <button type="button" className="link inline" onClick={switchOffRisky}>Switch them off to start safely</button>
                </p>
              )}
            </section>

            <Advanced allow={allowText} deny={denyText} onAllow={setAllowText} onDeny={setDenyText} />
          </div>

          <aside className="result" id="your-list" aria-labelledby="h-result">
            <h2 id="h-result">Your list</h2>
            {empty ? (
              <p className="muted">Turn on at least one module or brand.</p>
            ) : (
              <>
                <p className="summary">{summary}{matched ? ` · ${formatBytes(matched.bytes)}` : ''}</p>
                <p className={`kind ${matched ? 'kind-perm' : 'kind-custom'}`}>
                  <span className="dot" aria-hidden="true" />
                  {matched ? 'Permanent address, subscribe once' : hasExtras ? 'Custom file, download only' : 'Subscribe to these addresses'}
                </p>
                {!matched && (
                  <p className="hint">
                    {hasExtras
                      ? 'Your own domains change the list, so it is a custom file with no address. Download it, or subscribe to the addresses below and add your rules in your DNS filter.'
                      : 'Each address below is permanent. Add all of them to your DNS filter, or download one combined file.'}
                  </p>
                )}
                <ul className="addrs">
                  {guideUrls.map((u) => (
                    <li key={u.url}>
                      {guideUrls.length > 1 && <span className="addr-name">{u.label}</span>}
                      <div className="addr">
                        <code title={u.url}>{u.url}</code>
                        <CopyButton text={u.url} label={`${u.label} address`} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="actions">
                  {matched ? (
                    <a className="btn btn-primary" href={url(matched.file)} download={`${matched.id}.txt`}>Download TXT</a>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={onDownload}>
                      {busy ? 'Preparing…' : 'Download TXT'}
                    </button>
                  )}
                  <CopyButton text={shareUrl} label="share link" caption="Copy share link" className="btn-secondary" />
                  <button type="button" className="btn btn-secondary" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>
                    {previewOpen ? 'Hide preview' : 'Preview'}
                  </button>
                </div>
                <p className="hint">The share link stores only your choices, not the list.</p>
                {loadError && <p className="note" role="alert">{loadError}</p>}
                {previewOpen && (
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
              </>
            )}
          </aside>
        </div>

        <SetupGuide urls={guideUrls} isProfile={!!matched} docsUrl={wikiUrl ? `${wikiUrl}/Getting-Started` : null} />

        {(reportUrl || suggestUrl) && (
          <section aria-labelledby="h-help" className="help">
            <h2 id="h-help">Help improve the lists</h2>
            <ul className="help-list">
              {reportUrl && (
                <li>
                  <div>
                    <strong>Something stopped working?</strong>
                    <p className="muted">Your configuration is attached automatically.</p>
                  </div>
                  <a className="btn btn-secondary" href={reportUrl} target="_blank" rel="noreferrer noopener">Report a problem</a>
                </li>
              )}
              {suggestUrl && (
                <li>
                  <div>
                    <strong>A domain that should be blocked?</strong>
                    <p className="muted">Ad, tracking, telemetry or malware domains.</p>
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
            Built {Number.isNaN(built.getTime()) ? catalog.build.time : built.toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })} · version{' '}
            <span className="mono">{catalog.build.version}</span> · <a href={url('data/catalog.json')}>catalog.json</a> ·{' '}
            <a href={url('data/stats.json')}>stats.json</a>
            {wikiUrl && <> · <a href={wikiUrl}>Wiki</a></>}
            {repo && <> · <a href={`https://github.com/${repo}`}>GitHub</a></>}
          </p>
          <p>Entries are exact domains (hosts format, <code>0.0.0.0 domain</code>). Review high-risk entries before using them on devices that depend on updates or cloud features.</p>
        </footer>
      </main>

      <div className="dock" role="region" aria-label="Your list summary">
        <span className="dock-text">{empty ? 'Nothing selected' : summary}</span>
        <a className="btn btn-primary" href="#your-list">Get your list</a>
      </div>
    </>
  )
}
