const ATTR_WORDS = 3

const PAPER_MASK = 0xf
const SOUND_SHIFT = 8
const SOUND_MASK = 0xff

const INK_BITS = 8
const DEPTH_BITS = 8
const DEPTH_MASK = 0xff

export class FrameTable {
  private words: Uint32Array
  private pages = 0
  private layerTotal: number

  constructor(layers: number, capacity = 32) {
    this.layerTotal = layers
    this.words = new Uint32Array(capacity * (layers + ATTR_WORDS))
  }

  get count(): number {
    return this.pages
  }

  get layers(): number {
    return this.layerTotal
  }

  get stride(): number {
    return this.layerTotal + ATTR_WORDS
  }

  get byteLength(): number {
    return this.words.byteLength
  }

  private rowStart(page: number): number {
    return page * this.stride
  }

  cel(page: number, layer: number): number {
    return this.words[this.rowStart(page) + layer]
  }

  setCel(page: number, layer: number, ref: number): void {
    this.words[this.rowStart(page) + layer] = ref
  }

  attrs(page: number): number {
    return this.words[this.rowStart(page) + this.layerTotal]
  }

  setAttrs(page: number, value: number): void {
    this.words[this.rowStart(page) + this.layerTotal] = value
  }

  inks(page: number): number {
    return this.words[this.rowStart(page) + this.layerTotal + 1]
  }

  setInks(page: number, value: number): void {
    this.words[this.rowStart(page) + this.layerTotal + 1] = value
  }

  depths(page: number): number {
    return this.words[this.rowStart(page) + this.layerTotal + 2]
  }

  setDepths(page: number, value: number): void {
    this.words[this.rowStart(page) + this.layerTotal + 2] = value
  }

  paper(page: number): number {
    return this.attrs(page) & PAPER_MASK
  }

  setPaper(page: number, paper: number): void {
    this.setAttrs(page, ((this.attrs(page) & ~PAPER_MASK) | paper) >>> 0)
  }

  sounds(page: number): number {
    return (this.attrs(page) >>> SOUND_SHIFT) & SOUND_MASK
  }

  setSounds(page: number, mask: number): void {
    const others = this.attrs(page) & ~(SOUND_MASK << SOUND_SHIFT)

    this.setAttrs(page, (others | (mask << SOUND_SHIFT)) >>> 0)
  }

  private reserve(pages: number): void {
    const needed = pages * this.stride

    if (needed <= this.words.length) return

    const grown = new Uint32Array(Math.max(needed, this.words.length * 2))

    grown.set(this.words.subarray(0, this.pages * this.stride))
    this.words = grown
  }

  insertBlank(at: number, attrs = 0, inks = 0, depths = 0): void {
    this.insertRows(at, new Uint32Array(this.stride))
    this.setAttrs(at, attrs)
    this.setInks(at, inks)
    this.setDepths(at, depths)
  }

  insertRows(at: number, rows: Uint32Array): void {
    const added = rows.length / this.stride

    this.reserve(this.pages + added)

    const start = this.rowStart(at)
    const end = this.rowStart(this.pages)

    this.words.copyWithin(start + rows.length, start, end)
    this.words.set(rows, start)
    this.pages += added
  }

  clearRowSounds(row: Uint32Array): void {
    row[this.layerTotal] &= ~(SOUND_MASK << SOUND_SHIFT)
  }

  copyRows(at: number, count: number): Uint32Array {
    const start = this.rowStart(at)

    return this.words.slice(start, start + count * this.stride)
  }

  removeRows(at: number, count: number): Uint32Array {
    const removed = this.copyRows(at, count)
    const start = this.rowStart(at)

    this.words.copyWithin(
      start,
      start + removed.length,
      this.rowStart(this.pages),
    )
    this.pages -= count

    return removed
  }

  moveRows(from: number, count: number, to: number): void {
    const rows = this.removeRows(from, count)

    this.insertRows(to, rows)
  }

  insertLayer(at: number): void {
    this.rebuild(this.layerTotal + 1, (row, target, oldStride) => {
      target.set(row.subarray(0, at))
      target.set(row.subarray(at, oldStride), at + 1)
    })
  }

  removeLayer(at: number): void {
    this.rebuild(this.layerTotal - 1, (row, target, oldStride) => {
      target.set(row.subarray(0, at))
      target.set(row.subarray(at + 1, oldStride), at)
    })
  }

  swapLayers(first: number, second: number): void {
    for (let page = 0; page < this.pages; page++) {
      const held = this.cel(page, first)

      this.setCel(page, first, this.cel(page, second))
      this.setCel(page, second, held)
    }
  }

  private rebuild(
    layers: number,
    copy: (row: Uint32Array, target: Uint32Array, oldStride: number) => void,
  ): void {
    const oldStride = this.stride
    const newStride = layers + ATTR_WORDS
    const rebuilt = new Uint32Array(Math.max(this.pages, 32) * newStride)

    for (let page = 0; page < this.pages; page++) {
      const row = this.words.subarray(page * oldStride, (page + 1) * oldStride)
      const target = rebuilt.subarray(page * newStride, (page + 1) * newStride)

      copy(row, target, oldStride)
    }

    this.words = rebuilt
    this.layerTotal = layers
  }

  toBytes(): Uint8Array {
    const used = this.words.slice(0, this.pages * this.stride)

    return new Uint8Array(used.buffer)
  }

  static fromBytes(layers: number, bytes: Uint8Array): FrameTable {
    const words = new Uint32Array(bytes.slice().buffer)
    const table = new FrameTable(layers, 1)

    table.words = words
    table.pages = words.length / table.stride

    return table
  }
}

export function inkOf(inks: number, layer: number, slot: number): number {
  return (inks >>> (layer * INK_BITS + slot * 4)) & 0xf
}

export function withInk(
  inks: number,
  layer: number,
  slot: number,
  color: number,
): number {
  const shift = layer * INK_BITS + slot * 4

  return ((inks & ~(0xf << shift)) | (color << shift)) >>> 0
}

export function depthOf(depths: number, layer: number): number {
  return (depths >>> (layer * DEPTH_BITS)) & DEPTH_MASK
}

export function withDepth(
  depths: number,
  layer: number,
  depth: number,
): number {
  const shift = layer * DEPTH_BITS

  return ((depths & ~(DEPTH_MASK << shift)) | (depth << shift)) >>> 0
}
