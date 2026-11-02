import { ByteReader, ByteWriter, crc32 } from '../core/bytes.ts'
import { packCel, unpackCel } from '../core/cel.ts'
import { FrameTable } from '../core/frames.ts'
import { Note, type NoteMeta } from '../core/note.ts'
import {
  EMPTY_REF,
  isUniform,
  type Ref,
  Store,
  uniformRef,
  uniformValue,
} from '../core/store.ts'
import { TILE_SIZE } from '../core/tile.ts'
import { Yielder } from '../core/yielder.ts'
import { deflate, inflate } from './deflate.ts'
import { checkPages, readMeta } from './meta.ts'

const UGB_VERSION = 1
const UGB_MIME = 'application/x-flipbook'

const SIGNATURE = new Uint8Array([
  0x89, 0x55, 0x47, 0x42, 0x0d, 0x0a, 0x1a, 0x0a,
])

const CHUNK_HEADER_BYTES = 8
const CHUNK_TAIL_BYTES = 4
const TILE_BATCH_BYTES = 1 << 20
const PAGE_WINDOW = 64

export interface ExtraChunk {
  type: string
  bytes: Uint8Array<ArrayBuffer>
}

export interface WriteOptions {
  cover?: Uint8Array
  extras?: readonly ExtraChunk[]
  onProgress?: (done: number, total: number) => void
}

export interface ReadOptions {
  store?: Store
  onProgress?: (done: number, total: number) => void
}

function textBytes(text: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(text)
}

function chunk(type: string, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(
    CHUNK_HEADER_BYTES + payload.length + CHUNK_TAIL_BYTES,
  )
  const view = new DataView(out.buffer)

  out.set(textBytes(type))
  view.setUint32(4, payload.length, true)
  out.set(payload, CHUNK_HEADER_BYTES)
  view.setUint32(out.length - CHUNK_TAIL_BYTES, crc32(payload), true)

  return out
}

function headChunk(note: Note): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter(24)

  out.u16(UGB_VERSION)
  out.u16(0)
  out.u16(note.meta.width)
  out.u16(note.meta.height)
  out.u32(note.frames.count)
  out.u8(note.frames.layers)
  out.u8(TILE_SIZE)

  return chunk('HEAD', out.finish())
}

class PictureWriter {
  private readonly note: Note
  private readonly parts: Uint8Array<ArrayBuffer>[]
  private readonly cels = new Map<Ref, number>()
  private readonly tiles = new Map<Ref, number>()
  private readonly celBytes = new ByteWriter(4096)
  private readonly scratch: Uint32Array
  private tileBatch = new ByteWriter(TILE_BATCH_BYTES)

  constructor(note: Note, parts: Uint8Array<ArrayBuffer>[]) {
    this.note = note
    this.parts = parts
    this.scratch = new Uint32Array(note.grid.count)
  }

  async celIndex(cel: Ref): Promise<number> {
    if (cel === EMPTY_REF) return 0

    const known = this.cels.get(cel)

    if (known !== undefined) return known

    const index = this.cels.size + 1

    this.cels.set(cel, index)
    unpackCel(this.note.store, cel, this.scratch)
    await this.writeCel()

    return index
  }

  private async writeCel(): Promise<void> {
    const { scratch, celBytes } = this
    let filled = 0

    for (const tile of scratch) {
      if (tile !== EMPTY_REF) filled++
    }

    celBytes.varint(filled)

    let previous = -1

    for (let position = 0; position < scratch.length; position++) {
      const tile = scratch[position]

      if (tile === EMPTY_REF) continue

      celBytes.varint(position - previous - 1)
      previous = position
      celBytes.varint(await this.tileSymbol(tile))
    }
  }

  private async tileSymbol(tile: Ref): Promise<number> {
    if (isUniform(tile)) return uniformValue(tile) * 2 + 1

    let index = this.tiles.get(tile)

    if (index === undefined) {
      index = this.tiles.size
      this.tiles.set(tile, index)

      const bytes = this.note.store.read(tile)

      this.tileBatch.varint(bytes.length)
      this.tileBatch.bytes(bytes)

      if (this.tileBatch.length >= TILE_BATCH_BYTES) await this.flushTiles()
    }

    return index * 2
  }

  async flushTiles(): Promise<void> {
    if (this.tileBatch.length === 0) return

    const packed = await deflate(this.tileBatch.finish())

    this.parts.push(chunk('TILE', packed))
    this.tileBatch = new ByteWriter(TILE_BATCH_BYTES)
  }

  async finish(): Promise<void> {
    await this.flushTiles()
    this.parts.push(chunk('CELS', await deflate(this.celBytes.finish())))
  }
}

