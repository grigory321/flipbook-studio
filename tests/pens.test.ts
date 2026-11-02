import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { TileGrid } from '../src/core/cel.ts'
import { Compositor } from '../src/core/compositor.ts'
import {
  blendOver,
  coveredValue,
  valueCoverage,
  valueInk,
} from '../src/core/ink.ts'
import { Note } from '../src/core/note.ts'
import { Surface } from '../src/core/surface.ts'
import { EdgeTracer } from '../src/draw/edge.ts'
import { FreePen, type FreeStyle } from '../src/draw/pen-free.ts'
import { point, tool, inkOf } from './helpers.ts'

test('ペン: 画材のペンは点を打ち、紙の外で止まる', () => {
  const styles: FreeStyle[] = [
    'marker',
    'crayon',
    'chalk',
    'nib',
    'dots',
    'splatter',
    'ribbon',
  ]

  for (const style of styles) {
    const plane = new Uint8Array(64 * 64)
    const surface = new Surface(new TileGrid(64, 64), plane)
    const pen = new FreePen(surface, style, 'draw', 6)

    pen.begin(2, 30, 0.5)
    pen.move(80, 30, 0.5)
    pen.end()

    assert.ok(inkOf(plane) > 0, style)
  }
})

test('ペン: てんてんは間があき、クレヨンは塗り直しても穴が同じ', () => {
  const draw = (style: FreeStyle, passes: number): Uint8Array => {
    const plane = new Uint8Array(64 * 64)
    const surface = new Surface(new TileGrid(64, 64), plane)

    for (let pass = 0; pass < passes; pass++) {
      const pen = new FreePen(surface, style, 'draw', 4)

      pen.begin(5, 30, 0.5)
      pen.move(60, 30, 0.5)
      pen.end()
    }

    return plane
  }

  const dots = draw('dots', 1)

  assert.ok(inkOf(dots) < inkOf(draw('round', 1)))
  assert.deepEqual(draw('crayon', 1), draw('crayon', 3))
})

test('ペン: 1 ドットの線は角を残さない', () => {
  const plane = new Uint8Array(32 * 32)
  const surface = new Surface(new TileGrid(32, 32), plane)
  const pen = new FreePen(surface, 'round', 'draw', 1, { cleansCorners: true })

  pen.begin(10, 10, 0.5)
  pen.move(11, 10, 0.5)
  pen.move(11, 11, 0.5)
  pen.move(12, 11, 0.5)
  pen.move(12, 12, 0.5)
  pen.end()

  assert.equal(plane[10 * 32 + 11], 0, '角の点は描かない')
  assert.equal(plane[11 * 32 + 11], 1)
  assert.equal(plane[12 * 32 + 12], 1)
})

test('線: なめらかな線の縁は濃さを持ち、切ると点だけになる', () => {
  const draw = (isSmooth: boolean): Uint8Array => {
    const plane = new Uint8Array(64 * 64)
    const surface = new Surface(new TileGrid(64, 64), plane)
    const pen = new FreePen(surface, 'round', 'draw', 5, { isSmooth })

    pen.begin(5, 10, 0.5)
    pen.move(55, 37, 0.5)
    pen.end()

    return plane
  }

  const partial = (plane: Uint8Array): number =>
    plane.filter(value => value > 15).length

  assert.ok(partial(draw(true)) > 20)
  assert.equal(partial(draw(false)), 0)
})

test('線: 消しゴムは縁の濃さを下げ、ゼロで消える', () => {
  const plane = new Uint8Array(4)
  const surface = new Surface(new TileGrid(2, 2), plane)

  surface.value = 3
  surface.cover(0, 0, 16, false)
  assert.equal(plane[0], 3)

  surface.uncover(0, 0, 8)
  assert.equal(valueInk(plane[0]), 3)
  assert.equal(valueCoverage(plane[0]), 8)

  surface.uncover(0, 0, 16)
  assert.equal(plane[0], 0)
})

test('線: 重ね塗りの画材はだんだん濃くなり、ペンは濃くならない', () => {
  const plane = new Uint8Array(1)
  const surface = new Surface(new TileGrid(1, 1), plane)

  surface.cover(0, 0, 4, true)
  surface.cover(0, 0, 4, true)
  assert.ok(valueCoverage(plane[0]) > 4)

  plane[0] = 0
  surface.cover(0, 0, 4, false)
  surface.cover(0, 0, 4, false)
  assert.equal(valueCoverage(plane[0]), 4)
})

test('合成: 縁の濃さは下の色と混ざる', () => {
  assert.equal(blendOver(0xff102030, 0xff405060), 0xff102030)
  assert.equal(blendOver(0, 0xff405060), 0xff405060)

  const half = blendOver(0x80000000, 0xffffffff)

  assert.equal(half >>> 24, 255)
  assert.ok((half & 255) > 100 && (half & 255) < 140)

  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const compositor = new Compositor(note)

  editor.planes[0][0] = coveredValue(1, 8)
  compositor.composeRegion(0, editor.planes, {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  })

  assert.equal(compositor.pixels[0] >>> 24, 128)
})

test('筆圧: 強く押すほど太くなり、切ると変わらない', () => {
  const width = (pressure: number, usesPressure: boolean): number => {
    const plane = new Uint8Array(64 * 64)
    const surface = new Surface(new TileGrid(64, 64), plane)
    const pen = new FreePen(surface, 'round', 'draw', 8, {
      isSmooth: true,
      usesPressure,
    })

    pen.begin(10, 32, pressure)
    pen.move(50, 32, pressure)
    pen.end()

    return plane.filter((_, index) => index % 64 === 30 && plane[index]).length
  }

  assert.ok(width(1, true) > width(0.5, true))
  assert.ok(width(0.1, true) < width(0.5, true))
  assert.equal(width(1, false), width(0.5, false))
})

