import { Signal } from '../core/signal.ts'
import { en } from './en.ts'
import { es } from './es.ts'
import { fr } from './fr.ts'
import { ja, type Messages } from './ja.ts'
import { ru } from './ru.ts'

export type Language = 'ja' | 'en' | 'es' | 'fr' | 'ru'

export const LANGUAGES: readonly { id: Language; name: string }[] = [
  { id: 'ja', name: '日本語' },
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'ru', name: 'Русский' },
]

export type MessageKey = keyof Messages

const DICTIONARIES: Readonly<Record<Language, Messages>> = {
  ja,
  en,
  es,
  fr,
  ru,
}

const DEFAULT_LANGUAGE: Language = 'ja'

const LOOKUPS = new Map<Language, ReadonlyMap<string, string>>()

function lookupOf(id: Language): ReadonlyMap<string, string> {
  let lookup = LOOKUPS.get(id)

  if (!lookup) {
    lookup = new Map(Object.entries(DICTIONARIES[id]))
    LOOKUPS.set(id, lookup)
  }

  return lookup
}

export function detectLanguage(
  languages: readonly string[] = navigatorLanguages(),
): Language {
  for (const tag of languages) {
    const prefix = tag.toLowerCase().split('-')[0]
    const found = LANGUAGES.find(choice => choice.id === prefix)

    if (found) return found.id
  }

  return DEFAULT_LANGUAGE
}

function navigatorLanguages(): readonly string[] {
  return typeof navigator === 'undefined' ? [] : navigator.languages
}

export const language = new Signal<Language>(DEFAULT_LANGUAGE)

export function setLanguage(next: Language): void {
  language.value = next

  if (typeof document !== 'undefined') {
    document.documentElement.lang = next
    document.title = t('app.windowTitle')
  }
}

type Params = Readonly<Record<string, string | number>>

export function t(key: string, params?: Params): string {
  const message =
    lookupOf(language.peek()).get(key) ?? lookupOf('ja').get(key) ?? key

  if (!params) return message

  return message.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  )
}

export function plural(key: string, count: number): string {
  const rules = new Intl.PluralRules(language.peek())
  const form = `${key}.${rules.select(count)}`
  const chosen = lookupOf(language.peek()).has(form) ? form : `${key}.other`

  return t(chosen, { n: count })
}

export function formatDate(time: number): string {
  return new Intl.DateTimeFormat(language.peek(), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(time)
}
