import assert from 'node:assert/strict'
import { test } from 'node:test'
import { loadPlane, packPlane } from '../src/core/cel.ts'
import { Note } from '../src/core/note.ts'
import { PROFILES } from '../src/core/profile.ts'
import { readMeta } from '../src/file/meta.ts'
import { readUgb, readUgbPreview, writeUgb } from '../src/file/ugb.ts'
import { seededRandom } from './helpers.ts'

function drawnNote(pages: number): Note {
  const note = Note.create({ title: 'ボール', profile: 'free' })
  const { frames, grid, store } = note
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(grid.width * grid.height)
  const random = seededRandom(9)

  for (let page = 0; page < pages; page++) {
    if (page > 0) frames.insertBlank(page, 1)

    plane[Math.floor(random() * plane.length)] = 1 + (page % 5)
    frames.setCel(page, 0, packPlane(store, plane, grid, scratch))
    frames.setSounds(page, page % 3)
  }

  return note
}

test('.ugb: 書いて読むと絵と属性が一致する', async () => {
  const note = drawnNote(40)

  note.sounds.set('s', {
    id: 's',
    name: 'ポン',
    rate: 22050,
    samples: new Int16Array([1, -2, 3, -4]),
  })

  const blob = await writeUgb(note, { cover: new Uint8Array([1, 2, 3]) })
  const { note: restored } = await readUgb(blob)
  const { grid } = note
  const scratch = new Uint32Array(grid.count)
  const a = new Uint8Array(grid.width * grid.height)
  const b = new Uint8Array(grid.width * grid.height)

  assert.equal(restored.frames.count, 40)
  assert.equal(restored.meta.title, 'ボール')
  assert.deepEqual(
    restored.sounds.get('s')?.samples,
    note.sounds.get('s')?.samples,
  )

  for (let page = 0; page < 40; page++) {
    loadPlane(note.store, note.frames.cel(page, 0), a, grid, scratch)
    loadPlane(restored.store, restored.frames.cel(page, 0), b, grid, scratch)
    assert.deepEqual(a, b)
    assert.equal(restored.frames.attrs(page), note.frames.attrs(page))
  }
})

test('.ugb: 表紙と題名だけを読める', async () => {
  const blob = await writeUgb(drawnNote(3), { cover: new Uint8Array([9, 8]) })
  const preview = await readUgbPreview(blob)

  assert.equal(preview.pages, 3)
  assert.equal(preview.meta.title, 'ボール')
  assert.deepEqual(preview.cover, new Uint8Array([9, 8]))
})

test('.ugb: 壊れたファイルを検出する', async () => {
  const blob = await writeUgb(drawnNote(3))
  const bytes = new Uint8Array(await blob.arrayBuffer())

  bytes[60] ^= 0xff

  await assert.rejects(readUgb(new Blob([bytes])), /壊れています/)
  await assert.rejects(readUgb(new Blob([bytes.subarray(0, 40)])), RangeError)
  await assert.rejects(readUgb(new Blob([new Uint8Array(32)])), /ugb/)
})

test('.ugb: 知らない任意チャンクを保ち、必須チャンクは拒む', async () => {
  const note = drawnNote(2)
  const extras = [{ type: 'plug', bytes: new Uint8Array([7, 7, 7]) }]
  const kept = await readUgb(await writeUgb(note, { extras }))

  assert.deepEqual(kept.extras, extras)

  const unknown = [{ type: 'XXXX', bytes: new Uint8Array(1) }]

  await assert.rejects(
    readUgb(await writeUgb(note, { extras: unknown })),
    /必須チャンク/,
  )
})

test('.ugb: 古いノートの欠けた項目は補い、形のわからない情報は拒む', () => {
  const meta = readMeta({
    id: 'old',
    profile: 'dsi',
    width: 256,
    height: 192,
    layers: [{ name: 'A' }, {}],
    speed: 99,
    tracks: [{ kind: 'bgm', name: 'BGM1', soundId: 'x' }, { kind: '?' }],
  })

  assert.equal(meta.title, '')
  assert.equal(meta.speed, PROFILES.dsi.defaultSpeed)
  assert.equal(meta.layers[1].name, 'B')
  assert.equal(meta.layers[1].visible, true)
  assert.equal(meta.tracks.length, 1)
  assert.equal(meta.tracks[0].baseFps, null)
  assert.equal(meta.flipnote, null)
  assert.throws(() => readMeta({ id: 'x', profile: 'pc', layers: [{}] }))
  assert.throws(() => readMeta('ノート'))
})
