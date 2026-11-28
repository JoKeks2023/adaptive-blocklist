import type { Catalog, ModuleEntry, ProfileEntry, Selection } from './types'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

export const vendorsOf = (catalog: Catalog): ModuleEntry[] => catalog.vendors ?? []

/** Keep catalog order, drop unknown ids and duplicates. */
function sanitize(ids: string[], known: ModuleEntry[]): string[] {
  const wanted = new Set(ids)
  return known.map((m) => m.id).filter((id) => wanted.has(id))
}
const mods = (ids: string[], catalog: Catalog) => sanitize(ids, catalog.modules)
const vends = (ids: string[], catalog: Catalog) => sanitize(ids, vendorsOf(catalog))

function fromProfile(profile: ProfileEntry, catalog: Catalog): Selection {
  return { profileId: profile.id, modules: mods(profile.modules, catalog), vendors: vends(profile.vendors ?? [], catalog), excluded: [] }
}

export function defaultSelection(catalog: Catalog): Selection {
  return fromProfile(catalog.profiles[0], catalog)
}

export function selectProfile(profileId: string, catalog: Catalog): Selection {
  return fromProfile(catalog.profiles.find((p) => p.id === profileId) ?? catalog.profiles[0], catalog)
}

/**
 * Parse `?p=<profile>&m=<a,b>&v=<x,y>`. Everything is validated against the catalog, so a
 * hand-edited or outdated link can never select something that does not exist. A missing
 * `m` / `v` means "as in the profile"; an empty value means "none".
 */
export function parseShareParams(search: string, catalog: Catalog): Selection {
  const params = new URLSearchParams(search)
  const base = selectProfile(params.get('p') ?? '', catalog)
  const m = params.get('m')
  const v = params.get('v')
  const x = params.get('x')
  const known = new Set(catalog.sources.map((s) => s.id))
  return {
    profileId: base.profileId,
    modules: m === null ? base.modules : mods(m.split(',').filter(Boolean), catalog),
    vendors: v === null ? base.vendors : vends(v.split(',').filter(Boolean), catalog),
    excluded: x === null ? [] : [...new Set(x.split(',').filter((id) => known.has(id)))],
  }
}

/** Inverse of parseShareParams; `m` / `v` are only emitted when they differ from the profile. */
export function serializeSelection(sel: Selection, catalog: Catalog): string {
  const params = new URLSearchParams({ p: sel.profileId })
  const base = selectProfile(sel.profileId, catalog)
  if (!sameSet(sel.modules, base.modules)) params.set('m', sel.modules.join(','))
  if (!sameSet(sel.vendors, base.vendors)) params.set('v', sel.vendors.join(','))
  if (sel.excluded.length > 0) params.set('x', sel.excluded.join(','))
  return params.toString().replace(/%2C/g, ',')
}

/** The published profile whose modules and vendors equal the selection exactly, if any. */
export function matchingProfile(sel: Selection, catalog: Catalog): ProfileEntry | null {
  return (
    catalog.profiles.find((p) => {
      const s = fromProfile(p, catalog)
      return sameSet(sel.modules, s.modules) && sameSet(sel.vendors, s.vendors) && activeExclusions(sel, catalog).length === 0
    }) ?? null
  )
}

export function toggleModule(sel: Selection, id: string, catalog: Catalog): Selection {
  const next = sel.modules.includes(id) ? sel.modules.filter((m) => m !== id) : [...sel.modules, id]
  return { ...sel, modules: mods(next, catalog) }
}

export function toggleSource(sel: Selection, id: string): Selection {
  return { ...sel, excluded: sel.excluded.includes(id) ? sel.excluded.filter((x) => x !== id) : [...sel.excluded, id] }
}

const hasList = (catalog: Catalog, id: string) => !!catalog.sources.find((s) => s.id === id)?.file

/** Excluded sources that actually matter: they sit in an enabled module and have their own list. */
export function activeExclusions(sel: Selection, catalog: Catalog): string[] {
  const inEnabled = new Set(catalog.modules.filter((m) => sel.modules.includes(m.id)).flatMap((m) => m.sources))
  return sel.excluded.filter((id) => inEnabled.has(id) && hasList(catalog, id))
}

/** Sources of a module that stay on after exclusions. */
const remainingSources = (m: ModuleEntry, sel: Selection) => m.sources.filter((s) => !sel.excluded.includes(s))

