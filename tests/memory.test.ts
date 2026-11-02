import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { packPlane } from '../src/core/cel.ts'
import { FrameTable } from '../src/core/frames.ts'
import { Note } from '../src/core/note.ts'
import { Store } from '../src/core/store.ts'
import { checkPages, readMeta } from '../src/file/meta.ts'
import { MemoryBackend, seededRandom } from './helpers.ts'

const MIB = 1024 * 1024

function fillNoise(plane: Uint8Array, random: () => number): void {
  for (let index = 0; index < plane.length; index++) {
    plane[index] = 1 + Math.floor(random() * 12)
  }
}

function paintNoise(editor: Editor, random: () => number): void {
  const { width, height } = editor.note.meta
  const surface = editor.beginEdit()

  assert.ok(surface)
  fillNoise(editor.planes[editor.layer.peek()], random)
  surface.markRegion(0, 0, width - 1, height - 1)
  editor.commitEdit()
}

function addNoisePages(note: Note, count: number, random: () => number): void {
  const { frames, grid, meta, store } = note
  const plane = new Uint8Array(meta.width * meta.height)
  const scratch = new Uint32Array(grid.count)

  for (let index = 0; index < count; index++) {
    const page = frames.count

    frames.insertBlank(page)
    fillNoise(plane, random)
    frames.setCel(page, 0, packPlane(store, plane, grid, scratch))
  }
}

async function pageReady(editor: Editor): Promise<void> {
  for (let tries = 0; !editor.isPageReady; tries++) {
    assert.ok(tries < 1000, 'ページが読み込まれない')
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

test('取り消し: 手放したデータのページでも落ちず、読み直して元の絵に戻す', async () => {
  const backend = new MemoryBackend()
  const store = new Store({ backend, budget: MIB })
  const note = Note.create({ title: 't', profile: 'free' }, store)
  const editor = new Editor(note)
  const random = seededRandom(7)

  paintNoise(editor, random)

  const first = editor.planes[0].slice()

  paintNoise(editor, random)
  addNoisePages(note, 12, random)
  await editor.goTo(12)
  await store.settled()

  assert.ok(!note.pagesLoaded(0, 1), '1 ページ目のデータは手放されている')

  editor.undo()
  assert.equal(editor.page.peek(), 12, '読み終えるまでは前のページのまま')
  assert.equal(editor.beginEdit(), null, '読み込み中は描き始めない')

  await pageReady(editor)
  assert.equal(editor.page.peek(), 0)
  assert.deepEqual(editor.planes[0], first)
  assert.ok(backend.reads > 0)

  editor.redo()
  await pageReady(editor)
  assert.notDeepEqual(editor.planes[0], first)
})

test('大きなノート: 1 ページ目のデータが手放されていても編集を開ける', async () => {
  const backend = new MemoryBackend()
  const store = new Store({ backend, budget: MIB })
  const note = Note.create({ title: 't', profile: 'free' }, store)
  const { frames, grid, meta } = note
  const random = seededRandom(11)
  const first = new Uint8Array(meta.width * meta.height)

  fillNoise(first, random)
  frames.setCel(
    0,
    0,
    packPlane(store, first, grid, new Uint32Array(grid.count)),
  )
  addNoisePages(note, 12, random)
  await store.settled()

  const reopened = new Note(
    structuredClone(meta),
    FrameTable.fromBytes(frames.layers, frames.toBytes()),
    new Store({ backend, budget: MIB, ...store.snapshot() }),
  )
  const editor = new Editor(reopened)

  assert.equal(editor.isPageReady, false)
  await pageReady(editor)
  assert.deepEqual(editor.planes[0], first)
})

test('履歴: 9999 ページ 8 レイヤーで全ページの置き換えを重ねてもメモリは増え続けない', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)

  while (note.frames.layers < note.profile.maxLayers) editor.addLayer()

  assert.equal(note.frames.layers, 8)
  assert.ok(editor.addPages(note.profile.maxPages - 1))

  const count = editor.pageCount

  for (let index = 0; index < 100; index++) {
    editor.replacePages(0, count, note.frames.copyRows(0, count), 0)
  }

  assert.ok(
    editor.history.byteLength < 64 * MIB,
    `${editor.history.byteLength}`,
  )

  let undone = 0

  while (editor.history.canUndo) {
    editor.undo()
    undone++
    assert.equal(editor.pageCount, count)
  }

  assert.ok(undone < 100, '古い置き換えは捨てられている')
  assert.ok(undone >= 10, '新しい置き換えは取り消せる')
})

test('ノート情報: 大きすぎる用紙やレイヤー、ページの数は読む前に断る', () => {
  const meta = (fields: Record<string, unknown>) =>
    readMeta({
      id: 'x',
      profile: 'free',
      width: 512,
      height: 384,
      layers: [{}, {}],
      ...fields,
    })
  const eight = Array.from({ length: 8 }, () => ({}))
  const dsi = { profile: 'dsi', width: 256, height: 192 }

  assert.equal(meta({ width: 1280, height: 720, layers: eight }).width, 1280)
  assert.equal(meta({ width: 360, height: 640 }).height, 640)
  assert.throws(() => meta({ width: 65535, height: 65535 }), /用紙の大きさ/)
  assert.throws(() => meta({ width: 1280, height: 1280 }), /用紙の大きさ/)
  assert.throws(() => meta({ width: 0 }), /用紙の大きさ/)
  assert.throws(() => meta({ height: 10.5 }), /用紙の大きさ/)
  assert.throws(() => meta({ ...dsi, width: 512 }), /用紙の大きさ/)
  assert.throws(() => meta({ layers: [...eight, {}] }), /レイヤーの数/)
  assert.throws(() => meta({ ...dsi, layers: [{}, {}, {}] }), /レイヤーの数/)

  assert.doesNotThrow(() => checkPages(meta({}), 9999))
  assert.throws(() => checkPages(meta({}), 10000), /ページの数/)
  assert.throws(() => checkPages(meta({}), 0), /ページの数/)
  assert.throws(() => checkPages(meta(dsi), 1000), /ページの数/)
})
