import { ByteWriter, crc32 } from '../core/bytes.ts'
import type { FlipnoteInfo } from '../core/note.ts'
import { PROFILES } from '../core/profile.ts'
import { decodeN3dsAdpcm, encodeN3dsAdpcm } from './adpcm.ts'
import {
  bytesToHex,
  fromNintendoTime,
  hexToBytes,
  toNintendoTime,
} from './naming.ts'
import { KWZ_SIGNATURE_BYTES, signKwz } from './sign.ts'

export const KWZ_FRAME_WIDTH = 320
export const KWZ_FRAME_HEIGHT = 240
export const KWZ_BORDER = 5
export const KWZ_RATE = PROFILES['3ds'].audio?.rate ?? 16364

const COMMON_LINES = [
  0x0000, 0x0cd0, 0x19a0, 0x02d9, 0x088b, 0x0051, 0x00f3, 0x0009, 0x001b,
  0x0001, 0x0003, 0x05b2, 0x1116, 0x00a2, 0x01e6, 0x0012, 0x0036, 0x0002,
  0x0006, 0x0b64, 0x08dc, 0x0144, 0x00fc, 0x0024, 0x001c, 0x0004, 0x0334,
  0x099c, 0x0668, 0x1338, 0x1004, 0x166c,
]

const COMMON_INDEX = new Int8Array(6561).fill(-1)

COMMON_LINES.forEach((line, index) => {
  COMMON_INDEX[line] = index
})

const TILE = 8
const LARGE_TILE = 128
const LINE_VALUES = 6561
const LINE_POWERS = [729, 2187, 81, 243, 9, 27, 1, 3]
const KFH_BODY_BYTES = 0xcc
const KMI_ENTRY_BYTES = 28
const KSN_HEADER_BYTES = 28
const MAX_SKIP = 32
const UNCHANGED_LAYER_BYTES = 38
const SECTION_MARKS: Record<string, number> = {
  KFH: 0x14,
  KTN: 0x02,
  KMC: 0x02,
  KMI: 0x05,
  KSN: 0x01,
}

export const KWZ_FLAG_ADVANCED = 0x10
const FLAG_LOCK = 0x1
const FLAG_LOOP = 0x2
const NAME_LENGTH = 11
const ID_BYTES = 10
const FILE_NAME_BYTES = 28

const TILE_KIND_COMMON = 0
const TILE_KIND_LINE = 1
const TILE_KIND_COMMON_SHIFTED = 2
const TILE_KIND_LINE_SHIFTED = 3
const TILE_KIND_MIXED = 4
const TILE_KIND_SKIP = 5
const TILE_KIND_PATTERN = 7

const ROW_PATTERNS = [
  [0, 1, 0, 1, 0, 1, 0, 1],
  [0, 0, 1, 0, 0, 1, 0, 0],
  [0, 1, 0, 0, 1, 0, 0, 1],
  [0, 1, 1, 0, 1, 1, 0, 1],
]

export interface KwzFrame {
  layers: [Uint8Array, Uint8Array, Uint8Array]
  paper: number
  colors: [number, number, number, number, number, number]
  depth: [number, number, number]
  sounds: number
  unchanged?: [boolean, boolean, boolean]
}

export interface KwzAudio {
  bgm: Int16Array<ArrayBuffer> | null
  sounds: (Int16Array<ArrayBuffer> | null)[]
}

export interface KwzInput extends KwzAudio {
  frames: Iterable<KwzFrame> | AsyncIterable<KwzFrame>
  frameCount: number
  speed: number
  bgmSpeed: number
  loop: boolean
  name: string
  thumbnail: Uint8Array
  thumbnailPage: number
  info: FlipnoteInfo | null
}

function lineIndex(plane: Uint8Array, offset: number): number {
  return (
    plane[offset + 1] * 2187 +
    plane[offset] * 729 +
    plane[offset + 3] * 243 +
    plane[offset + 2] * 81 +
    plane[offset + 5] * 27 +
    plane[offset + 4] * 9 +
    plane[offset + 7] * 3 +
    plane[offset + 6]
  )
}

class BitWriter {
  private readonly out = new ByteWriter(2048)
  private buffer = 0
  private bits = 0

