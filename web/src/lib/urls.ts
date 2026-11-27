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