async function writePages(
  note: Note,
  pictures: PictureWriter,
  options: WriteOptions,
): Promise<Uint8Array<ArrayBuffer>> {
  const { frames } = note
  const rows = new ByteWriter(frames.count * 8)
  const previous = new Int32Array(frames.layers)
  const yielder = new Yielder()

  rows.varint(frames.count)

  for (let page = 0; page < frames.count; page++) {
    if (page % PAGE_WINDOW === 0) await note.ensurePages(page, PAGE_WINDOW)

    rows.varint(frames.attrs(page))
    rows.varint(frames.inks(page))
    rows.varint(frames.depths(page))

    for (let layer = 0; layer < frames.layers; layer++) {
      const index = await pictures.celIndex(frames.cel(page, layer))

      rows.zigzag(index - previous[layer])
      previous[layer] = index
    }

    options.onProgress?.(page + 1, frames.count)
    await yielder.breathe()
  }

  return rows.finish()
}

async function writeSounds(
  note: Note,
  parts: Uint8Array<ArrayBuffer>[],
): Promise<void> {
  for (const sound of note.sounds.values()) {
    const out = new ByteWriter(sound.samples.length * 2 + 64)
    const pcm = new Uint8Array(
      sound.samples.buffer,
      sound.samples.byteOffset,
      sound.samples.byteLength,
    )

    out.text(sound.id)
    out.text(sound.name)
    out.u32(sound.rate)
    out.bytes(await deflate(pcm))
    parts.push(chunk('SOND', out.finish()))
  }
}

export async function writeUgb(
  note: Note,
  options: WriteOptions = {},
): Promise<Blob> {
  const parts: Uint8Array<ArrayBuffer>[] = [
    SIGNATURE,
    headChunk(note),
    chunk('NOTE', textBytes(JSON.stringify(note.meta))),
  ]

  if (options.cover) parts.push(chunk('COVR', options.cover))

  const pictures = new PictureWriter(note, parts)
  const rows = await writePages(note, pictures, options)

  await pictures.finish()
  parts.push(chunk('PAGE', await deflate(rows)))
  await writeSounds(note, parts)

  for (const extra of options.extras ?? []) {
    parts.push(chunk(extra.type, extra.bytes))
  }

  parts.push(chunk('TAIL', new Uint8Array(0)))

  return new Blob(parts, { type: UGB_MIME })
}

async function* readChunks(blob: Blob): AsyncGenerator<ExtraChunk> {
  const signature = new Uint8Array(
    await blob.slice(0, SIGNATURE.length).arrayBuffer(),
  )

  if (!SIGNATURE.every((byte, index) => byte === signature[index])) {
    throw new RangeError('.ugb のファイルではありません')
  }

  let position = SIGNATURE.length

  while (position + CHUNK_HEADER_BYTES <= blob.size) {
    const header = new DataView(
      await blob.slice(position, position + CHUNK_HEADER_BYTES).arrayBuffer(),
    )

    const type = String.fromCharCode(
      header.getUint8(0),
      header.getUint8(1),
      header.getUint8(2),
      header.getUint8(3),
    )

    const length = header.getUint32(4, true)
    const start = position + CHUNK_HEADER_BYTES
    const end = start + length

    if (end + CHUNK_TAIL_BYTES > blob.size) {
      throw new RangeError('ファイルが途中で切れています')
    }

    const buffer = await blob.slice(start, end + CHUNK_TAIL_BYTES).arrayBuffer()
    const bytes = new Uint8Array(buffer, 0, length)
    const stored = new DataView(buffer).getUint32(length, true)

    if (crc32(bytes) !== stored) {
      throw new RangeError(`${type} チャンクが壊れています`)
    }

    yield { type, bytes }

    if (type === 'TAIL') return

    position = end + CHUNK_TAIL_BYTES
  }

  throw new RangeError('ファイルの終わりがありません')
}

interface ParsedHead {
  version: number
  width: number
  height: number
  pages: number
  layers: number
  tileSize: number
}

function parseHead(bytes: Uint8Array): ParsedHead {
  const reader = new ByteReader(bytes)
  const version = reader.u16()

  reader.u16()

  const head = {
    version,
    width: reader.u16(),
    height: reader.u16(),
    pages: reader.u32(),
    layers: reader.u8(),
    tileSize: reader.u8(),
  }

  if (version > UGB_VERSION) {
    throw new RangeError('新しい版の .ugb なので開けません')
  }

  if (head.tileSize !== TILE_SIZE) {
    throw new RangeError('対応していないタイルの大きさです')
  }

  return head
}

class NoteBuilder {
  private readonly store: Store
  private readonly tiles: Ref[] = []
  private cels: Ref[] = [EMPTY_REF]
  private table: FrameTable | null = null
  private head: ParsedHead | null = null
  private note: Note | null = null
  readonly extras: ExtraChunk[] = []

  constructor(store: Store) {
    this.store = store
  }

