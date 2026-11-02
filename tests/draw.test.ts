import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Editor } from '../src/app/editor.ts'
import {
  ERASER_SETS,
  PAINT_SETS,
  PEN_SETS,
  startStroke,
} from '../src/app/pens.ts'
import { builtinTools, drawShape } from '../src/app/tools.ts'
import { packPlane, TileGrid } from '../src/core/cel.ts'
import { Note } from '../src/core/note.ts'
import {
  DEVICE_PATTERNS,
  PATTERN_SOLID,
  patternBit,
} from '../src/core/patterns.ts'
import { Surface } from '../src/core/surface.ts'
import { DEVICE_STACK_LIMIT, floodFill } from '../src/draw/flood.ts'
import { DsiPen, DsiBrush } from '../src/draw/pen-dsi.ts'
import { shapePoints } from '../src/draw/shapes.ts'
import { inkOf, point } from './helpers.ts'

function surfaceOf(width: number, height: number): Surface {
  return new Surface(
    new TileGrid(width, height),
    new Uint8Array(width * height),
  )
}

test('もよう: 実機と同じ点になる', () => {
  const pattern = (id: string) => {
    const found = DEVICE_PATTERNS.find(item => item.id === id)

    assert.ok(found)

    return found
  }

  assert.equal(patternBit(PATTERN_SOLID, 3, 9), 1)
  assert.equal(patternBit(pattern('checker'), 0, 0), 0)
  assert.equal(patternBit(pattern('checker'), 1, 0), 1)
  assert.equal(patternBit(pattern('lines-h'), 0, 1), 1)
  assert.equal(patternBit(pattern('lines-v'), 1, 0), 1)
  assert.equal(patternBit(pattern('dots-sparse'), 1, 1), 1)
  assert.equal(patternBit(pattern('dots-sparse'), 0, 0), 0)
  assert.equal(patternBit(pattern('dots-inverse'), 1, 1), 0)
  assert.equal(patternBit(pattern('tone'), 0, 0), 1)
  assert.equal(patternBit(pattern('tone'), -4, -8), 1)
})

test('ペン: すべてのペンが線を描き、面の外でも落ちない', () => {
  for (const profile of ['free', 'dsi', '3ds'] as const) {
    const sets = [
      ['pen', PEN_SETS[profile]],
      ['paint', PAINT_SETS[profile]],
    ] as const

    for (const [kind, specs] of sets) {
      for (const spec of specs) {
        const surface = surfaceOf(256, 192)
        let now = 0

        const stroke = startStroke({
          surface,
          spec,
          kind,
          size: 5,
          patternErase: false,
          x: 10,
          y: 10,
          pressure: 0.5,
          now,
        })

        for (let step = 1; step <= 40; step++) {
          now += 17
          stroke.move(10 + step * 7, 10 + step * 5, 0.5)
          stroke.tick(now)
        }

        stroke.finish(300, 250)

        assert.ok(inkOf(surface.plane) > 0, `${spec.id} が何も描かない`)
      }
    }
  }
})

test('けしゴム: すべての形が絵を消す', () => {
  for (const profile of ['free', 'dsi', '3ds'] as const) {
    for (const spec of ERASER_SETS[profile]) {
      const surface = surfaceOf(256, 192)

      surface.plane.fill(1)

      const before = inkOf(surface.plane)
      let now = 0

      const stroke = startStroke({
        surface,
        spec,
        kind: 'eraser',
        size: 8,
        patternErase: false,
        x: 40,
        y: 40,
        pressure: 0.5,
        now,
      })

      for (let step = 1; step <= 30; step++) {
        now += 17
        stroke.move(40 + step * 4, 40 + step * 2, 0.5)
        stroke.tick(now)
      }

      stroke.finish(160, 100)

      assert.ok(inkOf(surface.plane) < before, `${spec.id} が消さない`)
    }
  }
})

test('DSi のぶれ補正: 急に飛んだ点へ線を伸ばさない', () => {
  const surface = surfaceOf(256, 192)
  const pen = new DsiPen(surface, DsiBrush.line)

  pen.down(10, 10)

  for (let step = 1; step <= 8; step++) pen.sample(10 + step, 10)

  pen.sample(200, 150)

  assert.equal(surface.plane[150 * 256 + 200], 0)
})

test('図形: 四角は閉じ、まるは全周を通る', () => {
  const rect = shapePoints('rect', 10, 10, 20, 20, false)
  const oval = shapePoints('oval', 50, 50, 60, 55, false)
  const line = shapePoints('line', 0, 0, 10, 3, true)

  assert.deepEqual(rect[0], rect[rect.length - 1])
  assert.ok(oval.some(([x]) => x === 60))
  assert.ok(oval.some(([x]) => x === 40))
  assert.deepEqual(line[line.length - 1], [10, 0])
})

