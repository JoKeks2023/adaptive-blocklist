import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Advanced } from './components/Advanced'
import { CopyButton } from './components/CopyButton'
import { DeviceTypes } from './components/DeviceTypes'
import { ModuleList } from './components/ModuleList'
import { SetupGuide } from './components/SetupGuide'
import { VendorPicker } from './components/VendorPicker'
import { applyExtras, parseDomainLines } from './lib/extras'
import { formatBytes, mergeDomains, parseHostsList, renderCustomList } from './lib/lists'
import { downloadBlob, fetchCatalog, fetchHead, fetchText } from './lib/net'
import { coveredVendors, effectiveItems, matchingProfile, parseShareParams, planAddresses, selectProfile, serializeSelection, toggleModule, toggleSource, toggleVendor, vendorsOf } from './lib/state'
import type { Catalog, ModuleEntry, Selection } from './lib/types'
import { Rich, useI18n } from './lib/i18n'
import { absoluteUrl, issueUrl, siteBase } from './lib/urls'

type Theme = 'system' | 'light' | 'dark'
const PREVIEW_LINES = 60

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
  const { t } = useI18n()

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
        <h1>{t('app.name')}</h1>
        <p className="note" role="alert">
          {t('load.error', { error })}{' '}
          <code>python -m blocklist build</code>.
        </p>
      </main>
    )
  }
  if (!catalog || !selection) {
    return (
      <main className="page">
        <h1>{t('app.name')}</h1>
        <p className="muted" role="status">{t('load.loading')}</p>
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
  const { t, lang, setLang, content, number } = useI18n()
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
  const covered = useMemo(() => {
    const names = new Map(catalog.modules.map((m) => [m.name, content.name(m)]))
    return new Map([...coveredVendors(selection, catalog)].map(([id, name]) => [id, names.get(name) ?? name]))
  }, [selection, catalog, content])
  const vendors = vendorsOf(catalog)
  const empty = items.length === 0 && deny.length === 0
  const profile = catalog.profiles.find((p) => p.id === selection.profileId)!
  const profileName = content.name(profile)
  const plan = planAddresses(selection, catalog)
  const matched = hasExtras || plan.kind !== 'profile' ? null : matchingProfile(selection, catalog)
  const modules = catalog.modules.filter((m) => !(m.include_deny && m.domains === 0))
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

  const guideUrls = empty ? [] : plan.addresses.map((a) => ({ label: a.label, url: url(a.file) }))

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
  const brandText = selection.vendors.length === 1 ? t('result.brand.one') : t('result.brand.many', { n: selection.vendors.length })
  const summary = `${profileName} · ${selection.vendors.length ? `${brandText} · ` : ''}${matched ? number(matched.domains) : t('result.upto', { n: number(plan.domains) })} ${t('result.domains')}`

  return (
    <>
      <main className="page">
        <header className="top">
          <span className="brand">{t('app.name')}</span>
          <div className="top-actions">
            <button type="button" className="btn btn-ghost" lang={lang === 'de' ? 'en' : 'de'} onClick={() => setLang(lang === 'de' ? 'en' : 'de')} aria-label={t('lang.aria')}>
              {t('lang.switch')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={cycleTheme} aria-label={t('theme.aria', { mode: t(`theme.${theme}`) })}>
              {t('theme.label', { mode: t(`theme.${theme}`) })}
            </button>
          </div>
        </header>

        <section className="hero">
          <h1>{t('hero.title')}</h1>
          <p className="lead">{t('hero.lead')}</p>
          <details className="more">
            <summary>{t('hero.new')}</summary>
            <p><Rich text={t('hero.explain')} /></p>
          </details>
        </section>

        <div className="layout">
          <div className="config">
            <section aria-labelledby="h-type">
              <h2 id="h-type"><span className="step">1</span>{t('step.type')}</h2>
              <DeviceTypes catalog={catalog} profileId={selection.profileId} onSelect={(id) => setSelection(selectProfile(id, catalog))} />
            </section>

            {vendors.length > 0 && (
              <section aria-labelledby="h-brands">
                <h2 id="h-brands"><span className="step">2</span>{t('step.brands')}</h2>
                <p className="sect-desc">{t('step.brands.desc')}</p>
                <VendorPicker
                  vendors={vendors}
                  suggestedIds={suggested}
                  suggestedFor={profileName}
                  selected={selection.vendors}
                  covered={covered}
                  sources={catalog.sources}
                  onToggle={(id) => setSelection(toggleVendor(selection, id, catalog))}
                />
              </section>
            )}

            <section aria-labelledby="h-modules">
              <h2 id="h-modules"><span className="step">3</span>{t('step.modules')}</h2>
              <ModuleList modules={modules} enabled={selection.modules} sources={catalog.sources} excluded={selection.excluded} onToggle={(id) => setSelection(toggleModule(selection, id, catalog))} onToggleSource={(id) => setSelection(toggleSource(selection, id))} />
              {riskyOn && (
                <p className="hint">
                  {t('risk.hint')}{' '}
                  <button type="button" className="link inline" onClick={switchOffRisky}>{t('risk.off')}</button>
                </p>
              )}
            </section>

            <Advanced allow={allowText} deny={denyText} onAllow={setAllowText} onDeny={setDenyText} />
          </div>

          <aside className="result" id="your-list" aria-labelledby="h-result">
            <h2 id="h-result">{t('result.title')}</h2>
            {empty ? (
              <p className="muted">{t('result.empty')}</p>
            ) : (
              <>
                <p className="summary">{summary}{matched ? ` · ${formatBytes(matched.bytes)}` : ''}</p>
                <p className={`kind ${matched ? 'kind-perm' : 'kind-custom'}`}>
                  <span className="dot" aria-hidden="true" />
                  {matched ? t('result.perm') : hasExtras ? t('result.custom') : guideUrls.length > 1 ? t('result.addr.many', { n: guideUrls.length }) : t('result.addr.one')}
                </p>
                {!matched && (
                  <p className="hint">
                    {hasExtras ? t('result.hint.extras') : t('result.hint.multi')}
                  </p>
                )}
                <ul className="addrs">
                  {guideUrls.map((u) => (
                    <li key={u.url}>
                      {guideUrls.length > 1 && <span className="addr-name">{u.label}</span>}
                      <div className="addr">
                        <code title={u.url}>{u.url}</code>
                        <CopyButton text={u.url} label={t('copy.address', { name: u.label })} />
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="actions">
                  {matched ? (
                    <a className="btn btn-primary" href={url(matched.file)} download={`${matched.id}.txt`}>{t('result.download')}</a>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={onDownload}>
                      {busy ? t('result.preparing') : t('result.download')}
                    </button>
                  )}
                  <CopyButton text={shareUrl} label={t('result.share.label')} caption={t('result.share')} className="btn-secondary" />
                  <button type="button" className="btn btn-secondary" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>
                    {previewOpen ? t('result.preview.hide') : t('result.preview')}
                  </button>
                </div>
                <p className="hint">{t('result.share.hint')}</p>
                {loadError && <p className="note" role="alert">{loadError}</p>}
                {previewOpen && (
                  <div className="preview" aria-live="polite">
                    {preview ? (
                      <>
                        <pre tabIndex={0}>{preview.lines.map((d) => `0.0.0.0 ${d}`).join('\n')}</pre>
                        <p className="hint">{t('result.preview.first', { n: preview.lines.length, total: preview.total != null ? number(preview.total) : '…' })}</p>
                      </>
                    ) : (
                      <p className="muted" role="status">{t('result.preview.loading')}</p>
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
            <h2 id="h-help">{t('help.title')}</h2>
            <ul className="help-list">
              {reportUrl && (
                <li>
                  <div>
                    <strong>{t('help.broken')}</strong>
                    <p className="muted">{t('help.broken.desc')}</p>
                  </div>
                  <a className="btn btn-secondary" href={reportUrl} target="_blank" rel="noreferrer noopener">{t('help.broken.cta')}</a>
                </li>
              )}
              {suggestUrl && (
                <li>
                  <div>
                    <strong>{t('help.suggest')}</strong>
                    <p className="muted">{t('help.suggest.desc')}</p>
                  </div>
                  <a className="btn btn-secondary" href={suggestUrl} target="_blank" rel="noreferrer noopener">{t('help.suggest.cta')}</a>
                </li>
              )}
            </ul>
            <p className="hint">{t('help.note')}</p>
          </section>
        )}

        <footer className="foot">
          <p>
            {t('foot.built', { time: Number.isNaN(built.getTime()) ? catalog.build.time : built.toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) })}{' '}
            <span className="mono">{catalog.build.version}</span> · <a href={url('data/catalog.json')}>catalog.json</a> ·{' '}
            <a href={url('data/stats.json')}>stats.json</a>
            {wikiUrl && <> · <a href={wikiUrl}>Wiki</a></>}
            {repo && <> · <a href={`https://github.com/${repo}`}>GitHub</a></>}
          </p>
          <p><Rich text={t('foot.note')} /></p>
        </footer>
      </main>

      <div className="dock" role="region" aria-label={t('dock.label')}>
        <span className="dock-text">{empty ? t('dock.none') : summary}</span>
        <a className="btn btn-primary" href="#your-list">{t('dock.cta')}</a>
      </div>
    </>
  )
}