  setHead(bytes: Uint8Array<ArrayBuffer>): void {
    this.head = parseHead(bytes)
  }

  setMeta(bytes: Uint8Array<ArrayBuffer>): void {
    const meta = readMeta(JSON.parse(new TextDecoder().decode(bytes)))

    if (this.head) checkPages(meta, this.head.pages)

    this.table = new FrameTable(meta.layers.length, this.head?.pages ?? 32)
    this.note = new Note(meta, this.table, this.store)
  }

  async addTiles(packed: Uint8Array<ArrayBuffer>): Promise<void> {
    const reader = new ByteReader(await inflate(packed))

    while (reader.remaining > 0) {
      const length = reader.varint()

      this.tiles.push(this.store.put(reader.bytes(length)))
    }
  }

  async addCels(packed: Uint8Array<ArrayBuffer>): Promise<void> {
    const note = this.requireNote()
    const reader = new ByteReader(await inflate(packed))
    const refs = new Uint32Array(note.grid.count)
    const yielder = new Yielder()

    while (reader.remaining > 0) {
      const filled = reader.varint()
      let position = -1

      refs.fill(EMPTY_REF)

      for (let index = 0; index < filled; index++) {
        position += reader.varint() + 1

        const symbol = reader.varint()

        refs[position] =
          symbol & 1 ? uniformRef(symbol >> 1) : this.tiles[symbol >> 1]
      }

      this.cels.push(packCel(this.store, refs))
      await yielder.breathe()
    }
  }

  async addPages(packed: Uint8Array<ArrayBuffer>): Promise<void> {
    const table = this.table

    if (!table) throw new RangeError('NOTE チャンクがありません')

    const reader = new ByteReader(await inflate(packed))
    const count = reader.varint()
    const previous = new Int32Array(table.layers)

    checkPages(this.requireNote().meta, table.count + count)

    for (let page = 0; page < count; page++) {
      table.insertBlank(page, reader.varint(), reader.varint(), reader.varint())

      for (let layer = 0; layer < table.layers; layer++) {
        previous[layer] += reader.zigzag()
        table.setCel(page, layer, this.cels[previous[layer]])
      }
    }
  }

  async addSound(bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const note = this.requireNote()
    const reader = new ByteReader(bytes)
    const id = reader.text()
    const name = reader.text()
    const rate = reader.u32()
    const pcm = await inflate(reader.bytes(reader.remaining))
    const samples = new Int16Array(pcm.slice().buffer)

    note.sounds.set(id, { id, name, rate, samples })
  }

  private requireNote(): Note {
    if (!this.note) throw new RangeError('NOTE チャンクがありません')

    return this.note
  }

  finish(): Note {
    const note = this.requireNote()

    if (note.frames.count === 0) throw new RangeError('ページがありません')

    return note
  }
}

export interface UgbFile {
  note: Note
  extras: ExtraChunk[]
}

export async function readUgb(
  blob: Blob,
  options: ReadOptions = {},
): Promise<UgbFile> {
  const builder = new NoteBuilder(options.store ?? new Store())
  let readBytes = 0

  for await (const { type, bytes } of readChunks(blob)) {
    readBytes += bytes.length
    options.onProgress?.(readBytes, blob.size)

    switch (type) {
      case 'HEAD':
        builder.setHead(bytes)
        break
      case 'NOTE':
        builder.setMeta(bytes)
        break
      case 'TILE':
        await builder.addTiles(bytes)
        break
      case 'CELS':
        await builder.addCels(bytes)
        break
      case 'PAGE':
        await builder.addPages(bytes)
        break
      case 'SOND':
        await builder.addSound(bytes)
        break
      case 'COVR':
      case 'TAIL':
        break
      default:
        if (type[0] === type[0].toLowerCase()) {
          builder.extras.push({ type, bytes: bytes.slice() })
        } else {
          throw new RangeError(`知らない必須チャンク ${type} があります`)
        }
    }
  }

  return { note: builder.finish(), extras: builder.extras }
}

export interface UgbPreview {
  meta: NoteMeta
  pages: number
  cover: Uint8Array | null
}

export async function readUgbPreview(blob: Blob): Promise<UgbPreview> {
  let meta: NoteMeta | null = null
  let pages = 0
  let cover: Uint8Array | null = null

  for await (const { type, bytes } of readChunks(blob)) {
    if (type === 'HEAD') pages = parseHead(bytes).pages
    else if (type === 'NOTE') {
      meta = readMeta(JSON.parse(new TextDecoder().decode(bytes)))
    } else if (type === 'COVR') cover = bytes.slice()
    else break
  }

  if (!meta) throw new RangeError('NOTE チャンクがありません')

  if (pages) checkPages(meta, pages)

  return { meta, pages, cover }
}