test('図形: 中を塗ると内側に点が入る', () => {
  const surface = surfaceOf(100, 100)

  drawShape(
    surface,
    PEN_SETS.free[0],
    2,
    'rect',
    [10, 10],
    [40, 40],
    false,
    true,
  )

  assert.equal(surface.plane[25 * 100 + 25], 1)
})

test('バケツ: 線で囲まれた内側だけを塗る', () => {
  const surface = surfaceOf(64, 64)

  for (let index = 0; index < 64; index++) {
    surface.plane[20 * 64 + index] = 1
  }

  surface.value = 2
  floodFill(surface, 5, 5, [surface.plane])

  assert.equal(surface.plane[5 * 64 + 5], 2)
  assert.equal(surface.plane[40 * 64 + 5], 0)
  assert.equal(surface.plane[20 * 64 + 5], 1)
})

test('バケツ: 実機の箱の上限があっても止まる', () => {
  const surface = surfaceOf(256, 192)

  surface.value = 1
  floodFill(surface, 100, 100, [surface.plane], DEVICE_STACK_LIMIT)

  assert.ok(inkOf(surface.plane) > 0)
})

test('編集: 描いて取り消すとセルが戻り、ページの複製は容量を増やさない', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)
  const pen = builtinTools().find(tool => tool.id === 'pen')

  assert.ok(pen)

  pen.down(editor, point(20, 20))
  pen.move(editor, point(60, 40, 40))
  pen.tick?.(editor, 40)
  pen.up(editor, point(60, 40, 41))

  const cel = note.frames.cel(0, 0)

  assert.notEqual(cel, 0)

  const written = note.store.writtenBytes

  for (let index = 0; index < 200; index++) editor.duplicatePage()

  assert.equal(note.frames.count, 201)
  assert.equal(note.frames.cel(200, 0), cel, 'コピーは同じ参照を指す')
  assert.equal(note.store.writtenBytes, written, 'データは増えない')

  for (let index = 0; index < 200; index++) editor.undo()

  assert.equal(note.frames.count, 1)

  editor.undo()
  assert.equal(note.frames.cel(0, 0), 0)

  editor.redo()
  assert.equal(note.frames.cel(0, 0), cel)
})

test('編集: まとめてふやしたページは 1 回の取り消しで消える', () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)

  assert.ok(editor.addPages(5))
  assert.equal(note.frames.count, 6)
  assert.equal(editor.page.peek(), 1, '最初のあたらしいページを開く')

  editor.undo()

  assert.equal(note.frames.count, 1)
  assert.equal(editor.addPages(note.profile.maxPages), false)
  assert.equal(note.frames.count, 1, '入りきらないときは 1 枚もふやさない')
})

test('編集: ロックしたレイヤーには描けない', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const pen = builtinTools().find(tool => tool.id === 'pen')

  note.meta.layers[0].locked = true

  assert.equal(pen?.down(editor, point(5, 5)), 'locked')
})

test('編集: 最後の 1 ページを消すと空になる', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const { grid, store } = note
  const plane = new Uint8Array(grid.width * grid.height).fill(1, 0, 90)

  note.frames.setCel(
    0,
    0,
    packPlane(store, plane, grid, new Uint32Array(grid.count)),
  )
  editor.deletePage()

  assert.equal(note.frames.count, 1)
  assert.equal(note.frames.cel(0, 0), 0)
})

test('編集: DSi のペンの色はレイヤーの色として絵を変えずに替わる', () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)
  const { grid, store, frames } = note
  const plane = new Uint8Array(grid.width * grid.height).fill(1, 0, 90)
  const cel = packPlane(store, plane, grid, new Uint32Array(grid.count))

  frames.setCel(0, 0, cel)
  editor.pickInk(2)

  assert.equal(frames.cel(0, 0), cel)
  assert.deepEqual(note.colorAt(0, 0, 0), note.profile.colors[2])

  editor.undo()
  assert.deepEqual(note.colorAt(0, 0, 0), note.profile.colors[1])
})

test('編集: 3DS の普通ふでばこは 1 枚の紙として描く', () => {
  const note = Note.create({ title: 't', profile: '3ds' })
  const editor = new Editor(note)
  const pen = builtinTools().find(tool => tool.id === 'pen')

  assert.ok(pen)

  const stroke = (color: number): void => {
    editor.pickInk(color)
    pen.down(editor, point(30, 30))
    pen.move(editor, point(80, 30, 100))
    pen.tick?.(editor, 100)
    pen.up(editor, point(80, 30, 101))
  }

  stroke(1)

  const blackLayer = editor.layer.peek()
  const hadInk = editor.planes[blackLayer].some(Boolean)

  stroke(2)

  assert.ok(hadInk)
  assert.notEqual(editor.layer.peek(), blackLayer, '色でレイヤーが変わる')
  assert.ok(
    !editor.planes[blackLayer].some(Boolean),
    '上から描くと下のレイヤーの点が消える',
  )
})
