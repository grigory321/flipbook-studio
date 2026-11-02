import assert from 'node:assert/strict'
import { test } from 'node:test'

import { toDots } from '../src/app/image-dots.ts'
import { scaleDots, styleGlyphs } from '../src/app/text-art.ts'
import { edgeMask } from '../src/draw/edge.ts'

test('画像: 明るさで点になり、線画は輪郭だけ残る', () => {
  const size = 16
  const rgba = new Uint8ClampedArray(size * size * 4)

  for (let index = 0; index < size * size; index++) {
    const shade = index % size < size / 2 ? 0 : 255

    rgba.fill(shade, index * 4, index * 4 + 3)
    rgba[index * 4 + 3] = 255
  }

  const options = { level: 50, dithers: false }
  const tone = toDots(rgba, size, size, { ...options, mode: 'tone' }, 1, [])

  assert.equal(tone[0], 1)
  assert.equal(tone[size - 1], 0)

  const line = toDots(rgba, size, size, { ...options, mode: 'line' }, 1, [])

  assert.equal(line[size + 1], 0)
  assert.ok(line[size + size / 2 - 1] || line[size + size / 2])

  const colors = toDots(rgba, size, size, { ...options, mode: 'color' }, 1, [
    [0, 0, 0],
    [255, 255, 255],
  ])

  assert.equal(colors[0], 1)
  assert.equal(colors[size - 1], 2)
})

test('文字: 縁は文字の外側だけに付く', () => {
  const size = 9
  const mask = new Uint8Array(size * size)

  mask[4 * size + 4] = 1

  const edge = edgeMask(mask, size, size, 1)

  assert.equal(edge[4 * size + 4], 0)
  assert.equal(edge[4 * size + 3], 1)
  assert.equal(edge[3 * size + 4], 1)
  assert.equal(edge[0], 0)
})

test('文字: 縁取りは縁を別の色に、袋文字は中を別の色にする', () => {
  const size = 9
  const mask = new Uint8Array(size * size)

  mask[4 * size + 4] = 1

  const edge = { width: 1, second: 2 }
  const outline = styleGlyphs(
    mask,
    size,
    size,
    { ...edge, style: 'outline' },
    1,
  )
  const hollow = styleGlyphs(mask, size, size, { ...edge, style: 'hollow' }, 1)
  const plain = styleGlyphs(mask, size, size, { ...edge, style: 'none' }, 1)

  assert.equal(outline[4 * size + 4], 1)
  assert.equal(outline[4 * size + 3], 2)
  assert.equal(hollow[4 * size + 4], 2)
  assert.equal(hollow[4 * size + 3], 1)
  assert.equal(plain[4 * size + 3], 0)
})

test('文字: ドットは点を整数倍の四角に広げる', () => {
  const scaled = scaleDots(Uint8Array.from([1, 0, 0, 2]), 2, 2, 2)

  assert.deepEqual(
    [...scaled],
    [1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 2, 2, 0, 0, 2, 2],
  )
})
