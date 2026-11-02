import { ByteReader, ByteWriter } from './../core/bytes.ts'
import { decodeDsiAdpcm, encodeDsiAdpcm } from './adpcm.ts'
import {
  bytesToHex,
  formatPpmFileName,
  fromNintendoTime,
  hexToBytes,
  packPpmFileName,
  toNintendoTime,
  unpackPpmFileName,
} from './naming.ts'
import { PPM_SIGNATURE_BYTES, signPpm } from './sign.ts'
import { PROFILES } from '../core/profile.ts'
import type { FlipnoteInfo } from '../core/note.ts'

export const PPM_WIDTH = 256
export const PPM_HEIGHT = 192
export const PPM_RATE = PROFILES.dsi.audio?.rate ?? 8180
const PPM_THUMBNAIL_BYTES = 1536

export const PPM_MAX_BYTES = 0x100090
export const PPM_MAX_FRAME_BYTES = 0xb3e20

const MAGIC = 0x41524150
const LINE_BYTES = 32
const LAYER_BYTES = LINE_BYTES * PPM_HEIGHT
const FRAME_BYTES = LAYER_BYTES * 2
const FRAME_BITS = FRAME_BYTES * 8
const LINE_TYPE_BYTES = PPM_HEIGHT / 4
const KEY_INTERVAL = 16
const MAX_PAGES = 999
const ANIMATION_OFFSET = 0x6a0
const SOUND_HEADER_BYTES = 32
const SOUND_FILE_PADDING = 16
const FORMAT_VERSION = 0x24
const FLAG_LOOP = 0x2
const FLAG_ALWAYS = 0x40
const FLAG_KEPT = 0x0d
const NAME_LENGTH = 11
const SPEED_LEVELS = 8
const DEFAULT_AUTHOR = '0011223344556607'

const FILE_NAME_PATTERN = /^([0-9A-F]{6})_([0-9A-F]{13})_(\d{3})$/

export interface PpmFrame {
  layers: [Uint8Array, Uint8Array]
  paper: number
  pens: [number, number]
  sounds: number
}

export interface PpmAudio {
  bgm: Int16Array<ArrayBuffer> | null
  sounds: (Int16Array<ArrayBuffer> | null)[]
}

export interface PpmInput extends PpmAudio {
  frames: Iterable<PpmFrame> | AsyncIterable<PpmFrame>
  frameCount: number
  speed: number
  bgmSpeed: number
  loop: boolean
  name: string
  thumbnail: Uint8Array
  thumbnailPage: number
  info: FlipnoteInfo | null
}

const POPULATION = new Uint8Array(256)

for (let value = 1; value < 256; value++) {
  POPULATION[value] = (value & 1) + POPULATION[value >> 1]
}

function packFrame(frame: PpmFrame, out: Uint8Array): void {
  out.fill(0)

  for (let layer = 0; layer < 2; layer++) {
    const plane = frame.layers[layer]
    const base = layer * LAYER_BYTES

    for (let index = 0; index < plane.length; index++) {
      if (plane[index]) out[base + (index >> 3)] |= 1 << (index & 7)
    }
  }
}

function inkAmount(bytes: Uint8Array): number {
  let count = 0

  for (let index = 0; index < bytes.length; index++) {
    count += POPULATION[bytes[index]]
  }

  return count >= FRAME_BITS / 2 ? FRAME_BITS - count : count
}

function flatLines(bytes: Uint8Array): number {
  let lines = 0

  for (let line = 0; line < PPM_HEIGHT * 2; line++) {
    let isFlat = 1

    for (let word = 0; word < 8 && isFlat; word++) {
      const start = line * LINE_BYTES + word * 4
      const a = bytes[start]
      const b = bytes[start + 1]
      const c = bytes[start + 2]
      const d = bytes[start + 3]

      if ((a | b | c | d) !== 0 && (a & b & c & d) !== 0xff) isFlat = 0
    }

    lines += isFlat
  }

  return lines
}

