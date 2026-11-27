/**
 * Resolve published files relative to the directory the page is served from.
 * Works for GitHub Pages project pages (/repo/), custom domains (/) and
 * `vite preview`, without any hardcoded root paths.
 */
export function siteBase(href: string): URL {
  const url = new URL('.', href) // drops file name, query and hash
  return url
}

export function absoluteUrl(path: string, base: URL): string {
  return new URL(path, base).toString()
}

/** Prefilled GitHub issue-form URL (field ids match .github/ISSUE_TEMPLATE/*.yml). */
export function issueUrl(repository: string | undefined, template: string, fields: Record<string, string>): string | null {
  if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) return null
  const params = new URLSearchParams({ template, ...fields })
  return `https://github.com/${repository}/issues/new?${params.toString()}`
}
