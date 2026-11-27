import type { Catalog } from './types'

export async function fetchCatalog(base: URL): Promise<Catalog> {
  const res = await fetch(new URL('data/catalog.json', base), { cache: 'no-cache' })
  if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`)
  const data = (await res.json()) as Catalog
  if (data.schema_version !== 1) throw new Error(`Unsupported catalog schema ${data.schema_version}`)
  return data
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.text()
}

/** Read only the first ~maxBytes of a (possibly 10 MB) list for the preview. */
export async function fetchHead(url: string, maxBytes: number): Promise<string> {
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let received = 0
  while (received < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel()
  return text
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export function downloadBlob(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
