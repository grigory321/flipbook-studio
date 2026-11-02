import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPlane, packPlane, TileGrid } from '../src/core/cel.ts'
import { FrameTable } from '../src/core/frames.ts'
import { History } from '../src/core/history.ts'
import { Store } from '../src/core/store.ts'
import {
  packTile,
  TILE_PACKED_LIMIT,
  TILE_PIXELS,
  unpackTile,
} from '../src/core/tile.ts'
import { MemoryBackend, seededRandom } from './helpers.ts'

function tileRoundTrip(tile: Uint8Array): number {
  const packed = new Uint8Array(TILE_PACKED_LIMIT)
  const length = packTile(tile, 32, 32, 0, 0, packed)

  assert.ok(length > 0, '一様でないタイルは長さを返す')

  const out = new Uint8Array(TILE_PIXELS)

  unpackTile(packed, 0, out)
  assert.deepEqual(out, tile)

  return length
}

test('タイル: 2 色の線は小さくなり、元に戻る', () => {
  const tile = new Uint8Array(TILE_PIXELS)

  for (let index = 0; index < 32; index++) tile[index * 33] = 1

  assert.ok(tileRoundTrip(tile) < 80)
})

test('タイル: 多色の乱雑な絵でも元に戻る', () => {
  const random = seededRandom(1)

  for (const colors of [3, 5, 16, 200]) {
    const tile = new Uint8Array(TILE_PIXELS)

    for (let index = 0; index < TILE_PIXELS; index++) {
      tile[index] = Math.floor(random() * colors)
    }

    tile[0] = 0
    tile[1] = 1
    tileRoundTrip(tile)
  }
})

test('保管庫: 予算を超えると手放し、読み直せる', async () => {
  const backend = new MemoryBackend()
  const store = new Store({ backend, budget: 1024 * 1024 })
  const random = seededRandom(2)
  const refs: number[] = []
  const contents: Uint8Array[] = []

  for (let index = 0; index < 400; index++) {
    const bytes = new Uint8Array(30000)

    for (let at = 0; at < 64; at++) bytes[at] = random() * 256

    refs.push(store.put(bytes))
    contents.push(bytes)
  }

  await store.settled()

  assert.ok(store.loadedBytes <= 1024 * 1024 * 1.5)
  assert.ok(!store.isLoaded(refs[0]), '古いスラブは手放される')

  await store.ensure(refs)

  for (let index = 0; index < 400; index += 37) {
    await store.ensure([refs[index]])
    assert.deepEqual(store.read(refs[index]), contents[index])
  }

  assert.ok(backend.reads > 0)
})

test('保管庫: 写しから復元できる', async () => {
  const backend = new MemoryBackend()
  const store = new Store({ backend })
  const refs: number[] = []

  for (let index = 0; index < 200; index++) {
    refs.push(store.put(new Uint8Array(4000).fill(index)))
  }

  await store.settled()

  const snapshot = store.snapshot()
  const restored = new Store({
    backend,
    slabCount: snapshot.slabCount,
    tail: snapshot.tail,
  })

  await restored.ensure(refs)
  assert.equal(restored.read(refs[150])[0], 150)
  assert.equal(restored.read(refs[199]).length, 4000)
})

test('セル: 面を入れて取り出すと一致し、端の半端なタイルも保つ', () => {
  const grid = new TileGrid(310, 230)
  const store = new Store()
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(310 * 230)
  const random = seededRandom(3)

  for (let index = 0; index < 4000; index++) {
    plane[Math.floor(random() * plane.length)] = 1 + (index & 1)
  }

  const cel = packPlane(store, plane, grid, scratch)
  const out = new Uint8Array(plane.length)

  loadPlane(store, cel, out, grid, scratch)
  assert.deepEqual(out, plane)
})

test('ページの表: 挿入・削除・移動', () => {
  const table = new FrameTable(2, 1)

  for (let page = 0; page < 5; page++) {
    table.insertBlank(page)
    table.setCel(page, 0, page + 100)
  }

  table.moveRows(0, 2, 3)
  assert.deepEqual(
    [0, 1, 2, 3, 4].map(page => table.cel(page, 0)),
    [102, 103, 104, 100, 101],
  )

  const removed = table.removeRows(1, 2)

  assert.equal(table.count, 3)
  table.insertRows(1, removed)
  assert.equal(table.cel(2, 0), 104)
})

test('ページの表: レイヤーの増減で絵がずれない', () => {
  const table = new FrameTable(2)

  table.insertBlank(0, 3, 9)
  table.setCel(0, 0, 11)
  table.setCel(0, 1, 22)
  table.insertLayer(1)
  assert.equal(table.layers, 3)
  assert.equal(table.cel(0, 2), 22)
  assert.equal(table.attrs(0), 3)
  assert.equal(table.inks(0), 9)

  table.removeLayer(0)
  assert.equal(table.cel(0, 1), 22)
})

test('履歴: 取り消しとやり直し、上限を超えても壊れない', () => {
  const history = new History()
  let value = 0

  for (let index = 0; index < 300; index++) {
    history.run({
      page: 0,
      undo: () => value--,
      redo: () => value++,
    })
  }

  assert.equal(value, 300)

  while (history.canUndo) history.undo()

  assert.equal(value, 44)

  history.redo()
  assert.equal(value, 45)
})