function writeLine(line: Uint8Array, data: ByteWriter): number {
  let zero = 0
  let full = 0

  for (const byte of line) {
    if (byte === 0) zero++
    else if (byte === 0xff) full++
  }

  if (zero === LINE_BYTES) return 0

  if (full + zero <= 4) {
    data.bytes(line)

    return 3
  }

  const skipped = full > zero ? 0xff : 0
  let flags = 0

  for (let index = 0; index < LINE_BYTES; index++) {
    if (line[index] !== skipped) flags |= 0x80000000 >>> index
  }

  data.u8(flags >>> 24)
  data.u8((flags >>> 16) & 0xff)
  data.u8((flags >>> 8) & 0xff)
  data.u8(flags & 0xff)

  for (const byte of line) {
    if (byte !== skipped) data.u8(byte)
  }

  return full > zero ? 2 : 1
}

function encodeFrame(
  frame: PpmFrame,
  index: number,
  raw: Uint8Array,
  previous: Uint8Array,
): Uint8Array {
  let body = raw
  let isDifference = false

  if (index > 0 && index % KEY_INTERVAL !== 0) {
    const difference = new Uint8Array(FRAME_BYTES)

    for (let byte = 0; byte < FRAME_BYTES; byte++) {
      difference[byte] = raw[byte] ^ previous[byte]
    }

    if (
      inkAmount(difference) < inkAmount(raw) &&
      flatLines(difference) >= flatLines(raw)
    ) {
      body = difference
      isDifference = true
    }
  }

  const types = new Uint8Array(LINE_TYPE_BYTES * 2)
  const data = new ByteWriter(1024)

  for (let line = 0; line < PPM_HEIGHT * 2; line++) {
    const start = line * LINE_BYTES
    const type = writeLine(body.subarray(start, start + LINE_BYTES), data)

    types[line >> 2] |= type << ((line & 3) * 2)
  }

  const out = new ByteWriter(1 + types.length + data.length)

  out.u8(
    (isDifference ? 0 : 0x80) |
      ((frame.pens[1] & 3) << 3) |
      ((frame.pens[0] & 3) << 1) |
      (frame.paper & 1),
  )
  out.bytes(types)
  out.bytes(data.finish())

  return out.finish()
}

function writeName(out: ByteWriter, name: string): void {
  for (let index = 0; index < NAME_LENGTH; index++) {
    out.u16(index < name.length ? name.charCodeAt(index) : 0)
  }
}

function writeId(out: ByteWriter, hex: string): void {
  const text = (hex || DEFAULT_AUTHOR).padEnd(16, '0').slice(0, 16)
  const bytes = hexToBytes(text)

  for (let index = 7; index >= 0; index--) out.u8(bytes[index] ?? 0)
}

function writeFileName(out: ByteWriter, name: string): void {
  const match = FILE_NAME_PATTERN.exec(name)

  out.bytes(
    packPpmFileName(
      match?.[1] ?? '123456',
      match?.[2] ?? '0123456789ABC',
      match ? parseInt(match[3], 10) : 0,
    ),
  )
}