  push(value: number, count: number): void {
    this.buffer |= value << this.bits
    this.bits += count

    while (this.bits >= 16) {
      this.out.u16(this.buffer & 0xffff)
      this.buffer >>>= 16
      this.bits -= 16
    }
  }

  finish(): Uint8Array {
    if (this.bits > 0) {
      this.out.u16(this.buffer & 0xffff)
      this.buffer = 0
      this.bits = 0
    }

    return this.out.finish()
  }
}

function isSameTile(
  plane: Uint8Array,
  previous: Uint8Array,
  x: number,
  y: number,
): boolean {
  for (let row = 0; row < TILE; row++) {
    const start = (y + row) * KWZ_FRAME_WIDTH + x

    for (let column = 0; column < TILE; column++) {
      if (plane[start + column] !== previous[start + column]) return false
    }
  }

  return true
}

function pushSkip(writer: BitWriter, run: number): void {
  writer.push(TILE_KIND_SKIP, 3)
  writer.push(run - 1, 5)
}

const tileLines = new Int32Array(TILE)

function pushTile(writer: BitWriter, plane: Uint8Array, x: number, y: number) {
  let isUniform = true

  for (let row = 0; row < TILE; row++) {
    tileLines[row] = lineIndex(plane, (y + row) * KWZ_FRAME_WIDTH + x)

    if (tileLines[row] !== tileLines[0]) isUniform = false
  }

  if (isUniform) {
    const common = COMMON_INDEX[tileLines[0]]

    if (common >= 0) {
      writer.push(TILE_KIND_COMMON, 3)
      writer.push(common, 5)
    } else {
      writer.push(TILE_KIND_LINE, 3)
      writer.push(tileLines[0], 13)
    }

    return
  }

  let flags = 0

  for (let row = 0; row < TILE; row++) {
    if (COMMON_INDEX[tileLines[row]] >= 0) flags |= 1 << row
  }

  writer.push(TILE_KIND_MIXED, 3)
  writer.push(flags, 8)

  for (let row = 0; row < TILE; row++) {
    const common = COMMON_INDEX[tileLines[row]]

    if (common >= 0) writer.push(common, 5)
    else writer.push(tileLines[row], 13)
  }
}

function encodeKwzLayer(
  plane: Uint8Array,
  previous: Uint8Array | null,
): Uint8Array {
  const writer = new BitWriter()
  let run = 0
  let isAllSkipped = true

  for (let top = 0; top < KWZ_FRAME_HEIGHT; top += LARGE_TILE) {
    for (let left = 0; left < KWZ_FRAME_WIDTH; left += LARGE_TILE) {
      for (let tileY = 0; tileY < LARGE_TILE; tileY += TILE) {
        const y = top + tileY

        if (y >= KWZ_FRAME_HEIGHT) break

        for (let tileX = 0; tileX < LARGE_TILE; tileX += TILE) {
          const x = left + tileX

          if (x >= KWZ_FRAME_WIDTH) break

          if (previous && isSameTile(plane, previous, x, y)) {
            run++

            if (run === MAX_SKIP) {
              pushSkip(writer, run)
              run = 0
            }

            continue
          }

          if (run > 0) {
            pushSkip(writer, run)
            run = 0
          }

          isAllSkipped = false
          pushTile(writer, plane, x, y)
        }
      }
    }
  }

  if (run > 0) pushSkip(writer, run)

  const bytes = writer.finish()

  if (bytes.length === UNCHANGED_LAYER_BYTES && !isAllSkipped) {
    const padded = new Uint8Array(UNCHANGED_LAYER_BYTES + 2)

    padded.set(bytes)

    return padded
  }

  return bytes
}

function writeName(out: ByteWriter, name: string): void {
  for (let index = 0; index < NAME_LENGTH; index++) {
    out.u16(index < name.length ? name.charCodeAt(index) : 0)
  }
}

function writeId(out: ByteWriter, hex: string): void {
  const bytes = hexToBytes(hex)

  for (let index = 0; index < ID_BYTES; index++) out.u8(bytes[index] ?? 0)
}

