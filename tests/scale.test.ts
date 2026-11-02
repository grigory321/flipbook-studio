import assert from 'node:assert/strict'
import { test } from 'node:test'
import { packPlane } from '../src/core/cel.ts'
import { Compositor } from '../src/core/compositor.ts'
import { Note } from '../src/core/note.ts'
import { Store } from '../src/core/store.ts'
import { readUgb, writeUgb } from '../src/file/ugb.ts'
import { MemoryBackend, seededRandom } from './helpers.ts'

const MIB = 1024 * 1024

function bigNote(pages: number, store: Store, noise = 0): Note {
  const note = Note.create({ title: 'big', profile: 'free' }, store)
  const { frames, grid } = note
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(grid.width * grid.height)
  const random = seededRandom(5)

  for (let index = 0; index < 6000; index++) {
    plane[Math.floor(random() * plane.length)] = 2
  }

  const background = packPlane(store, plane, grid, scratch)

  for (let page = 0; page < pages; page++) {
    if (page > 0) frames.insertBlank(page)

    plane.fill(0)

    const x = 20 + ((page * 7) % 400)
    const y = 40 + ((page * 3) % 280)

    for (let row = 0; row < 24; row++) {
      plane.fill(1, (y + row) * grid.width + x, (y + row) * grid.width + x + 24)
    }

    for (let index = 0; index < noise; index++) {
      plane[Math.floor(random() * plane.length)] = 3
    }

    frames.setCel(page, 1, background)
    frames.setCel(page, 0, packPlane(store, plane, grid, scratch))
  }

  return note
}

test('大容量: 9999 ページでも使うメモリは 1 ページの絵の数百枚ぶん以下', async () => {
  const backend = new MemoryBackend()
  const budget = 8 * MIB
  const store = new Store({ backend, budget })
  const note = bigNote(9999, store)

  await store.settled()

  const rawBytes = 9999 * note.meta.width * note.meta.height * 2

  assert.ok(store.loadedBytes <= budget + MIB, `${store.loadedBytes}`)
  assert.ok(note.frames.byteLength < MIB, '表は 1MB 未満')
  assert.ok(store.writtenBytes < rawBytes / 200, `${store.writtenBytes}`)
})

test('大容量: 手放したページも読み直して表示できる', async () => {
  const backend = new MemoryBackend()
  const store = new Store({ backend, budget: MIB })
  const note = bigNote(1500, store, 3000)
  const compositor = new Compositor(note)

  await store.settled()

  assert.ok(store.writtenBytes > 4 * MIB, '予算より多くのデータがある')
  assert.ok(store.loadedBytes <= 2 * MIB, 'メモリは予算に収まる')

  for (const page of [0, 1499, 700]) {
    await note.ensurePages(page, 1)
    compositor.invalidate()
    assert.ok(compositor.composePage(page))
  }

  assert.ok(backend.reads > 0, '退避したスラブを読んでいる')
})

test('大容量: 大きなノートも .ugb へ往復できる', async () => {
  const backend = new MemoryBackend()
  const note = bigNote(3000, new Store({ backend, budget: 4 * MIB }))

  await note.store.settled()

  const blob = await writeUgb(note)
  const { note: restored } = await readUgb(blob)

  assert.equal(restored.frames.count, 3000)
  assert.ok(blob.size < 3000 * 1024, `${blob.size}`)
})
