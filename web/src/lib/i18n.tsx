import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ModuleEntry, ProfileEntry, Risk } from './types'
import { en } from './messages.en'
import { de, deContent } from './messages.de'

export type Lang = 'en' | 'de'
export type Messages = Record<keyof typeof en, string>

const DICT: Record<Lang, Messages> = { en, de }

export function detectLang(stored: string | null, navigatorLang: string): Lang {
  if (stored === 'en' || stored === 'de') return stored
  return navigatorLang.toLowerCase().startsWith('de') ? 'de' : 'en'
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text
}

interface I18n {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: keyof typeof en, vars?: Record<string, string | number>) => string
  /** Localised copy of catalog content (descriptions, risk texts); falls back to the catalog's English. */
  content: {
    name: (e: { id: string; name: string }) => string
    description: (e: ModuleEntry | ProfileEntry) => string
    risk: (e: ModuleEntry) => Risk | null
  }
  number: (n: number) => string
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (initial) return initial
    let stored: string | null = null
    try { stored = localStorage.getItem('ubl-lang') } catch { /* storage unavailable */ }
    return detectLang(stored, navigator.language || 'en')
  })
  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    document.documentElement.lang = l
    try { localStorage.setItem('ubl-lang', l) } catch { /* ignore */ }
  }, [])
  const value = useMemo<I18n>(() => {
    document.documentElement.lang = lang
    return {
      lang,
      setLang,
      t: (key, vars) => interpolate(DICT[lang][key] ?? en[key], vars),
      content: {
        name: (e) => (lang === 'de' ? deContent.name[e.id] : undefined) ?? e.name,
        description: (e) => (lang === 'de' ? deContent.description[e.id] : undefined) ?? e.description,
        risk: (e) => (e.risk ? { level: e.risk.level, text: (lang === 'de' ? deContent.risk[e.id] : undefined) ?? e.risk.text } : null),
      },
      number: (n) => new Intl.NumberFormat(lang).format(n),
    }
  }, [lang, setLang])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Tiny inline markup for messages: **bold**, _emphasis_, `code`. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p.startsWith('_') && p.length > 2 ? <em key={i}>{p.slice(1, -1)}</em>
        : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code>
        : p,
      )}
    </>
  )
}

export function useI18n(): I18n {
  const v = useContext(Ctx)
  if (!v) throw new Error('useI18n outside I18nProvider')
  return v
}
