import { ByteWriter } from '../core/bytes.ts'
import { Backdrop } from './backdrop.ts'
import { BlobBuilder } from './blob-builder.ts'
import { Compositor } from '../core/compositor.ts'
import { blendOver } from '../core/ink.ts'
import type { Note } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'
import { Yielder } from '../core/yielder.ts'

const MAX_CODES = 4096
const MIN_CODE_BITS = 8
const BLOCK_BYTES = 255
const FLUSH_BYTES = 1 << 20

function gifScale(note: Note): number {
  return note.meta.width < 320 ? 3 : note.meta.width < 512 ? 2 : 1
}

class BlockWriter {
  private readonly out: ByteWriter
  private readonly block = new Uint8Array(BLOCK_BYTES)
  private used = 0
  private buffer = 0
  private bits = 0

  constructor(out: ByteWriter) {
    this.out = out
  }

  write(code: number, size: number): void {
    this.buffer |= code << this.bits
    this.bits += size

    while (this.bits >= 8) {
      this.pushByte(this.buffer & 0xff)
      this.buffer >>>= 8
      this.bits -= 8
    }
  }

  private pushByte(byte: number): void {
    this.block[this.used++] = byte

    if (this.used === BLOCK_BYTES) this.flushBlock()
  }

  private flushBlock(): void {
    if (this.used === 0) return

    this.out.u8(this.used)
    this.out.bytes(this.block.subarray(0, this.used))
    this.used = 0
  }

  finish(): void {
    if (this.bits > 0) this.pushByte(this.buffer & 0xff)

    this.flushBlock()
    this.out.u8(0)
  }
}

class LzwTable {
  private readonly codes = new Uint16Array(MAX_CODES * 256)
  private readonly used = new Uint32Array(MAX_CODES)
  private count = 0

  get(key: number): number {
    return this.codes[key]
  }

  set(key: number, code: number): void {
    this.codes[key] = code
    this.used[this.count++] = key
  }

  clear(): void {
    for (let index = 0; index < this.count; index++) {
      this.codes[this.used[index]] = 0
    }

    this.count = 0
  }
}

function writeLzw(out: ByteWriter, indices: Uint8Array, table: LzwTable): void {
  const writer = new BlockWriter(out)
  const clearCode = 1 << MIN_CODE_BITS
  const endCode = clearCode + 1
  let nextCode = endCode + 1
  let codeSize = MIN_CODE_BITS + 1
  let prefix = indices[0]

  out.u8(MIN_CODE_BITS)
  writer.write(clearCode, codeSize)

  for (let index = 1; index < indices.length; index++) {
    const value = indices[index]
    const key = prefix * 256 + value
    const known = table.get(key)

    if (known !== 0) {
      prefix = known
      continue
    }

    writer.write(prefix, codeSize)

    if (nextCode < MAX_CODES) {
      if (nextCode === 1 << codeSize) codeSize++

      table.set(key, nextCode++)
    } else {
      writer.write(clearCode, codeSize)
      table.clear()
      nextCode = endCode + 1
      codeSize = MIN_CODE_BITS + 1
    }

    prefix = value
  }

  writer.write(prefix, codeSize)
  writer.write(endCode, codeSize)
  writer.finish()
  table.clear()
}

const EDGE_LEVELS = [36, 73, 109, 146, 182, 219]
const MAX_COLORS = 256
const LOOP_EXTENSION = Uint8Array.from(
  [...'\x21\xff\x0bNETSCAPE2.0\x03\x01'].map(letter => letter.charCodeAt(0)),
)

function buildPalette(
  note: Note,
  backdrop: Backdrop,
): {
  words: number[]
  lookup: Map<number, number>
} {
  const { profile, meta } = note
  const lookup = new Map<number, number>()
  const words: number[] = []

  const add = (word: number): void => {
    if (lookup.has(word)) return

    lookup.set(word, words.length)
    words.push(word)
  }

  profile.papers.forEach(color => add(rgbaWord(color)))
  profile.colors.forEach(color => add(rgbaWord(color)))
  meta.palette.forEach(color => add(rgbaWord(color)))

  for (const word of backdrop.colors()) {
    if (words.length < MAX_COLORS) add(word)
  }

  if (profile.id === 'free') {
    const paper = rgbaWord(profile.papers[note.frames.paper(0)])

    for (const color of meta.palette) {
      for (const alpha of EDGE_LEVELS) {
        if (words.length >= MAX_COLORS) break

        const tinted = (rgbaWord(color) & 0xffffff) | (alpha << 24)

        add(blendOver(tinted >>> 0, paper))
      }
    }
  }

  return { words, lookup }
}

