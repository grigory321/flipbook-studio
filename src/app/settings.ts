import {
  type Guard,
  isBoolean,
  isListOf,
  isNumber,
  isRecord,
  isString,
  oneOf,
  type Parse,
  parseListOf,
  parseWith,
} from '../core/guards.ts'
import { effect, Signal } from '../core/signal.ts'
import { isMyShape, type MyShapeKind } from '../draw/shapes.ts'
import { type Language, LANGUAGES } from '../i18n/index.ts'

const STORAGE_KEY = 'flipbook.settings'

export type Hand = 'right' | 'left'

export type PaperLook = 'notebook' | 'plain'

export interface StoredShape {
  id: MyShapeKind
  points: [number, number][]
}

export interface StoredPattern {
  id: string
  width: number
  height: number
  bits: number[]
}

function isPoint(value: unknown): value is [number, number] {
  return isListOf(value, isNumber) && value.length === 2
}

function isStoredShape(value: unknown): value is StoredShape {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isMyShape(value.id) &&
    isListOf(value.points, isPoint)
  )
}

function isStoredPattern(value: unknown): value is StoredPattern {
  if (!isRecord(value)) return false

  const { id, width, height, bits } = value

  return (
    isString(id) &&
    isNumber(width) &&
    isNumber(height) &&
    isListOf(bits, isNumber) &&
    bits.length === width * height
  )
}

export const ONION_MAX = 5

const parseOnion: Parse<number> = value => {
  if (isBoolean(value)) return value ? 1 : 0
  if (!isNumber(value)) return undefined

  return Math.max(0, Math.min(ONION_MAX, Math.round(value)))
}

const isLanguageChoice: Guard<Language | 'auto'> = oneOf([
  'auto',
  ...LANGUAGES.map(language => language.id),
])

function readStored(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '{}',
    )

    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const stored = readStored()

function setting<T>(name: string, parse: Parse<T>, fallback: T): Signal<T> {
  return new Signal(parse(stored[name]) ?? fallback)
}

export const settings = {
  language: setting('language', parseWith(isLanguageChoice), 'auto'),
  sfx: setting('sfx', parseWith(isBoolean), true),
  drawSounds: setting('drawSounds', parseWith(isBoolean), true),
  sfxVolume: setting('sfxVolume', parseWith(isNumber), 6),
  hand: setting('hand', parseWith(oneOf<Hand>(['right', 'left'])), 'right'),
  paperLook: setting(
    'paperLook',
    parseWith(oneOf<PaperLook>(['notebook', 'plain'])),
    'notebook',
  ),
  stabilizer: setting('stabilizer', parseWith(isNumber), 2),
  smoothLines: setting('smoothLines', parseWith(isBoolean), true),
  penPressure: setting('penPressure', parseWith(isBoolean), true),
  onionBefore: setting('onionBefore', parseOnion, 1),
  onionAfter: setting('onionAfter', parseOnion, 1),
  skipTitle: setting('skipTitle', parseWith(isBoolean), false),
  exportLines: setting('exportLines', parseWith(isBoolean), false),
  stepSounds: setting('stepSounds', parseWith(isBoolean), true),
  seenTips: setting('seenTips', parseWith(isBoolean), false),
  panelFolded: setting('panelFolded', parseWith(isBoolean), true),
  disabledPlugins: setting('disabledPlugins', parseListOf(isString), []),
  myShapes: setting('myShapes', parseListOf(isStoredShape), []),
  myPatterns: setting('myPatterns', parseListOf(isStoredPattern), []),
}

function save(): void {
  const values = Object.fromEntries(
    Object.entries(settings).map(([name, signal]) => [name, signal.value]),
  )

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values))
  } catch {}
}

export function startSavingSettings(): void {
  effect(save)
}
