import { readResult, requestResult } from '../file/idb.ts'

export interface FontChoice {
  name: string
  nameKey?: string
  family: string
  isFile?: boolean
}

export const BASIC_FONTS: readonly FontChoice[] = [
  {
    name: 'round',
    nameKey: 'text.font.round',
    family: `"Zen Maru Gothic", "Hiragino Maru Gothic ProN", sans-serif`,
  },
  {
    name: 'gothic',
    nameKey: 'text.font.gothic',
    family: `"Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif`,
  },
  {
    name: 'mincho',
    nameKey: 'text.font.mincho',
    family: `"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif`,
  },
  {
    name: 'hand',
    nameKey: 'text.font.hand',
    family: `"Segoe Print", "Comic Sans MS", "Klee One", cursive`,
  },
]

const DB_NAME = 'flipbook-fonts'
const STORE = 'fonts'
const FILE_PREFIX = 'ugoku-font-'
const PROBE_TEXT = 'あAgW漢'
const PROBE_FONT_SIZE = 40

function openFontStore(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, 1)

  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE)
  }

  return requestResult(request)
}

function fileFamily(name: string): string {
  return `"${FILE_PREFIX}${name}"`
}

function fileChoice(name: string): FontChoice {
  return { name, family: fileFamily(name), isFile: true }
}

const registered = new Set<string>()

async function registerFace(name: string, data: ArrayBuffer): Promise<void> {
  const face = new FontFace(`${FILE_PREFIX}${name}`, data)

  await face.load()
  document.fonts.add(face)
  registered.add(name)
}

export async function fileFonts(): Promise<FontChoice[]> {
  try {
    const database = await openFontStore()
    const store = database.transaction(STORE).objectStore(STORE)
    const names = await requestResult(store.getAllKeys())

    database.close()

    return names.map(name => fileChoice(String(name)))
  } catch {
    return []
  }
}

export async function addFontFile(file: File): Promise<FontChoice> {
  const name = file.name.replace(/\.[^.]+$/, '').replace(/["\\]/g, '')
  const data = await file.arrayBuffer()

  await registerFace(name, data.slice(0))

  try {
    const database = await openFontStore()
    const store = database.transaction(STORE, 'readwrite').objectStore(STORE)

    await requestResult(store.put(data, name))
    database.close()
  } catch {}

  return fileChoice(name)
}

export async function removeFontFile(font: FontChoice): Promise<void> {
  const database = await openFontStore()
  const store = database.transaction(STORE, 'readwrite').objectStore(STORE)

  await requestResult(store.delete(font.name))
  database.close()
}

export async function prepareFont(
  font: FontChoice,
  css: string,
): Promise<void> {
  if (font.isFile && !registered.has(font.name)) {
    const database = await openFontStore()
    const store = database.transaction(STORE).objectStore(STORE)
    const data = await readResult(store.get(font.name))

    database.close()

    if (data instanceof ArrayBuffer) await registerFace(font.name, data)
  }

  await document.fonts.load(css).catch(() => [])
}

interface LocalFont {
  family: string
}

declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFont[]>
  }
}

export function canListDeviceFonts(): boolean {
  return typeof window.queryLocalFonts === 'function'
}

export async function deviceFonts(): Promise<FontChoice[]> {
  const fonts = await window.queryLocalFonts?.()
  const names = [...new Set((fonts ?? []).map(font => font.family))]

  return names.sort().map(name => ({ name, family: `"${name}"` }))
}

export function isFontInstalled(name: string): boolean {
  const context = new OffscreenCanvas(1, 1).getContext('2d')

  if (!context) return false

  const measure = (family: string): number => {
    context.font = `${PROBE_FONT_SIZE}px ${family}`

    return context.measureText(PROBE_TEXT).width
  }

  return ['serif', 'sans-serif'].some(
    fallback => measure(`"${name}", ${fallback}`) !== measure(fallback),
  )
}
