import assert from 'node:assert/strict'
import { createPublicKey, createPrivateKey, verify } from 'node:crypto'
import { test } from 'node:test'
import {
  decodeDsiAdpcm,
  decodeN3dsAdpcm,
  encodeDsiAdpcm,
  encodeN3dsAdpcm,
} from '../src/compat/adpcm.ts'
import { exportKwz, exportPpm } from '../src/compat/export.ts'
import { importFlipnote } from '../src/compat/import.ts'
import { KWZ_SIGNING_KEY, PPM_SIGNING_KEY } from '../src/compat/keys.ts'
import { KwzReader } from '../src/compat/kwz.ts'
import { makeKwzFileName, ppmLocalFileName } from '../src/compat/naming.ts'
import { PpmReader } from '../src/compat/ppm.ts'
import { loadPlane, packPlane } from '../src/core/cel.ts'
import { Note } from '../src/core/note.ts'
import { seededRandom } from './helpers.ts'
const fakeJpeg = async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9])

function publicKeyOf(base64: string) {
  const privateKey = createPrivateKey({
    key: Buffer.from(base64, 'base64'),
    format: 'der',
    type: 'pkcs8',
  })

  return createPublicKey(privateKey)
}

function verifyPpm(bytes: Uint8Array): boolean {
  const body = bytes.subarray(0, bytes.length - 144)
  const signature = bytes.subarray(bytes.length - 144, bytes.length - 16)

  return verify('RSA-SHA1', body, publicKeyOf(PPM_SIGNING_KEY), signature)
}

function verifyKwz(bytes: Uint8Array): boolean {
  const body = bytes.subarray(0, bytes.length - 256)
  const signature = bytes.subarray(bytes.length - 256)

  return verify('RSA-SHA256', body, publicKeyOf(KWZ_SIGNING_KEY), signature)
}

test('ADPCM: DSi の音を往復しても大きくずれない', () => {
  const pcm = new Int16Array(4000)

  for (let index = 0; index < pcm.length; index++) {
    pcm[index] = Math.sin(index / 12) * 12000
  }

  const decoded = decodeDsiAdpcm(encodeDsiAdpcm(pcm))
  let total = 0

  for (let index = 0; index < pcm.length; index++) {
    total += Math.abs(pcm[index] - decoded[index])
  }

  assert.ok(total / pcm.length < 300)
})

test('ADPCM: 3DS の音を往復しても大きくずれない', () => {
  const pcm = new Int16Array(4000)

  for (let index = 0; index < pcm.length; index++) {
    pcm[index] = Math.sin(index / 20) * 12000
  }

  const decoded = decodeN3dsAdpcm(encodeN3dsAdpcm(pcm))
  let total = 0

  for (let index = 200; index < pcm.length; index++) {
    total += Math.abs(pcm[index] - decoded[index])
  }

  assert.ok(total / pcm.length < 600)
})

test('ファイル名: 実機の名前は 28 文字、DSi は先頭がチェック文字', () => {
  const name = makeKwzFileName('00112233445566778899', 700000000, 700000100)

  assert.equal(name.length, 28)
  assert.match(
    ppmLocalFileName('1234AB_0123456789ABC_001'),
    /^[0-9A-Z]234AB_0123456789ABC_001$/,
  )
})

test('署名: 書き出した実機の形式は鍵で検証できる', async () => {
  const dsi = Note.create({ title: 't', profile: 'dsi' })
  const n3ds = Note.create({ title: 't', profile: '3ds' })
  const ppm = await exportPpm(dsi, {})
  const kwz = await exportKwz(n3ds, { encodeJpeg: fakeJpeg })

  assert.ok(verifyPpm(ppm.bytes))
  assert.ok(verifyKwz(kwz.bytes))
})

test('変換: 自由なノートを実機の形式へ書き出して読み戻せる', async () => {
  const note = Note.create({ title: 'てすと', profile: 'free' })
  const { grid, store, frames } = note
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(grid.width * grid.height)
  const random = seededRandom(4)

  for (let index = 0; index < 20000; index++) {
    plane[Math.floor(random() * plane.length)] = 1 + (index % 7)
  }

  frames.setCel(0, 0, packPlane(store, plane, grid, scratch))

  const ppm = await exportPpm(note, {})

  assert.ok(ppm.warnings.includes('converted'))
  assert.equal(new PpmReader(ppm.bytes).frameCount, 1)

  const kwz = await exportKwz(note, { encodeJpeg: fakeJpeg })

  assert.equal(new KwzReader(kwz.bytes).frameCount, 1)
  assert.equal(kwz.fileName.length, 32)
})

test('DSi のノート: 新規作成から書き出して読み戻すと絵が一致する', async () => {
  const note = Note.create({ title: 'あ', profile: 'dsi' })
  const { grid, store, frames } = note
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(256 * 192)

  for (let index = 0; index < 256; index++)
    plane[(index * 193) % plane.length] = 1

  frames.setCel(0, 0, packPlane(store, plane, grid, scratch))

  const file = await exportPpm(note, {})
  const restored = await importFlipnote(file.bytes)
  const out = new Uint8Array(plane.length)

  loadPlane(restored.store, restored.frames.cel(0, 0), out, grid, scratch)
  assert.deepEqual(out, plane)
  assert.match(file.fileName, /^[0-9A-Z][0-9A-F]{5}_[0-9A-F]{13}_001\.ppm$/)
})
