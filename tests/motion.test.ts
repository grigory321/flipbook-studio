import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { makeMotionPath, motionAt } from '../src/app/motion.ts'
import {
  applyRange,
  arrangeRows,
  buildMotion,
  insertWobble,
} from '../src/app/series.ts'
import { Note } from '../src/core/note.ts'
import { WarpField } from '../src/draw/warp.ts'
import { point, tool } from './helpers.ts'

test('変位場: 押すと絵が動き、ずれのない所はそのまま', () => {
  const width = 40
  const from = new Uint8Array(width * width)
  const to = new Uint8Array(width * width)

  from[20 * width + 20] = 1
  from[2 * width + 2] = 1

  const field = new WarpField(width, width)
  const box = field.push(20, 20, 5, 0, 12, 1)

  assert.ok(box.right - box.left <= 26, '触った範囲だけ計算する')

  field.apply(from, to)

  const row = [...to.subarray(20 * width, 21 * width)]

  assert.equal(to[20 * width + 20], 0)
  assert.ok(row.indexOf(1) > 21, '押した向きへ動く')
  assert.equal(to[2 * width + 2], 1)
})

test('ゆらゆら差分: すぐあとへ足し、1 回で取り消せる', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)
  const pen = tool('pen')

  pen.down(editor, point(30, 30))
  pen.move(editor, point(120, 90))
  pen.up(editor, point(120, 90))
  note.frames.setSounds(0, 1)

  assert.ok(
    await insertWobble(editor, { count: 3, strength: 2, kind: 'whole' }),
  )
  assert.equal(note.frames.count, 4)
  assert.equal(note.frames.sounds(1), 0, '効果音は写さない')
  assert.notEqual(note.frames.cel(1, 0), note.frames.cel(0, 0))
  assert.notEqual(note.frames.cel(1, 0), note.frames.cel(2, 0))

  editor.undo()
  assert.equal(note.frames.count, 1)
})

test('みちすじ: 道はなめらかで、両端は動かない', () => {
  const zigzag: [number, number][] = []

  for (let x = 0; x <= 100; x++) zigzag.push([x, x % 2 ? 3 : -3])

  const path = makeMotionPath(zigzag)
  const [endX, endY] = motionAt(path, 1)

  assert.ok(Math.abs(endX - 100) < 1)
  assert.ok(Math.abs(endY - (zigzag[100][1] + 3)) < 7)

  for (const y of path.ys.subarray(10, path.ys.length - 10)) {
    assert.ok(Math.abs(y) < 2.5, 'ぎざぎざがならされる')
  }

  assert.deepEqual(motionAt(path, 0).slice(0, 2), [0, 0])
})

test('みちすじ: 回り続けても向きが飛ばない', () => {
  const circle: [number, number][] = []

  for (let step = 0; step <= 720; step += 4) {
    const angle = (step * Math.PI) / 180

    circle.push([50 + Math.cos(angle) * 30, 50 + Math.sin(angle) * 30])
  }

  const { turns } = makeMotionPath(circle)

  for (let index = 1; index < turns.length; index++) {
    assert.ok(Math.abs(turns[index] - turns[index - 1]) < 0.5)
  }

  assert.ok(Math.abs(turns[turns.length - 1]) > Math.PI * 3)
})

test('みちすじ: ページを足すときは、もとのページを変えない', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)

  editor.planes[0][20 * note.meta.width + 20] = 1
  editor.liftAll()

  const line: [number, number][] = [
    [20, 20],
    [120, 20],
  ]
  const before = note.frames.cel(0, 0)
  const isDone = await buildMotion(editor, {
    path: makeMotionPath(line),
    count: 4,
    ease: 'none',
    follows: false,
    finalScale: 1,
    mode: 'add',
  })

  assert.ok(isDone)
  assert.equal(note.frames.count, 5)
  assert.equal(note.frames.cel(0, 0), before)
  assert.equal(editor.floating.peek(), null)

  await editor.goTo(4)
  assert.equal(editor.planes[0][20 * note.meta.width + 120], 1)

  editor.undo()
  assert.equal(note.frames.count, 1)
})

test('まとめて操作: 並べ替えの順番', () => {
  const rows = Uint32Array.from([1, 2, 3, 4])
  const order = (action: Parameters<typeof arrangeRows>[2], times = 2) => [
    ...arrangeRows(rows, 1, action, times),
  ]

  assert.deepEqual(order('reverse'), [4, 3, 2, 1])
  assert.deepEqual(order('pingPong'), [1, 2, 3, 4, 3, 2])
  assert.deepEqual(order('repeat'), [1, 2, 3, 4, 1, 2, 3, 4])
  assert.deepEqual(order('stretch'), [1, 1, 2, 2, 3, 3, 4, 4])
  assert.deepEqual(order('delete'), [])
})

test('まとめて操作: 全ページを消しても 1 枚残り、取り消せる', () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)

  editor.addPages()
  editor.addPages()

  assert.ok(applyRange(editor, 0, 2, 'delete', 2))
  assert.equal(note.frames.count, 1)

  editor.undo()
  assert.equal(note.frames.count, 3)
})
