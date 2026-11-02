import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { Floating, liftMask } from '../src/app/floating.ts'
import { KNOCKOUT_VALUE } from '../src/core/ink.ts'
import { Note } from '../src/core/note.ts'
import { connectedMask, polygonMask, rectMask } from '../src/draw/mask.ts'
import { point, tool, inkOf } from './helpers.ts'

test('範囲: 四角、投げ縄、つながりの表ができる', () => {
  assert.equal(inkOf(rectMask(10, 10, 8, 8, 2, 3)), 7 * 6)
  assert.equal(inkOf(rectMask(10, 10, -5, -5, 20, 0)), 10)

  const triangle = polygonMask(
    [
      [0, 0],
      [8, 0],
      [0, 8],
    ],
    10,
    10,
  )

  assert.equal(triangle[0], 1)
  assert.equal(triangle[9 * 10 + 9], 0)
  assert.ok(inkOf(triangle) > 20)

  const plane = new Uint8Array(100)

  plane[11] = 1
  plane[22] = 2
  plane[99] = 1

  const connected = connectedMask([plane], 10, 10, 1, 1)

  assert.ok(connected)
  assert.equal(inkOf(connected), 2, '斜めはつながり、離れた点は入らない')
  assert.equal(connectedMask([plane], 10, 10, 5, 5), null)
})

test('浮いている絵: 持ち上げて動かし、もとの位置へ戻せる', () => {
  const plane = new Uint8Array(64 * 64)

  plane[10 * 64 + 12] = 1

  const floating = liftMask([plane], 64, 64, rectMask(64, 64, 10, 10, 13, 12))

  assert.ok(floating)
  assert.equal(plane[10 * 64 + 12], 0, '持ち上げると元の場所は空く')
  assert.ok(floating.isAtHome)

  floating.moveBy(20, 0)
  assert.equal(floating.isAtHome, false)
  floating.stamp([plane], 64, 64)
  assert.equal(plane[10 * 64 + 32], 1)

  floating.reset()
  assert.ok(floating.isAtHome)
  floating.stamp([plane], 64, 64)
  assert.equal(plane[10 * 64 + 12], 1)
})

test('浮いている絵: 反転、回転、拡大で形が保たれる', () => {
  const flipped = new Floating(new Uint8Array([1, 0]), 2, 1, 5, 5)

  flipped.flipHorizontal()
  assert.equal(flipped.sample(4, 4), 0)
  assert.equal(flipped.sample(5, 4), 1)

  const turned = new Floating(new Uint8Array([1, 0]), 2, 1, 5, 5)

  turned.rotateBy(Math.PI / 2)

  const inked: [number, number][] = []

  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      if (turned.sample(x, y)) inked.push([x, y])
    }
  }

  assert.equal(inked.length, 1, '点の数は変わらない')
  assert.ok(inked[0][1] < 5, '右へ 90 度回すと、左の点は上へ行く')

  const grown = new Floating(new Uint8Array([1]), 1, 1, 5, 5)

  grown.dragHandle('se', 7, 7)
  assert.ok(grown.bounds().right - grown.bounds().left >= 3)

  const wide = new Floating(new Uint8Array(16).fill(1), 4, 4, 10, 10)

  wide.dragHandle('e', 16, 10)
  assert.equal(wide.bounds().right - wide.bounds().left + 1, 12)
  assert.equal(wide.bounds().bottom - wide.bounds().top + 1, 4)
})

test('浮いている絵: 四隅の変形は角の位置へ絵を運ぶ', () => {
  const corner = new Uint8Array(64)

  corner[0] = 1

  const floating = new Floating(corner, 8, 8, 20, 20)

  floating.setFreeCorners(true)
  floating.dragHandle('nw', 4, 4)

  assert.equal(floating.sample(4, 4), 1)
  assert.equal(floating.sample(23, 23), 0)
  assert.equal(floating.bounds().left, 4)
})

test('浮いている絵: つまみは拡大率に関わらず届く距離で見つかる', () => {
  const floating = new Floating(new Uint8Array(100).fill(1), 10, 10, 20, 20)

  assert.equal(floating.handleAt(15, 15, 2, 8), 'nw')
  assert.equal(floating.handleAt(20, 15, 2, 8), 'n')
  assert.equal(floating.handleAt(20, 7, 2, 8), 'rotate')
  assert.equal(floating.handleAt(20, 20, 2, 8), null)
})

test('編集: 動かす道具はレイヤーの絵をまとめて動かし、1 回で取り消せる', () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)
  const pen = tool('pen')
  const move = tool('move')

  pen.down(editor, point(10, 10))
  pen.move(editor, point(30, 20))
  pen.up(editor, point(30, 20))

  const before = note.frames.cel(0, 0)
  const ink = inkOf(editor.planes[0])

  assert.equal(move.down(editor, point(50, 50)), null)
  assert.ok(editor.floating.peek())
  assert.equal(inkOf(editor.planes[0]), 0, '持ち上げたので紙は空')

  move.move(editor, point(60, 55))
  move.up(editor, point(60, 55))
  editor.dropFloating()

  assert.equal(inkOf(editor.planes[0]), ink)
  assert.notEqual(note.frames.cel(0, 0), before)

  editor.undo()
  assert.equal(note.frames.cel(0, 0), before)
})

test('編集: 空のレイヤーは動かせない', () => {
  const editor = new Editor(Note.create({ title: 't', profile: 'dsi' }))

  assert.equal(tool('move').down(editor, point(5, 5)), 'empty')
  assert.equal(editor.isEditing, false)
})

test('編集: 普通ふでばこは全レイヤーをまとめて選ぶ', () => {
  const note = Note.create({ title: 't', profile: '3ds' })
  const editor = new Editor(note)

  assert.ok(note.meta.oneSheet)

  editor.layer.value = 0
  editor.planes[0][20 * note.meta.width + 20] = 1
  editor.layer.value = 1
  editor.planes[1][30 * note.meta.width + 30] = 2

  assert.equal(editor.liftAll(), null)

  const floating = editor.floating.peek()

  assert.ok(floating?.isLayered)
  assert.equal(inkOf(editor.planes[0]) + inkOf(editor.planes[1]), 0)

  floating.moveBy(4, 0)
  editor.dropFloating()

  assert.equal(editor.planes[0][20 * note.meta.width + 24], 1)
  assert.equal(editor.planes[1][30 * note.meta.width + 34], 2)
})

test('編集: はんこは動かせるまま押せて、コピーは別のページへ貼れる', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)

  editor.planes[0][0] = 1
  editor.liftAll()

  const floating = editor.floating.peek()

  assert.ok(floating)

  floating.moveBy(30, 0)
  editor.stampFloating()
  assert.equal(editor.planes[0][30], 1)
  assert.ok(editor.floating.peek(), '押しても絵は浮いたまま')

  floating.moveBy(30, 0)
  editor.stampFloating()
  assert.equal(editor.planes[0][60], 1)

  editor.copyFloating()
  editor.discardFloating()
  editor.addPages()
  await editor.goTo(1)
  assert.equal(inkOf(editor.planes[0]), 0)

  assert.ok(editor.pasteFloating())
  editor.dropFloating()
  assert.equal(inkOf(editor.planes[0]), 1)
})

test('浮いている絵: 抜きの点は下の絵を消す', () => {
  const plane = new Uint8Array(4).fill(1)
  const floating = new Floating(
    Uint8Array.from([KNOCKOUT_VALUE, 0]),
    2,
    1,
    1,
    0.5,
  )

  floating.stamp([plane], 2, 2)

  assert.deepEqual([...plane], [0, 1, 1, 1])
})