function writeFileName(out: ByteWriter, name: string): void {
  for (let index = 0; index < FILE_NAME_BYTES; index++) {
    out.u8(index < name.length ? name.charCodeAt(index) & 0x7f : 0)
  }
}

function stampCrc(body: Uint8Array): void {
  const crc = crc32(body.subarray(4))

  new DataView(body.buffer, body.byteOffset).setUint32(0, crc, true)
}

function section(name: string, body: Uint8Array): Uint8Array {
  const padding = (4 - (body.length & 3)) & 3
  const out = new ByteWriter(body.length + padding + 8)

  for (let index = 0; index < 3; index++) out.u8(name.charCodeAt(index))

  out.u8(SECTION_MARKS[name])
  out.u32(body.length + padding)
  out.bytes(body)

  for (let index = 0; index < padding; index++) out.u8(0)

  return out.finish()
}

function writeHeader(input: KwzInput, pages: number): Uint8Array {
  const info = input.info
  const now = toNintendoTime(Date.now() / 1000)
  const out = new ByteWriter(KFH_BODY_BYTES)

  const created = info?.created ? toNintendoTime(info.created) : now
  const modified = info?.modified ? toNintendoTime(info.modified) : now
  const baseFlags = (info?.flags ?? 0) & ~(FLAG_LOCK | FLAG_LOOP)

  out.u32(0)
  out.u32(created)
  out.u32(modified)
  out.u32(info?.appVersion ?? 0)
  writeId(out, info?.rootId ?? '')
  writeId(out, info?.parentId ?? '')
  writeId(out, info?.currentId ?? '')
  writeName(out, info?.rootName || input.name)
  writeName(out, info?.parentName || input.name)
  writeName(out, info?.currentName || input.name)
  writeFileName(out, info?.rootFile ?? '')
  writeFileName(out, info?.parentFile ?? '')
  writeFileName(out, info?.currentFile ?? '')
  out.u16(pages)
  out.u16(Math.min(input.thumbnailPage, Math.max(0, pages - 1)))
  out.u16(
    baseFlags | (info?.locked ? FLAG_LOCK : 0) | (input.loop ? FLAG_LOOP : 0),
  )
  out.u8(input.speed)
  out.u8(info?.layerFlags ?? 0)

  const body = out.finish()

  stampCrc(body)

  return body
}

function writeSound(input: KwzInput): Uint8Array {
  const tracks = [input.bgm, ...input.sounds.slice(0, 4)].map(track =>
    track?.length ? encodeN3dsAdpcm(track) : new Uint8Array(0),
  )

  while (tracks.length < 5) tracks.push(new Uint8Array(0))

  const total = tracks.reduce((sum, track) => sum + track.length, 0)
  const joined = new Uint8Array(total)
  let position = 0

  for (const track of tracks) {
    joined.set(track, position)
    position += track.length
  }

  const out = new ByteWriter(KSN_HEADER_BYTES + total)

  out.u32(input.bgmSpeed)

  for (const track of tracks) out.u32(track.length)

  out.u32(crc32(joined))
  out.bytes(joined)

  return out.finish()
}

export async function writeKwz(
  input: KwzInput,
): Promise<Uint8Array<ArrayBuffer>> {
  const pixels = KWZ_FRAME_WIDTH * KWZ_FRAME_HEIGHT
  const previous = [
    new Uint8Array(pixels),
    new Uint8Array(pixels),
    new Uint8Array(pixels),
  ]

  const pictures = new ByteWriter(64 * 1024)
  const entries = new ByteWriter(input.frameCount * KMI_ENTRY_BYTES)
  const author = input.info?.currentId ?? ''
  let page = 0

  pictures.u32(0)

  for await (const frame of input.frames) {
    const sizes = [0, 0, 0]

    for (let layer = 0; layer < 3; layer++) {
      const plane = frame.layers[layer]
      const bytes = encodeKwzLayer(plane, page > 0 ? previous[layer] : null)

      sizes[layer] = bytes.length
      pictures.bytes(bytes)
      previous[layer].set(plane)
    }

    writeFrameEntry(entries, frame, sizes, author)
    page++
  }

  const pictureBody = pictures.finish()

  stampCrc(pictureBody)

  const thumbnail = new ByteWriter(input.thumbnail.length + 4)

  thumbnail.u32(crc32(input.thumbnail))
  thumbnail.bytes(input.thumbnail)

  const sections = [
    section('KFH', writeHeader(input, page)),
    section('KTN', thumbnail.finish()),
    section('KMC', pictureBody),
    section('KMI', entries.finish()),
    section('KSN', writeSound(input)),
  ]

  const total = sections.reduce((sum, part) => sum + part.length, 0)
  const body = new Uint8Array(total)
  let position = 0

  for (const part of sections) {
    body.set(part, position)
    position += part.length
  }

  const signature = await signKwz(body)
  const file = new Uint8Array(total + KWZ_SIGNATURE_BYTES)

  file.set(body)
  file.set(signature, total)

  return file
}