interface GifRegion {
  left: number
  top: number
  width: number
  height: number
}

function nearestIndex(
  word: number,
  palette: readonly number[],
  lookup: Map<number, number>,
): number {
  let best = 0
  let bestError = Infinity

  palette.forEach((candidate, index) => {
    const red = (word & 255) - (candidate & 255)
    const green = ((word >>> 8) & 255) - ((candidate >>> 8) & 255)
    const blue = ((word >>> 16) & 255) - ((candidate >>> 16) & 255)
    const error = red * red * 2 + green * green * 4 + blue * blue

    if (error < bestError) {
      best = index
      bestError = error
    }
  })

  lookup.set(word, best)

  return best
}

function regionIndices(
  words: Uint32Array,
  backdrop: Uint32Array,
  lookup: Map<number, number>,
  palette: readonly number[],
  noteWidth: number,
  scale: number,
  region: GifRegion,
): Uint8Array {
  const out = new Uint8Array(region.width * region.height * scale * scale)
  let position = 0

  for (let y = 0; y < region.height; y++) {
    const rowStart = position
    const start = (region.top + y) * noteWidth + region.left

    for (let x = 0; x < region.width; x++) {
      const word = blendOver(words[start + x], backdrop[start + x])
      const index = lookup.get(word) ?? nearestIndex(word, palette, lookup)

      for (let repeat = 0; repeat < scale; repeat++) out[position++] = index
    }

    const rowBytes = position - rowStart

    for (let repeat = 1; repeat < scale; repeat++) {
      out.copyWithin(position, rowStart, rowStart + rowBytes)
      position += rowBytes
    }
  }

  return out
}

export async function encodeGif(
  note: Note,
  chosenScale: number | undefined,
  hasLines: boolean,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const { frames, meta } = note
  const scale = chosenScale ?? gifScale(note)
  const width = meta.width * scale
  const height = meta.height * scale
  const backdrop = new Backdrop(note, hasLines)
  const { words, lookup } = buildPalette(note, backdrop)
  const tableBits = Math.max(1, Math.ceil(Math.log2(words.length)))
  const tableSize = 1 << tableBits
  const file = new BlobBuilder()
  let out = new ByteWriter(FLUSH_BYTES)

  out.bytes(new TextEncoder().encode('GIF89a'))
  out.u16(width)
  out.u16(height)
  out.u8(0x80 | (tableBits - 1))
  out.u8(0)
  out.u8(0)

  for (let index = 0; index < tableSize; index++) {
    const word = words[index] ?? 0

    out.u8(word & 0xff)
    out.u8((word >>> 8) & 0xff)
    out.u8((word >>> 16) & 0xff)
  }

  if (meta.loop) {
    out.bytes(LOOP_EXTENSION)
    out.u16(0)
    out.u8(0)
  }

  const compositor = new Compositor(note)
  const lzw = new LzwTable()
  const delay = Math.max(2, Math.round(100 / note.fps))
  const yielder = new Yielder()
  let lastPaper = -1

  for (let page = 0; page < frames.count; page++) {
    await note.ensurePages(page, 1)

    const paperIndex = frames.paper(page)
    const changed = compositor.composePage(page)
    const isFull = paperIndex !== lastPaper

    lastPaper = paperIndex

    const region: GifRegion =
      changed && !isFull
        ? {
            left: changed.left,
            top: changed.top,
            width: changed.right - changed.left + 1,
            height: changed.bottom - changed.top + 1,
          }
        : isFull
          ? { left: 0, top: 0, width: meta.width, height: meta.height }
          : { left: 0, top: 0, width: 1, height: 1 }

    out.u8(0x21)
    out.u8(0xf9)
    out.u8(4)
    out.u8(0x04)
    out.u16(delay)
    out.u8(0)
    out.u8(0)

    out.u8(0x2c)
    out.u16(region.left * scale)
    out.u16(region.top * scale)
    out.u16(region.width * scale)
    out.u16(region.height * scale)
    out.u8(0)

    writeLzw(
      out,
      regionIndices(
        compositor.pixels,
        backdrop.of(page),
        lookup,
        words,
        meta.width,
        scale,
        region,
      ),
      lzw,
    )

    if (out.length >= FLUSH_BYTES) {
      file.add(out.finish())
      out = new ByteWriter(FLUSH_BYTES)
    }

    onProgress((page + 1) / frames.count)
    await yielder.breathe()
  }

  out.u8(0x3b)
  file.add(out.finish())

  return new Blob(file.finish(), { type: 'image/gif' })
}