export async function writePpm(
  input: PpmInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const encoded: Uint8Array[] = []
  const raw = new Uint8Array(FRAME_BYTES)
  const previous = new Uint8Array(FRAME_BYTES)
  let frameData = 0
  let index = 0

  const soundMarks = new Uint8Array(input.frameCount)

  for await (const frame of input.frames) {
    packFrame(frame, raw)

    const bytes = encodeFrame(frame, index, raw, previous)

    encoded.push(bytes)
    frameData += bytes.length
    previous.set(raw)
    soundMarks[index] = frame.sounds & 7
    index++
  }

  const pages = encoded.length
  const tableBytes = pages * 4
  const animationBytes = alignUp(8 + tableBytes + frameData)
  const soundMarksEnd = ANIMATION_OFFSET + animationBytes + pages
  const soundStart = alignUp(soundMarksEnd)

  const tracks = [input.bgm, ...input.sounds.slice(0, 3)].map(track =>
    track?.length ? encodeDsiAdpcm(track) : new Uint8Array(0),
  )

  while (tracks.length < 4) tracks.push(new Uint8Array(0))

  const soundBytes = tracks.reduce((sum, track) => sum + track.length, 0)
  const info = input.info
  const out = new ByteWriter(soundStart + SOUND_HEADER_BYTES + soundBytes)

  out.u32(MAGIC)
  out.u32(animationBytes)
  out.u32(soundBytes)
  out.u16(pages - 1)
  out.u16(FORMAT_VERSION)
  out.u16(info?.locked ? 1 : 0)
  out.u16(Math.min(input.thumbnailPage, pages - 1))

  writeName(out, info?.rootName || input.name)
  writeName(out, info?.parentName || input.name)
  writeName(out, info?.currentName || input.name)

  writeId(out, info?.parentId ?? '')
  writeId(out, info?.currentId ?? '')
  writeFileName(out, info?.parentFile ?? '')
  writeFileName(out, info?.currentFile ?? '')
  writeId(out, info?.rootId ?? '')

  const current = FILE_NAME_PATTERN.exec(info?.currentFile ?? '')
  const random = current?.[2] ?? '0123456789ABC'

  out.bytes(hexToBytes(current?.[1] ?? '123456'))

  for (let digit = 0; digit < 10; digit += 2) {
    out.u8(parseInt(random.slice(digit, digit + 2), 16))
  }

  const modified = info?.modified || Math.floor(Date.now() / 1000)

  out.u32(toNintendoTime(modified))
  out.u16(0)
  out.bytes(input.thumbnail.subarray(0, PPM_THUMBNAIL_BYTES))
  padTo(out, ANIMATION_OFFSET)

  const keptFlags =
    info && info.flags & FLAG_ALWAYS ? info.flags & FLAG_KEPT : 0

  out.u16(tableBytes)
  out.u16(0)
  out.u16(0)
  out.u16(FLAG_ALWAYS | keptFlags | (input.loop ? FLAG_LOOP : 0))

  let offset = 0

  for (const bytes of encoded) {
    out.u32(offset)
    offset += bytes.length
  }

  for (const bytes of encoded) out.bytes(bytes)

  padTo(out, ANIMATION_OFFSET + animationBytes)
  out.bytes(soundMarks.subarray(0, pages))
  padTo(out, soundStart)

  for (const track of tracks) out.u32(track.length)

  out.u8(SPEED_LEVELS - clampSpeed(input.speed))
  out.u8(SPEED_LEVELS - clampSpeed(input.bgmSpeed))
  padTo(out, soundStart + SOUND_HEADER_BYTES)

  for (const track of tracks) out.bytes(track)

  const body = out.finish()
  const signature = await signPpm(body)
  const file = new Uint8Array(
    body.length + PPM_SIGNATURE_BYTES + SOUND_FILE_PADDING,
  )

  file.set(body)
  file.set(signature, body.length)

  return file
}

function clampSpeed(speed: number): number {
  return Math.max(1, Math.min(SPEED_LEVELS, speed))
}

function padTo(out: ByteWriter, length: number): void {
  while (out.length < length) out.u8(0)
}

function alignUp(value: number): number {
  return (value + 3) & ~3
}

export class PpmReader {
  readonly frameCount: number
  readonly thumbnailPage: number
  readonly loop: boolean
  readonly info: FlipnoteInfo
  readonly speed: number
  readonly bgmSpeed: number

  private readonly bytes: Uint8Array
  private readonly view: DataView
  private readonly offsets: number[] = []
  private readonly frameBase: number
  private readonly soundMarks: number
  private readonly soundStart: number