function writeFrameEntry(
  out: ByteWriter,
  frame: KwzFrame,
  sizes: number[],
  author: string,
): void {
  let flags = frame.paper & 0xf

  frame.colors.forEach((color, index) => {
    flags |= (color & 0xf) << (8 + index * 4)
  })

  out.u32(flags >>> 0)

  for (const size of sizes) out.u16(size)

  writeId(out, author)

  for (const depth of frame.depth) out.u8(depth)

  out.u8(frame.sounds & 0xf)
  out.u16(0)
  out.u16(0)
}

const LINE_TABLE = buildLineTable()
const SHIFTED_LINE_TABLE = buildShiftedLineTable()

function buildLineTable(): Uint8Array {
  const table = new Uint8Array(LINE_VALUES * 8)

  for (let line = 0; line < LINE_VALUES; line++) {
    for (let pixel = 0; pixel < 8; pixel++) {
      table[line * 8 + pixel] = Math.floor(line / LINE_POWERS[pixel]) % 3
    }
  }

  return table
}

function buildShiftedLineTable(): Uint8Array {
  const table = new Uint8Array(LINE_VALUES * 8)

  for (let line = 0; line < LINE_VALUES; line++) {
    for (let pixel = 0; pixel < 8; pixel++) {
      table[line * 8 + pixel] = LINE_TABLE[line * 8 + ((pixel + 1) & 7)]
    }
  }

  return table
}

class BitReader {
  private readonly bytes: Uint8Array
  private position: number
  private buffer = 0
  private bits = 0

  constructor(bytes: Uint8Array, start: number) {
    this.bytes = bytes
    this.position = start
  }

  read(count: number): number {
    while (this.bits < count) {
      const low = this.bytes[this.position] ?? 0
      const high = this.bytes[this.position + 1] ?? 0

      this.position += 2
      this.buffer |= (low | (high << 8)) << this.bits
      this.bits += 16
    }

    const value = this.buffer & ((1 << count) - 1)

    this.buffer >>>= count
    this.bits -= count

    return value
  }
}

function putLine(
  plane: Uint8Array,
  x: number,
  y: number,
  line: number,
  table: Uint8Array,
): void {
  const start = y * KWZ_FRAME_WIDTH + x
  const source = line * 8

  for (let pixel = 0; pixel < 8; pixel++) {
    plane[start + pixel] = table[source + pixel]
  }
}

function decodeTile(
  reader: BitReader,
  kind: number,
  plane: Uint8Array,
  x: number,
  y: number,
): void {
  const readCommon = (): number => COMMON_LINES[reader.read(5)]

  if (kind === TILE_KIND_COMMON || kind === TILE_KIND_LINE) {
    const line = kind === TILE_KIND_COMMON ? readCommon() : reader.read(13)

    for (let row = 0; row < TILE; row++) {
      putLine(plane, x, y + row, line, LINE_TABLE)
    }
  } else if (
    kind === TILE_KIND_COMMON_SHIFTED ||
    kind === TILE_KIND_LINE_SHIFTED
  ) {
    const isCommon = kind === TILE_KIND_COMMON_SHIFTED
    const line = isCommon ? readCommon() : reader.read(13)

    for (let row = 0; row < TILE; row++) {
      const table = row & 1 ? SHIFTED_LINE_TABLE : LINE_TABLE

      putLine(plane, x, y + row, line, table)
    }
  } else if (kind === TILE_KIND_MIXED) {
    const flags = reader.read(8)

    for (let row = 0; row < TILE; row++) {
      const line = flags & (1 << row) ? readCommon() : reader.read(13)

      putLine(plane, x, y + row, line, LINE_TABLE)
    }
  } else if (kind === TILE_KIND_PATTERN) {
    let pattern = reader.read(2)
    const useCommon = reader.read(1)
    let first: number
    let second: number

    if (useCommon) {
      first = readCommon()
      second = readCommon()
      pattern += 1
    } else {
      first = reader.read(13)
      second = reader.read(13)
    }

    const rows = ROW_PATTERNS[pattern % 4]

    for (let row = 0; row < TILE; row++) {
      const line = rows[row] ? second : first

      putLine(plane, x, y + row, line, LINE_TABLE)
    }
  }
}

