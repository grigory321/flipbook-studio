import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import { crc32 } from '../src/core/bytes.ts'
import { coveredValue } from '../src/core/ink.ts'
import { Note } from '../src/core/note.ts'
import { encodeApng, encodePagePng } from '../src/export/apng.ts'
import { exportNote } from '../src/worker/jobs.ts'
import { encodeGif } from '../src/export/gif.ts'

async function pngChunks(blob: Blob): Promise<Map<string, Uint8Array[]>> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const chunks = new Map<string, Uint8Array[]>()
  let offset = 8

  assert.deepEqual([...bytes.subarray(1, 4)], [0x50, 0x4e, 0x47])

  while (offset < bytes.length) {
    const length = view.getUint32(offset)
    const typed = bytes.subarray(offset + 4, offset + 8 + length)
    const type = String.fromCharCode(...typed.subarray(0, 4))

    assert.equal(view.getUint32(offset + 8 + length), crc32(typed), type)

    chunks.set(type, [...(chunks.get(type) ?? []), typed.subarray(4)])
    offset += 12 + length
  }

  return chunks
}

test('書き出し: APNG はコマの数と順番がそろい、CRC が合う', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const editor = new Editor(note)

  editor.planes[0][10] = 1
  editor.liftAll()
  editor.dropFloating()
  editor.duplicatePage()
  editor.addPages()

  const chunks = await pngChunks(await encodeApng(note, 2, () => {}))
  const control = chunks.get('acTL')?.[0]

  assert.ok(control)
  assert.equal(new DataView(control.buffer, control.byteOffset).getUint32(0), 3)
  assert.equal(chunks.get('fcTL')?.length, 3)
  assert.equal(chunks.get('IDAT')?.length, 1)
  assert.equal(chunks.get('fdAT')?.length, 2)

  const order = [
    ...(chunks.get('fcTL') ?? []),
    ...(chunks.get('fdAT') ?? []),
  ].map(data => new DataView(data.buffer, data.byteOffset).getUint32(0))

  assert.deepEqual(
    order.sort((a, b) => a - b),
    [0, 1, 2, 3, 4],
  )
})

test('書き出し: 1 コマの PNG は倍率の大きさになる', async () => {
  const note = Note.create({ title: 't', profile: 'dsi' })
  const chunks = await pngChunks(await encodePagePng(note, 0, 4))
  const header = chunks.get('IHDR')?.[0]

  assert.ok(header)

  const view = new DataView(header.buffer, header.byteOffset)

  assert.equal(view.getUint32(0), note.meta.width * 4)
  assert.equal(view.getUint32(4), note.meta.height * 4)
})

test('書き出し: GIF はページの数だけ絵が入り、最後まで読める', async () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const plane = editor.planes[0]

  plane.fill(coveredValue(1, 8), 100, 400)
  editor.liftAll()
  editor.dropFloating()
  editor.duplicatePage()
  editor.addPages()

  const blob = await encodeGif(note, 1, () => {})
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const tableBytes = 3 * (2 << (bytes[10] & 7))
  let offset = 13 + tableBytes
  let images = 0

  const skipBlocks = (): void => {
    while (offset < bytes.length && bytes[offset] !== 0) {
      offset += bytes[offset] + 1
    }

    offset++
  }

  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    if (bytes[offset] === 0x21) {
      offset += 2
      skipBlocks()
    } else {
      assert.equal(bytes[offset], 0x2c)
      offset += 10
      offset++
      skipBlocks()
      images++
    }
  }

  assert.equal(images, 3)
  assert.equal(offset, bytes.length - 1)
})

test('書き出し: 連番画像にはページの数だけ PNG が入る', async () => {
  const note = Note.create({ title: 'テスト/1', profile: 'dsi' })

  for (let page = 1; page < 5; page++) note.frames.insertBlank(page, 0)

  const file = await exportNote(note, 'png', 1, () => {})
  const bytes = new Uint8Array(await file.blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const firstName = new TextDecoder().decode(bytes.subarray(30, 35))

  assert.equal(file.fileName, 'テスト1.zip', 'ファイル名に使えない文字は消える')
  assert.equal(view.getUint16(bytes.length - 22 + 10, true), 5)
  assert.equal(firstName, '1.png')
})
