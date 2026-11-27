/** Own allow/deny domains, applied in the browser to custom downloads only. */
const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/

export interface ParsedDomains {
  valid: string[]
  invalid: string[]
}

export function parseDomainLines(text: string): ParsedDomains {
  const valid = new Set<string>()
  const invalid: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.split('#')[0].trim().toLowerCase().replace(/\.$/, '')
    if (!line) continue
    if (DOMAIN_RE.test(line)) valid.add(line)
    else invalid.push(line.slice(0, 60))
  }
  return { valid: [...valid], invalid }
}

/** Remove allowed domains (and their subdomains), add denied ones, dedupe, sort. */
export function applyExtras(domains: string[], allow: string[], deny: string[]): string[] {
  const allowSet = new Set(allow)
  const blocked = (d: string): boolean => {
    for (let pos = -1; ; pos = d.indexOf('.', pos + 1)) {
      const candidate = pos === -1 ? d : d.slice(pos + 1)
      if (!candidate.includes('.')) return false
      if (allowSet.has(candidate)) return true
      if (pos === -1 && d.indexOf('.') === -1) return false
    }
  }
  const out = new Set<string>()
  for (const d of domains) if (!allowSet.size || !blocked(d)) out.add(d)
  for (const d of deny) if (!allowSet.has(d)) out.add(d)
  return [...out].sort()
}