function decodeKwzLayer(
  bytes: Uint8Array,
  start: number,
  plane: Uint8Array,
): void {
  const reader = new BitReader(bytes, start)
  let skipping = 0

  for (let top = 0; top < KWZ_FRAME_HEIGHT; top += LARGE_TILE) {
    for (let left = 0; left < KWZ_FRAME_WIDTH; left += LARGE_TILE) {
      for (let tileY = 0; tileY < LARGE_TILE; tileY += TILE) {
        const y = top + tileY

        if (y >= KWZ_FRAME_HEIGHT) break

        for (let tileX = 0; tileX < LARGE_TILE; tileX += TILE) {
          const x = left + tileX

          if (x >= KWZ_FRAME_WIDTH) break

          if (skipping > 0) {
            skipping--
            continue
          }

          const kind = reader.read(3)

          if (kind === TILE_KIND_SKIP) skipping = reader.read(5)
          else decodeTile(reader, kind, plane, x, y)
        }
      }
    }
  }
}

interface Section {
  start: number
  length: number
}

export class KwzReader {
  readonly frameCount: number
  readonly thumbnailPage: number
  readonly loop: boolean
  readonly speed: number
  readonly bgmSpeed: number
  readonly info: FlipnoteInfo
  readonly hasHeader: boolean

  private readonly bytes: Uint8Array
  private readonly view: DataView
  private readonly sections = new Map<string, Section>()

  constructor(bytes: Uint8Array) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

    this.findSections()

    const header = this.sections.get('KFH')
    const entries = this.sections.get('KMI')
    const pictures = this.sections.get('KMC')

    if (!entries || !pictures) throw new RangeError('KWZ ではありません')

    this.hasHeader = !!header && header.length >= KFH_BODY_BYTES

    const entryCount = Math.floor(entries.length / KMI_ENTRY_BYTES)
    const body = header ? header.start + 8 : 0
    const declared = this.hasHeader ? this.u16(body + 196) : entryCount

    this.frameCount = Math.min(declared, entryCount)

    if (this.frameCount < 1) throw new RangeError('KWZ にページがありません')

    const flags = this.hasHeader ? this.u16(body + 200) : 0

    this.loop = (flags & FLAG_LOOP) !== 0
    this.speed = this.hasHeader ? this.bytes[body + 202] : 7
    this.thumbnailPage = this.hasHeader
      ? Math.min(this.u16(body + 198), this.frameCount - 1)
      : 0

