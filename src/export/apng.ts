import { crc32 } from '../core/bytes.ts'
import { Compositor } from '../core/compositor.ts'
import { blendOver } from '../core/ink.ts'
import type { Note } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'
import { Yielder } from '../core/yielder.ts'
import { Backdrop } from './backdrop.ts'
import { BlobBuilder } from './blob-builder.ts'

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const INDEXED_COLOR = 3
const RGB_COLOR = 2
const RGB_BYTES = 3
const BIT_DEPTH = 8
const FILTER_NONE = 0
const DELAY_DENOMINATOR = 1000
const MAX_COLORS = 256

async function zlib(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream('deflate'))

  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function u32(value: number): number[] {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ]
}

function u16(value: number): number[] {
  return [(value >>> 8) & 255, value & 255]
}

function chunk(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer>[] {
  const typed = new Uint8Array(4 + payload.length)

  for (let index = 0; index < 4; index++) {
    typed[index] = type.charCodeAt(index)
  }

  typed.set(payload, 4)

  return [
    Uint8Array.from(u32(payload.length)),
    typed,
    Uint8Array.from(u32(crc32(typed))),
  ]
}

function colorTable(note: Note, backdrop: Backdrop): Map<number, number> {
  const { meta, profile } = note
  const table = new Map<number, number>()
  const colors = [...profile.papers, ...profile.colors, ...meta.palette]
  const words = [...colors.map(rgbaWord), ...backdrop.colors()]

  for (const word of words) {
    if (!table.has(word) && table.size < MAX_COLORS) {
      table.set(word, table.size)
    }
  }

  return table
}

function paletteBytes(table: Map<number, number>): Uint8Array {
  const bytes = new Uint8Array(table.size * 3)

  for (const [word, index] of table) {
    bytes[index * 3] = word & 255
    bytes[index * 3 + 1] = (word >>> 8) & 255
    bytes[index * 3 + 2] = (word >>> 16) & 255
  }

  return bytes
}

function usesRgb(note: Note): boolean {
  return note.profile.id === 'free'
}

function header(note: Note, width: number, height: number): Uint8Array {
  return Uint8Array.from([
    ...u32(width),
    ...u32(height),
    BIT_DEPTH,
    usesRgb(note) ? RGB_COLOR : INDEXED_COLOR,
    0,
    0,
    0,
  ])
}

interface Box {
  left: number
  top: number
  width: number
  height: number
}

function changedBox(
  current: Uint8Array,
  previous: Uint8Array | null,
  width: number,
  height: number,
  depth: number,
): Box {
  if (!previous) return { left: 0, top: 0, width, height }

  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * depth
      let isSame = true

      for (let byte = 0; byte < depth; byte++) {
        if (current[index + byte] !== previous[index + byte]) isSame = false
      }

      if (isSame) continue

      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  if (right < 0) return { left: 0, top: 0, width: 1, height: 1 }

  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}

function rowsOf(
  pixels: Uint8Array,
  fullWidth: number,
  box: Box,
  depth: number,
): Uint8Array<ArrayBuffer> {
  const rowBytes = box.width * depth
  const rows = new Uint8Array((rowBytes + 1) * box.height)

  for (let y = 0; y < box.height; y++) {
    const start = ((y + box.top) * fullWidth + box.left) * depth
    const target = y * (rowBytes + 1)

    rows[target] = FILTER_NONE
    rows.set(pixels.subarray(start, start + rowBytes), target + 1)
  }

  return rows
}

function pageIndices(
  note: Note,
  compositor: Compositor,
  table: Map<number, number>,
  backdrop: Uint32Array,
  scale: number,
  out: Uint8Array,
): void {
  const { meta } = note
  const isRgb = usesRgb(note)
  const depth = isRgb ? RGB_BYTES : 1
  const rowBytes = meta.width * scale * depth

  for (let y = 0; y < meta.height; y++) {
    const rowStart = y * scale * rowBytes

    for (let x = 0; x < meta.width; x++) {
      const index = y * meta.width + x
      const word = blendOver(compositor.pixels[index], backdrop[index])
      const start = rowStart + x * scale * depth

      if (!isRgb) {
        out.fill(table.get(word) ?? 0, start, start + scale)

        continue
      }

      for (let repeat = 0; repeat < scale; repeat++) {
        const at = start + repeat * RGB_BYTES

        out[at] = word & 255
        out[at + 1] = (word >>> 8) & 255
        out[at + 2] = (word >>> 16) & 255
      }
    }

    for (let repeat = 1; repeat < scale; repeat++) {
      out.copyWithin(
        rowStart + repeat * rowBytes,
        rowStart,
        rowStart + rowBytes,
      )
    }
  }
}

export async function encodeApng(
  note: Note,
  scale: number,
  hasLines: boolean,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const { frames, meta } = note
  const width = meta.width * scale
  const height = meta.height * scale
  const backdrop = new Backdrop(note, hasLines)
  const table = colorTable(note, backdrop)
  const compositor = new Compositor(note)
  const yielder = new Yielder()
  const file = new BlobBuilder()
  const write = (type: string, payload: Uint8Array): void => {
    for (const part of chunk(type, payload)) file.add(part)
  }

  file.add(Uint8Array.from(SIGNATURE))

  const depth = usesRgb(note) ? RGB_BYTES : 1

  write('IHDR', header(note, width, height))
  write(
    'acTL',
    Uint8Array.from([...u32(frames.count), ...u32(meta.loop ? 0 : 1)]),
  )

  if (depth === 1) write('PLTE', paletteBytes(table))

  let current: Uint8Array = new Uint8Array(width * height * depth)
  let previous: Uint8Array | null = null
  let sequence = 0
  const delay = Math.round(DELAY_DENOMINATOR / note.fps)

  for (let page = 0; page < frames.count; page++) {
    await note.ensurePages(page, 1)
    compositor.composePage(page)
    pageIndices(note, compositor, table, backdrop.of(page), scale, current)

    const box = changedBox(current, previous, width, height, depth)
    const data = await zlib(rowsOf(current, width, box, depth))

    write(
      'fcTL',
      Uint8Array.from([
        ...u32(sequence++),
        ...u32(box.width),
        ...u32(box.height),
        ...u32(box.left),
        ...u32(box.top),
        ...u16(delay),
        ...u16(DELAY_DENOMINATOR),
        0,
        0,
      ]),
    )

    if (page === 0) {
      write('IDAT', data)
    } else {
      const framed = new Uint8Array(data.length + 4)

      framed.set(u32(sequence++))
      framed.set(data, 4)
      write('fdAT', framed)
    }

    const held: Uint8Array = previous ?? new Uint8Array(width * height * depth)

    previous = current
    current = held
    onProgress((page + 1) / frames.count)
    await yielder.breathe()
  }

  write('IEND', new Uint8Array(0))

  return new Blob(file.finish(), { type: 'image/apng' })
}

export class PagePngEncoder {
  private readonly note: Note
  private readonly scale: number
  private readonly backdrop: Backdrop
  private readonly table: Map<number, number>
  private readonly compositor: Compositor
  private readonly depth: number
  private readonly indices: Uint8Array

  constructor(note: Note, scale: number, hasLines: boolean) {
    const { width, height } = note.meta

    this.note = note
    this.scale = scale
    this.backdrop = new Backdrop(note, hasLines)
    this.table = colorTable(note, this.backdrop)
    this.compositor = new Compositor(note)
    this.depth = usesRgb(note) ? RGB_BYTES : 1
    this.indices = new Uint8Array(width * height * scale * scale * this.depth)
  }

  async encode(page: number): Promise<Blob> {
    const { note, scale, backdrop, table, compositor, depth, indices } = this
    const width = note.meta.width * scale
    const height = note.meta.height * scale

    await note.ensurePages(page, 1)
    compositor.composePage(page)
    pageIndices(note, compositor, table, backdrop.of(page), scale, indices)

    const box = { left: 0, top: 0, width, height }
    const data = await zlib(rowsOf(indices, width, box, depth))
    const parts: BlobPart[] = [Uint8Array.from(SIGNATURE)]
    const chunks: readonly (readonly [string, Uint8Array])[] = [
      ['IHDR', header(note, width, height)],
      ...(depth === 1 ? ([['PLTE', paletteBytes(table)]] as const) : []),
      ['IDAT', data],
      ['IEND', new Uint8Array(0)],
    ]

    for (const [type, payload] of chunks) {
      parts.push(...chunk(type, payload))
    }

    return new Blob(parts, { type: 'image/png' })
  }
}

export function encodePagePng(
  note: Note,
  page: number,
  scale: number,
  hasLines: boolean,
): Promise<Blob> {
  return new PagePngEncoder(note, scale, hasLines).encode(page)
}