/**
 * A module with some sources switched off is replaced by one list per remaining source.
 * Returns null when the module is used unchanged.
 */
function sourceParts(m: ModuleEntry, sel: Selection, catalog: Catalog): ModuleEntry[] | null {
  if (m.include_deny || !m.sources.some((s) => sel.excluded.includes(s) && hasList(catalog, s))) return null
  return remainingSources(m, sel).flatMap((id) => {
    const s = catalog.sources.find((x) => x.id === id)
    if (!s?.file) return []
    return [{ ...m, id: `${m.id}:${id}`, name: s.name, description: s.purpose, domains: s.listed ?? s.domains, file: s.file, bytes: s.bytes ?? 0, sources: [id], pending_sources: [] }]
  })
}

export function toggleVendor(sel: Selection, id: string, catalog: Catalog): Selection {
  const next = sel.vendors.includes(id) ? sel.vendors.filter((v) => v !== id) : [...sel.vendors, id]
  return { ...sel, vendors: vends(next, catalog) }
}

/**
 * Vendors whose sources are all already part of an enabled module (e.g. Telemetry contains
 * every vendor's list). Maps vendor id -> name of the covering module.
 */
export function coveredVendors(sel: Selection, catalog: Catalog): Map<string, string> {
  const covered = new Map<string, string>()
  const enabled = catalog.modules.filter((m) => sel.modules.includes(m.id))
  for (const v of vendorsOf(catalog)) {
    if (v.sources.length === 0) continue
    const by = enabled.find((m) => v.sources.every((s) => remainingSources(m, sel).includes(s)))
    if (by) covered.set(v.id, by.name)
  }
  return covered
}

/** Everything that actually has to be fetched/merged: enabled modules + vendors not covered by a module. */
export function effectiveItems(sel: Selection, catalog: Catalog): ModuleEntry[] {
  const covered = coveredVendors(sel, catalog)
  const all = [
    ...catalog.modules.filter((m) => sel.modules.includes(m.id)).flatMap((m) => sourceParts(m, sel, catalog) ?? [m]),
    ...vendorsOf(catalog).filter((v) => sel.vendors.includes(v.id) && !covered.has(v.id)),
  ]
  const seen = new Set<string>()
  return all.filter((i) => !seen.has(i.file) && !!seen.add(i.file))
}

export interface Address {
  label: string
  file: string
  domains: number
}

export interface Plan {
  /** profile: one published profile list; bundle: a profile list plus brand lists; parts: individual lists. */
  kind: 'profile' | 'bundle' | 'parts'
  addresses: Address[]
  /** Domains if exact (profile), otherwise an upper bound before de-duplication. */
  domains: number
  exact: boolean
}

/**
 * Which permanent addresses a DNS filter has to subscribe to for this selection.
 * Prefers the fewest addresses: a published profile, then "profile + brand lists", then single lists.
 */
export function planAddresses(sel: Selection, catalog: Catalog): Plan {
  const exact = matchingProfile(sel, catalog)
  if (exact) return { kind: 'profile', addresses: [{ label: exact.name, file: exact.file, domains: exact.domains }], domains: exact.domains, exact: true }

  const covered = coveredVendors(sel, catalog)
  const vendors = vendorsOf(catalog).filter((v) => sel.vendors.includes(v.id) && !covered.has(v.id))
  const base =
    [catalog.profiles.find((p) => p.id === sel.profileId), ...catalog.profiles].find(
      (p) => p && sameSet(sel.modules, mods(p.modules, catalog)) && (p.vendors ?? []).every((v) => sel.vendors.includes(v)),
    ) ?? null
  if (base && vendors.length > 0 && activeExclusions(sel, catalog).length === 0) {
    const own = new Set(base.vendors ?? [])
    const extra = vendors.filter((v) => !own.has(v.id))
    const addresses = [{ label: `${base.name} base`, file: base.file, domains: base.domains }, ...extra.map((v) => ({ label: v.name, file: v.file, domains: v.domains }))]
    return { kind: 'bundle', addresses, domains: addresses.reduce((n, a) => n + a.domains, 0), exact: false }
  }
  const items = effectiveItems(sel, catalog)
  return { kind: 'parts', addresses: items.map((i) => ({ label: i.name, file: i.file, domains: i.domains })), domains: items.reduce((n, i) => n + i.domains, 0), exact: false }
}
