import type { Catalog, ProfileEntry, Selection } from './types'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** Keep catalog order, drop unknown ids and duplicates. */
function sanitize(ids: string[], catalog: Catalog): string[] {
  const known = new Set(catalog.modules.map((m) => m.id))
  const wanted = new Set(ids.filter((id) => known.has(id)))
  return catalog.modules.map((m) => m.id).filter((id) => wanted.has(id))
}

export function defaultSelection(catalog: Catalog): Selection {
  const profile = catalog.profiles[0]
  return { profileId: profile.id, modules: sanitize(profile.modules, catalog) }
}

/**
 * Parse `?p=<profile>&m=<a,b,c>`. Everything is validated against the catalog,
 * so a hand-edited or outdated link can never select something that does not exist.
 */
export function parseShareParams(search: string, catalog: Catalog): Selection {
  const params = new URLSearchParams(search)
  const profile = catalog.profiles.find((p) => p.id === params.get('p')) ?? catalog.profiles[0]
  const raw = params.get('m')
  if (raw === null) return { profileId: profile.id, modules: sanitize(profile.modules, catalog) }
  const modules = sanitize(raw.split(',').filter(Boolean), catalog)
  return { profileId: profile.id, modules }
}

/** Inverse of parseShareParams; `m` is only emitted when it differs from the profile. */
export function serializeSelection(sel: Selection, catalog: Catalog): string {
  const params = new URLSearchParams({ p: sel.profileId })
  const profile = catalog.profiles.find((p) => p.id === sel.profileId)
  if (!profile || !sameSet(sel.modules, sanitize(profile.modules, catalog))) {
    params.set('m', sel.modules.join(','))
  }
  return params.toString().replace(/%2C/g, ',')
}

/** The published profile whose module set equals the selection exactly, if any. */
export function matchingProfile(sel: Selection, catalog: Catalog): ProfileEntry | null {
  return catalog.profiles.find((p) => sameSet(sel.modules, sanitize(p.modules, catalog))) ?? null
}

export function toggleModule(sel: Selection, id: string, catalog: Catalog): Selection {
  const next = sel.modules.includes(id) ? sel.modules.filter((m) => m !== id) : [...sel.modules, id]
  return { ...sel, modules: sanitize(next, catalog) }
}

export function selectProfile(profileId: string, catalog: Catalog): Selection {
  const profile = catalog.profiles.find((p) => p.id === profileId) ?? catalog.profiles[0]
  return { profileId: profile.id, modules: sanitize(profile.modules, catalog) }
}
