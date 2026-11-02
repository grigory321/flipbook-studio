import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { Floating } from '../src/app/floating.ts'
import {
  addMyPattern,
  addMyShape,
  addShapeFromFloating,
  removeMyPattern,
  removeMyShape,
} from '../src/app/my-library.ts'
import { Note } from '../src/core/note.ts'
import { fillPolygon } from '../src/draw/mask.ts'
import { OUTLINES } from '../src/draw/outlines.ts'
import { SHAPE_KINDS, shapePoints } from '../src/draw/shapes.ts'
import { traceContour } from '../src/draw/trace.ts'
import { registries } from '../src/plugin/host.ts'
import { point, tool, inkOf } from './helpers.ts'

test('図形: どれも閉じた線で、ドラッグした四角に収まる', () => {
  assert.equal(SHAPE_KINDS.length, 21)

  for (const kind of SHAPE_KINDS) {
    const points = shapePoints(kind, 10, 20, 90, 80, false)

    assert.ok(points.length > 4, kind)

    if (kind === 'oval') continue

    for (const [x, y] of points) {
      assert.ok(x >= 10 && x <= 90 && y >= 20 && y <= 80, kind)
    }
  }
})

test('図形: へこんだ形の塗りは、へこみの外へはみ出さない', () => {
  const star = OUTLINES.star.map(([x, y]): [number, number] => [
    x * 100,
    y * 100,
  ])
  const painted = new Set<string>()

  fillPolygon(star, (left, right, y) => {
    for (let x = left; x <= right; x++) painted.add(`${x},${y}`)
  })

  assert.ok(painted.has('50,50'), '真ん中は塗る')
  assert.equal(painted.has('2,2'), false)
  assert.equal(painted.has('50,98'), false, '足の間は塗らない')
})

test('図形: 置いたあとは浮いたままで、つかむと動き、外をタップすると確定する', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const shape = tool('shape')

  editor.shape.value = 'rect'
  shape.down(editor, point(20, 20))
  shape.move(editor, point(60, 50))
  shape.up(editor, point(60, 50))

  const floating = editor.floating.peek()

  assert.ok(floating, '置いた図形は動かせる形で残る')
  assert.equal(note.frames.cel(0, 0), 0, 'まだページには書かれていない')
  assert.equal(inkOf(editor.planes[0]), 0)

  shape.down(editor, point(40, 35))
  shape.move(editor, point(50, 35))
  shape.up(editor, point(50, 35))

  assert.equal(editor.floating.peek(), floating, 'つかんでも線は引かれない')
  assert.equal(floating.center[0] > 45, true)

  shape.down(editor, point(300, 200))

  assert.equal(editor.floating.peek(), null, '外を押すと確定する')
  assert.ok(inkOf(editor.planes[0]) > 0)

  shape.cancel?.(editor)
})

test('登録: なぞった線が図形になり、消せる', () => {
  const circle: [number, number][] = []

  for (let step = 0; step < 40; step++) {
    const angle = (step / 40) * Math.PI * 2

    circle.push([50 + Math.cos(angle) * 30, 50 + Math.sin(angle) * 20])
  }

  const id = addMyShape(circle)

  assert.ok(id)

  const points = shapePoints(id, 0, 0, 100, 100, false)

  assert.ok(points.some(([x]) => x === 100))
  assert.ok(points.some(([, y]) => y === 100))

  removeMyShape(id)
  assert.equal(
    addMyShape([
      [0, 0],
      [1, 1],
      [2, 0],
    ]),
    null,
    '小さすぎる線は断る',
  )
})

test('登録: 選んだ絵の輪郭が図形になる', () => {
  const square = new Uint8Array(100)

  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) square[y * 10 + x] = 1
  }

  const outline = traceContour(square, 10, 10)

  assert.ok(outline.length >= 16)
  assert.deepEqual(outline[0], [2, 2])

  const id = addShapeFromFloating(new Floating(square, 10, 10, 5, 5))

  assert.ok(id)
  removeMyShape(id)
})

test('登録: もようを足すと一覧に出て、消すと外れる', () => {
  const id = addMyPattern([1, 0, 0, 1], 2, 2)

  assert.ok(registries.patterns.get(id))

  removeMyPattern(id)
  assert.equal(registries.patterns.get(id), undefined)
})