  constructor(bytes: Uint8Array) {
    if (bytes.length < ANIMATION_OFFSET) {
      throw new RangeError('PPM が短すぎます')
    }

    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    if (this.view.getUint32(0, true) !== MAGIC) {
      throw new RangeError('PPM ではありません')
    }

    const animationBytes = this.view.getUint32(4, true)
    const declared = Math.min(this.view.getUint16(12, true) + 1, MAX_PAGES)
    const tableBytes = this.view.getUint16(ANIMATION_OFFSET, true)
    const flags = this.view.getUint16(ANIMATION_OFFSET + 6, true)

    this.frameBase = ANIMATION_OFFSET + 8 + tableBytes

    for (let page = 0; page < declared; page++) {
      const entry = ANIMATION_OFFSET + 8 + page * 4

      if (entry + 4 > bytes.length) break

      const offset = this.view.getUint32(entry, true)

      if (this.frameBase + offset >= bytes.length) break

      this.offsets.push(offset)
    }

    this.frameCount = this.offsets.length

    if (this.frameCount < 1) throw new RangeError('PPM にページがありません')

    this.loop = (flags & FLAG_LOOP) !== 0
    this.soundMarks = ANIMATION_OFFSET + animationBytes
    this.soundStart = alignUp(this.soundMarks + this.frameCount)

    const thumbnailPage = this.view.getInt16(0x12, true)

    this.thumbnailPage =
      thumbnailPage >= 0 && thumbnailPage < this.frameCount ? thumbnailPage : 0

    this.speed = this.readSpeed(16, 6)
    this.bgmSpeed = this.readSpeed(17, this.speed)
    this.info = this.readInfo(flags)
  }

  private readSpeed(offset: number, fallback: number): number {
    const position = this.soundStart + offset

    if (position >= this.bytes.length) return fallback

    const speed = SPEED_LEVELS - this.bytes[position]

    return speed >= 1 && speed <= SPEED_LEVELS ? speed : fallback
  }

  private readName(offset: number): string {
    let text = ''

    for (let index = 0; index < NAME_LENGTH; index++) {
      const code = this.view.getUint16(offset + index * 2, true)

      if (code === 0) break

      text += String.fromCharCode(code)
    }

    return text
  }

  private readId(offset: number): string {
    return bytesToHex(this.bytes.slice(offset, offset + 8).reverse())
  }

  private readFileName(offset: number): string {
    const name = unpackPpmFileName(this.bytes.subarray(offset, offset + 18))

    return formatPpmFileName(name.mac, name.random, name.edits)
  }

  private readInfo(flags: number): FlipnoteInfo {
    const currentFile = this.bytes.subarray(0x78, 0x8a)
    const modified = fromNintendoTime(this.view.getUint32(0x9a, true))

    return {
      created: modified,
      modified,
      appVersion: 0,
      rootId: this.readId(0x8a),
      parentId: this.readId(0x56),
      currentId: this.readId(0x5e),
      rootName: this.readName(0x14),
      parentName: this.readName(0x2a),
      currentName: this.readName(0x40),
      rootFile: '',
      parentFile: this.readFileName(0x66),
      currentFile: this.readFileName(0x78),
      locked: this.view.getUint16(0x10, true) !== 0,
      flags,
      layerFlags: 0,
      edits: unpackPpmFileName(currentFile).edits,
    }
  }