test('ドット: マスごとに塗り、同じ色のマスから始めると消す', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const dot = tool('dot')
  const plane = editor.planes[0]
  const at = (x: number, y: number): number => plane[y * note.meta.width + x]

  editor.dotSize.value = 8
  dot.down(editor, point(3, 3))
  dot.move(editor, point(35, 3))
  dot.up(editor, point(35, 3))

  assert.equal(inkOf(plane), 8 * 8 * 5, '飛ばしたマスも埋まる')
  assert.equal(at(0, 0), at(7, 7))
  assert.equal(at(8, 0) > 0 && at(8, 8) === 0, true, '縁はぼけない')

  dot.down(editor, point(20, 4))
  dot.move(editor, point(28, 4))
  dot.up(editor, point(28, 4))

  assert.equal(inkOf(plane), 8 * 8 * 3)
  assert.equal(at(16, 0), 0)
})

test('こさ: 半透明の線は同じ線で何度なぞってもこさを超えない', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const pen = tool('pen')

  editor.size.value = 8
  editor.opacity.value = 0.5
  pen.down(editor, point(10, 20))
  pen.move(editor, point(80, 20))
  pen.move(editor, point(10, 20))
  pen.move(editor, point(80, 20))
  pen.up(editor, point(80, 20))

  const strongest = editor.planes[0].reduce(
    (most, value) => Math.max(most, valueCoverage(value)),
    0,
  )

  assert.equal(strongest, 8)
})

test('こさ: 弱い消しゴムは 1 本の線で決まった割合しか消さない', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const plane = editor.planes[0]
  const center = 20 * note.meta.width + 40

  editor.size.value = 12

  const pen = tool('pen')

  pen.down(editor, point(10, 20))
  pen.move(editor, point(80, 20))
  pen.up(editor, point(80, 20))

  assert.equal(valueCoverage(plane[center]), 16)

  const eraser = tool('eraser')

  editor.eraserStrength.value = 0.5
  eraser.down(editor, point(10, 20))
  eraser.move(editor, point(80, 20))
  eraser.move(editor, point(10, 20))
  eraser.up(editor, point(10, 20))

  assert.equal(valueCoverage(plane[center]), 8)
})

test('けしゴム: ふつうのノートでも模様のところだけ消せる', () => {
  const width = 32
  const plane = new Uint8Array(width * width).fill(1)
  const surface = new Surface(new TileGrid(width, width), plane)

  surface.pattern = {
    id: 'checker',
    width: 2,
    height: 2,
    bits: Uint8Array.from([1, 0, 0, 1]),
  }

  const eraser = new FreePen(surface, 'round', 'erase', 20, {
    isSmooth: true,
    erasesPattern: true,
  })

  eraser.begin(16, 16, 0.5)
  eraser.end()

  assert.equal(plane[16 * width + 16], 0, '模様の点は消える')
  assert.equal(plane[16 * width + 17], 1, '模様でない点は残る')
})

test('ペン: 縁取りは線のまわりを別の色で囲み、袋文字は中を抜く', () => {
  const width = 24
  const draw = (style: 'outline' | 'hollow'): Uint8Array => {
    const plane = new Uint8Array(width * width)
    const surface = new Surface(new TileGrid(width, width), plane)

    surface.value = 1

    const edge = new EdgeTracer(surface, { style, width: 2, second: 3 })

    for (let x = 6; x < 12; x++) surface.plot(x, 12)

    edge.update()

    for (let x = 12; x < 18; x++) surface.plot(x, 12)

    edge.finish()

    return plane
  }

  const outline = draw('outline')
  const hollow = draw('hollow')

  assert.equal(outline[12 * width + 10], 1, '線はそのまま')
  assert.equal(outline[10 * width + 10], 3, 'まわりは縁の色')
  assert.equal(outline[5 * width + 10], 0, '縁の太さより外は塗らない')
  assert.equal(hollow[12 * width + 10], 3, '中は 2 つめの色')
  assert.equal(hollow[10 * width + 10], 1, 'まわりは線の色')
})

test('塗りつぶし: もようを選んでいても、いまの色でべたに塗る', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const plane = editor.planes[0]
  const width = note.meta.width

  editor.patternId.value = 'checker'
  tool('fill').down(editor, point(5, 5))

  assert.equal(valueInk(plane[5 * width + 5]), editor.inkValue)
  assert.equal(valueInk(plane[5 * width + 6]), editor.inkValue)
})

test('ペン: 縁は描いている途中から付き、線との間にすき間がない', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const pen = tool('pen')
  const plane = editor.planes[0]
  const width = note.meta.width
  const ink = editor.inkValue

  editor.size.value = 6
  editor.penEdge.style = 'outline'
  editor.penEdge.width = 2
  editor.penEdge.second = 2
  pen.down(editor, point(20, 30))
  pen.move(editor, point(60, 30))

  const column = (): number[] =>
    Array.from({ length: 12 }, (_, step) => plane[(30 - step) * width + 40])

  assert.ok(
    column().some(value => valueInk(value) === 2),
    '途中でも縁がある',
  )

  pen.up(editor, point(60, 30))

  const values = column()
  const lastBody = values.findLastIndex(value => valueInk(value) === ink)
  const firstRim = values.findIndex(value => valueInk(value) === 2)

  assert.ok(lastBody >= 0 && firstRim === lastBody + 1, '線のすぐ外が縁')
  assert.ok(
    valueCoverage(values[lastBody]) * 2 >= 16,
    '線の外側に薄い点が残らない',
  )
})
