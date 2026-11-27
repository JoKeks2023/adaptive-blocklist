const PREFIX = '0.0.0.0 '

/** Extract the domains from a published list file (hosts format, `#` comments). */
export function parseHostsList(text: string): string[] {
  const out: string[] = []
  for (const line of text.split('\n')) {
    if (line.startsWith(PREFIX)) out.push(line.slice(PREFIX.length).trim())
  }
  return out
}

/** Union + dedupe + deterministic sort (same order as the Python builder). */
export function mergeDomains(lists: string[][]): string[] {
  const set = new Set<string>()
  for (const list of lists) for (const d of list) set.add(d)
  return [...set].sort()
}

export function renderCustomList(domains: string[], moduleNames: string[], buildTime: string, commit: string): string {
  return [
    '# Title: Universal Blocklist - Custom configuration',
    `# Modules: ${moduleNames.join(', ')}`,
    `# Domains: ${domains.length}`,
    `# Source data build: ${buildTime} (${commit})`,
    '# Generated in your browser from the published module lists.',
    '# This file has no permanent subscription URL - re-download it to update,',
    '# or subscribe to the individual module URLs instead.',
    '# Format: hosts (0.0.0.0 <domain>); exact-domain entries, no wildcard semantics',
    '#',
    ...domains.map((d) => PREFIX + d),
    '',
  ].join('\n')
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat('en').format(n)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