    this.bgmSpeed = this.readBgmSpeed()
    this.info = this.readInfo(body, flags)
  }

  private u16(offset: number): number {
    return this.view.getUint16(offset, true)
  }

  private u32(offset: number): number {
    return this.view.getUint32(offset, true)
  }

  private findSections(): void {
    const size = this.bytes.length
    let position = 0

    for (let index = 0; index < 12 && position + 8 <= size; index++) {
      const name = String.fromCharCode(
        this.bytes[position],
        this.bytes[position + 1],
        this.bytes[position + 2],
      )
      const length = this.u32(position + 4)

      if (length > size - position - 8) break

      if (!this.sections.has(name)) {
        this.sections.set(name, { start: position, length })
      }

      position += length + 8
    }
  }

  private readBgmSpeed(): number {
    const sound = this.sections.get('KSN')

    return sound ? this.u32(sound.start + 8) : this.speed
  }

  private readName(offset: number): string {
    let text = ''

    for (let index = 0; index < NAME_LENGTH; index++) {
      const code = this.u16(offset + index * 2)

      if (code === 0) break

      text += String.fromCharCode(code)
    }

    return text
  }

  private readFileName(offset: number): string {
    let text = ''

    for (let index = 0; index < FILE_NAME_BYTES; index++) {
      const code = this.bytes[offset + index]

      if (code === 0) break

      if (code >= 0x20 && code < 0x7f) text += String.fromCharCode(code)
    }

    return text
  }

  private readId(offset: number): string {
    return bytesToHex(this.bytes.subarray(offset, offset + ID_BYTES))
  }

  private readInfo(body: number, flags: number): FlipnoteInfo {
    if (!this.hasHeader) {
      return {
        created: 0,
        modified: 0,
        appVersion: 0,
        rootId: '',
        parentId: '',
        currentId: '',
        rootName: '',
        parentName: '',
        currentName: '',
        rootFile: '',
        parentFile: '',
        currentFile: '',
        locked: false,
        flags: 0,
        layerFlags: 0,
        edits: 0,
      }
    }

    return {
      created: fromNintendoTime(this.u32(body + 4)),
      modified: fromNintendoTime(this.u32(body + 8)),
      appVersion: this.u32(body + 12),
      rootId: this.readId(body + 16),
      parentId: this.readId(body + 26),
      currentId: this.readId(body + 36),
      rootName: this.readName(body + 46),
      parentName: this.readName(body + 68),
      currentName: this.readName(body + 90),
      rootFile: this.readFileName(body + 112),
      parentFile: this.readFileName(body + 140),
      currentFile: this.readFileName(body + 168),
      locked: (flags & FLAG_LOCK) !== 0,
      flags,
      layerFlags: this.bytes[body + 203],
      edits: 0,
    }
  }

  *frames(): Generator<KwzFrame> {
    const entries = this.sections.get('KMI')
    const pictures = this.sections.get('KMC')

    if (!entries || !pictures) return

    const pixels = KWZ_FRAME_WIDTH * KWZ_FRAME_HEIGHT
    const planes: [Uint8Array, Uint8Array, Uint8Array] = [
      new Uint8Array(pixels),
      new Uint8Array(pixels),
      new Uint8Array(pixels),
    ]

    let position = pictures.start + 8 + 4

    for (let page = 0; page < this.frameCount; page++) {
      const entry = entries.start + 8 + page * KMI_ENTRY_BYTES
      const flags = this.u32(entry)
      const unchanged: [boolean, boolean, boolean] = [true, true, true]

      for (let layer = 0; layer < 3; layer++) {
        const size = this.u16(entry + 4 + layer * 2)

        if (size > UNCHANGED_LAYER_BYTES) {
          decodeKwzLayer(this.bytes, position, planes[layer])
          unchanged[layer] = false
        }

        position += size
      }

      yield {
        layers: planes,
        paper: flags & 0xf,
        colors: [
          (flags >>> 8) & 0xf,
          (flags >>> 12) & 0xf,
          (flags >>> 16) & 0xf,
          (flags >>> 20) & 0xf,
          (flags >>> 24) & 0xf,
          (flags >>> 28) & 0xf,
        ],
        depth: [
          this.bytes[entry + 0x14],
          this.bytes[entry + 0x15],
          this.bytes[entry + 0x16],
        ],
        sounds: this.bytes[entry + 0x17] & 0xf,
        unchanged,
      }
    }
  }

  audio(): KwzAudio {
    const sound = this.sections.get('KSN')

    if (!sound) return { bgm: null, sounds: [null, null, null, null] }

    const start = sound.start + 8
    let position = start + KSN_HEADER_BYTES

    const read = (index: number): Int16Array<ArrayBuffer> | null => {
      const length = this.u32(start + 4 + index * 4)
      const track = this.bytes.subarray(position, position + length)

      position += length

      return length > 0 ? decodeN3dsAdpcm(track) : null
    }

    return {
      bgm: read(0),
      sounds: [read(1), read(2), read(3), read(4)],
    }
  }
}
