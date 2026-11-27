import { describe, expect, it } from 'vitest'
import { mergeDomains, parseHostsList, renderCustomList } from './lists'
import { coveredVendors, defaultSelection, effectiveItems, matchingProfile, parseShareParams, selectProfile, serializeSelection, toggleModule, toggleVendor } from './state'
import { absoluteUrl, issueUrl, siteBase } from './urls'
import type { Catalog } from './types'

const mod = (id: string) => ({
  id, name: id, description: '', risk: null, domains: 1, file: `lists/modules/${id}.txt`,
  bytes: 1, sources: [], pending_sources: [], include_deny: false,
})
const vend = (id: string, sources: string[]) => ({ ...mod(id), file: `lists/vendors/${id}.txt`, sources })
const catalog: Catalog = {
  schema_version: 1,
  build: { time: 't', commit: 'c', version: 'v', status: 'ok', generator: 'g' },
  modules: [...['advertising', 'tracking', 'malware'].map(mod), { ...mod('telemetry'), sources: ['s-acme', 's-globex'] }],
  vendors: [vend('acme', ['s-acme']), vend('globex', ['s-globex']), vend('initech', ['s-initech'])],
  profiles: [
    { id: 'desktop', name: 'Desktop', description: '', modules: ['advertising', 'tracking', 'telemetry', 'malware'], domains: 4, file: 'lists/profiles/desktop.txt', bytes: 1 },
    { id: 'lite', name: 'Lite', description: '', modules: ['advertising', 'malware'], domains: 2, file: 'lists/profiles/lite.txt', bytes: 1 },
    { id: 'tv', name: 'TV', description: '', modules: ['malware'], vendors: ['acme', 'globex'], domains: 2, file: 'lists/profiles/tv.txt', bytes: 1 },
  ],
  sources: [],
}

describe('share links', () => {
  it('defaults to the first profile with all its modules', () => {
    expect(parseShareParams('', catalog)).toEqual(defaultSelection(catalog))
  })
  it('round-trips a custom selection', () => {
    const sel = toggleModule(defaultSelection(catalog), 'telemetry', catalog)
    const qs = serializeSelection(sel, catalog)
    expect(qs).toBe('p=desktop&m=advertising,tracking,malware')
    expect(parseShareParams(`?${qs}`, catalog)).toEqual(sel)
  })
  it('omits m for an unmodified profile', () => {
    expect(serializeSelection(selectProfile('lite', catalog), catalog)).toBe('p=lite')
  })
  it('ignores unknown profiles and modules instead of trusting the URL', () => {
    const sel = parseShareParams('?p=evil&m=advertising,__proto__,nope,malware', catalog)
    expect(sel.profileId).toBe('desktop')
    expect(sel.modules).toEqual(['advertising', 'malware'])
  })
  it('supports an explicitly empty selection', () => {
    expect(parseShareParams('?p=desktop&m=', catalog).modules).toEqual([])
  })
})

describe('profile matching', () => {
  it('detects a published profile regardless of the profile it started from', () => {
    const sel = { profileId: 'desktop', modules: ['advertising', 'malware'], vendors: [] }
    expect(matchingProfile(sel, catalog)?.id).toBe('lite')
  })
  it('returns null for custom combinations (no permanent URL)', () => {
    expect(matchingProfile({ profileId: 'desktop', modules: ['tracking'], vendors: [] }, catalog)).toBeNull()
  })
})

describe('lists', () => {
  it('parses only hosts lines and ignores comments', () => {
    expect(parseHostsList('# c\n0.0.0.0 a.com\n\n0.0.0.0 b.com\ngarbage\n')).toEqual(['a.com', 'b.com'])
  })
  it('merges, dedupes and sorts', () => {
    expect(mergeDomains([['b.com', 'a.com'], ['a.com', 'c.com']])).toEqual(['a.com', 'b.com', 'c.com'])
  })
  it('custom file is labelled as not subscribable', () => {
    expect(renderCustomList(['a.com'], ['Tracking'], 't', 'c')).toMatch(/no permanent subscription URL/)
  })
})

describe('urls', () => {
  it('resolves relative to GitHub Pages project pages', () => {
    const base = siteBase('https://user.github.io/repo/?p=desktop#x')
    expect(absoluteUrl('lists/profiles/desktop.txt', base)).toBe('https://user.github.io/repo/lists/profiles/desktop.txt')
  })
  it('works with index.html and custom domains', () => {
    expect(absoluteUrl('data/catalog.json', siteBase('https://user.github.io/repo/index.html'))).toBe('https://user.github.io/repo/data/catalog.json')
    expect(absoluteUrl('data/catalog.json', siteBase('https://example.org/'))).toBe('https://example.org/data/catalog.json')
  })
})

describe('issue links', () => {
  it('prefills the configuration and rejects malformed repositories', () => {
    const u = issueUrl('me/repo', 'broken-service.yml', { config: 'https://x/?p=a&m=b,c', build: '1+2' })!
    expect(u.startsWith('https://github.com/me/repo/issues/new?template=broken-service.yml')).toBe(true)
    expect(new URL(u).searchParams.get('config')).toBe('https://x/?p=a&m=b,c')
    expect(issueUrl('evil/../x?y', 't.yml', {})).toBeNull()
    expect(issueUrl(undefined, 't.yml', {})).toBeNull()
  })
})

describe('vendors', () => {
  it('profiles preselect vendors and share links carry only differences', () => {
    const tv = selectProfile('tv', catalog)
    expect(tv.vendors).toEqual(['acme', 'globex'])
    expect(serializeSelection(tv, catalog)).toBe('p=tv')
    const custom = toggleVendor(tv, 'globex', catalog)
    expect(serializeSelection(custom, catalog)).toBe('p=tv&v=acme')
    expect(parseShareParams('?p=tv&v=acme', catalog)).toEqual(custom)
    expect(parseShareParams('?p=tv&v=', catalog).vendors).toEqual([])
    expect(parseShareParams('?p=tv&v=acme,nope', catalog).vendors).toEqual(['acme'])
  })
  it('matches a profile only when vendors match as well', () => {
    expect(matchingProfile(selectProfile('tv', catalog), catalog)?.id).toBe('tv')
    expect(matchingProfile(toggleVendor(selectProfile('tv', catalog), 'initech', catalog), catalog)).toBeNull()
  })
  it('a module that contains a vendor list covers it (no double fetch)', () => {
    const sel = { profileId: 'desktop', modules: ['telemetry'], vendors: ['acme', 'initech'] }
    expect([...coveredVendors(sel, catalog).keys()].sort()).toEqual(['acme', 'globex'])
    expect(effectiveItems(sel, catalog).map((i) => i.id)).toEqual(['telemetry', 'initech'])
  })
  it('works with an old catalog that has no vendors', () => {
    const old = { ...catalog, vendors: undefined }
    expect(defaultSelection(old).vendors).toEqual([])
  })
})