  *frames(): Generator<PpmFrame> {
    const pixels = PPM_WIDTH * PPM_HEIGHT
    const planes: [Uint8Array, Uint8Array] = [
      new Uint8Array(pixels),
      new Uint8Array(pixels),
    ]
    const previous = [new Uint8Array(pixels), new Uint8Array(pixels)]
    const types = new Uint8Array(PPM_HEIGHT * 2)

    for (let page = 0; page < this.frameCount; page++) {
      const reader = new ByteReader(
        this.bytes.subarray(this.frameBase + this.offsets[page]),
      )

      const header = reader.u8()
      const isKey = (header & 0x80) !== 0
      const shift = (header >> 5) & 3
      let shiftX = 0
      let shiftY = 0

      if (shift) {
        shiftX = (reader.u8() << 24) >> 24
        shiftY = (reader.u8() << 24) >> 24
      }

      for (let index = 0; index < types.length; index += 4) {
        const value = reader.u8()

        types[index] = value & 3
        types[index + 1] = (value >> 2) & 3
        types[index + 2] = (value >> 4) & 3
        types[index + 3] = (value >> 6) & 3
      }

      planes[0].fill(0)
      planes[1].fill(0)

      for (let line = 0; line < PPM_HEIGHT * 2; line++) {
        const layer = line < PPM_HEIGHT ? 0 : 1
        const row = line % PPM_HEIGHT

        readLine(reader, types[line], planes[layer], row * PPM_WIDTH)
      }

      if (!isKey) {
        applyDifference(planes[0], previous[0], shiftX, shiftY)
        applyDifference(planes[1], previous[1], shiftX, shiftY)
      }

      previous[0].set(planes[0])
      previous[1].set(planes[1])

      yield {
        layers: planes,
        paper: header & 1,
        pens: [(header >> 1) & 3, (header >> 3) & 3],
        sounds: this.soundMarkAt(page),
      }
    }
  }

  private soundMarkAt(page: number): number {
    const position = this.soundMarks + page

    return position < this.bytes.length ? this.bytes[position] & 7 : 0
  }

  audio(): PpmAudio {
    const start = this.soundStart

    if (start + SOUND_HEADER_BYTES > this.bytes.length) {
      return { bgm: null, sounds: [null, null, null] }
    }

    let position = start + SOUND_HEADER_BYTES

    const read = (index: number): Int16Array<ArrayBuffer> | null => {
      const length = this.view.getUint32(start + index * 4, true)
      const track = this.bytes.subarray(position, position + length)

      position += length

      return length > 0 ? decodeDsiAdpcm(track) : null
    }

    return { bgm: read(0), sounds: [read(1), read(2), read(3)] }
  }
}

function readLine(
  reader: ByteReader,
  type: number,
  plane: Uint8Array,
  rowStart: number,
): void {
  if (type === 0) return

  if (type === 3) {
    for (let chunk = 0; chunk < LINE_BYTES; chunk++) {
      writeChunk(plane, rowStart + chunk * 8, reader.u8())
    }

    return
  }

  const flags = reader.bytes(4)
  const word =
    ((flags[0] << 24) | (flags[1] << 16) | (flags[2] << 8) | flags[3]) >>> 0

  for (let chunk = 0; chunk < LINE_BYTES; chunk++) {
    if (word & (0x80000000 >>> chunk)) {
      writeChunk(plane, rowStart + chunk * 8, reader.u8())
    } else if (type === 2) {
      writeChunk(plane, rowStart + chunk * 8, 0xff)
    }
  }
}

function writeChunk(plane: Uint8Array, start: number, byte: number): void {
  for (let bit = 0; bit < 8; bit++) plane[start + bit] = (byte >> bit) & 1
}

function applyDifference(
  plane: Uint8Array,
  previous: Uint8Array,
  shiftX: number,
  shiftY: number,
): void {
  if (shiftX === 0 && shiftY === 0) {
    for (let index = 0; index < plane.length; index++) {
      plane[index] ^= previous[index]
    }

    return
  }

  const left = Math.max(shiftX, 0)
  const top = Math.max(shiftY, 0)
  const right = Math.min(PPM_WIDTH + shiftX, PPM_WIDTH)
  const bottom = Math.min(PPM_HEIGHT + shiftY, PPM_HEIGHT)
  const offset = shiftY * PPM_WIDTH + shiftX

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const index = y * PPM_WIDTH + x

      plane[index] ^= previous[index - offset]
    }
  }
}
