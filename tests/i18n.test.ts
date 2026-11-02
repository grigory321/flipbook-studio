import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ERASER_SETS, PAINT_SETS, PEN_SETS } from '../src/app/pens.ts'
import { builtinTools } from '../src/app/tools.ts'
import { SOUND_PRESETS } from '../src/audio/presets.ts'
import { DEVICE_PATTERNS } from '../src/core/patterns.ts'
import { en } from '../src/i18n/en.ts'
import { es } from '../src/i18n/es.ts'
import { fr } from '../src/i18n/fr.ts'
import {
  detectLanguage,
  language,
  plural,
  setLanguage,
} from '../src/i18n/index.ts'
import { ja } from '../src/i18n/ja.ts'
import { ru } from '../src/i18n/ru.ts'

const DICTIONARIES = { en, es, fr, ru }

test('言語: 端末の言語を選び、対応外は日本語にする', () => {
  assert.equal(detectLanguage(['ru-RU', 'en']), 'ru')
  assert.equal(detectLanguage(['fr-CA']), 'fr')
  assert.equal(detectLanguage(['es-419']), 'es')
  assert.equal(detectLanguage(['en-GB']), 'en')
  assert.equal(detectLanguage(['ko-KR', 'de-DE']), 'ja')
  assert.equal(detectLanguage(['ko-KR', 'fr-FR']), 'fr')
  assert.equal(detectLanguage([]), 'ja')
})

test('言語: すべての言語にすべての文がある', () => {
  for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
    const texts = new Map(Object.entries(dictionary))

    for (const key of Object.keys(ja)) {
      assert.ok(texts.has(key), `${name} に ${key} がない`)
      assert.notEqual(texts.get(key), '', `${name} の ${key} が空`)
    }
  }
})

test('言語: 差しこみの名前がそろっている', () => {
  const holes = (text: string): string[] =>
    (text.match(/\{\w+\}/g) ?? []).sort()

  for (const [name, dictionary] of Object.entries(DICTIONARIES)) {
    const texts = new Map(Object.entries(dictionary))

    for (const [key, text] of Object.entries(ja)) {
      assert.deepEqual(
        holes(texts.get(key) ?? ''),
        holes(text),
        `${name}: ${key}`,
      )
    }
  }
})

test('言語: ペン、もよう、音、道具の名前がすべて辞書にある', () => {
  const specs = [PEN_SETS, ERASER_SETS, PAINT_SETS].flatMap(sets =>
    Object.values(sets).flat(),
  )
  const keys = [
    ...specs.map(spec => spec.nameKey),
    ...DEVICE_PATTERNS.flatMap(pattern => pattern.nameKey ?? []),
    ...SOUND_PRESETS.flatMap(preset => preset.nameKey ?? []),
    ...builtinTools().flatMap(tool => tool.nameKey ?? []),
  ]
  const known = new Set(Object.keys(ja))

  for (const key of keys) assert.ok(known.has(key), `辞書にない: ${key}`)
})

test('言語: ロシア語は数で語形が変わる', () => {
  setLanguage('ru')

  assert.equal(plural('common.pages', 1), '1 страница')
  assert.equal(plural('common.pages', 3), '3 страницы')
  assert.equal(plural('common.pages', 5), '5 страниц')
  assert.equal(plural('common.pages', 21), '21 страница')

  setLanguage('en')

  assert.equal(plural('common.pages', 1), '1 page')
  assert.equal(plural('common.pages', 2), '2 pages')

  setLanguage('ja')

  assert.equal(plural('common.pages', 2), '2 ページ')
  assert.equal(language.peek(), 'ja')
})
