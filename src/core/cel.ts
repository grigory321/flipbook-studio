import {
  EMPTY_REF,
  isUniform,
  type Ref,
  type Store,
  uniformRef,
  uniformValue,
} from './store.ts'
import {
  packTile,
  TILE_PACKED_LIMIT,
  TILE_PIXELS,
  TILE_SHIFT,
  TILE_SIZE,
  unpackTile,
} from './tile.ts'

export class TileGrid {
  readonly width: number
  readonly height: number
  readonly columns: number
  readonly rows: number
  readonly count: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.columns = Math.ceil(width / TILE_SIZE)
    this.rows = Math.ceil(height / TILE_SIZE)
    this.count = this.columns * this.rows
  }
}

const packBuffer = new Uint8Array(TILE_PACKED_LIMIT)
const tileBuffer = new Uint8Array(TILE_PIXELS)

export function packCel(store: Store, tiles: Uint32Array): Ref {
  let filled = 0

  for (let index = 0; index < tiles.length; index++) {
    if (tiles[index] !== EMPTY_REF) filled++
  }

  if (filled === 0) return EMPTY_REF

  const bitmapBytes = (tiles.length + 7) >> 3
  const bytes = new Uint8Array(bitmapBytes + filled * 4)
  let position = bitmapBytes

  for (let index = 0; index < tiles.length; index++) {
    const ref = tiles[index]

    if (ref === EMPTY_REF) continue

    bytes[index >> 3] |= 1 << (index & 7)
    bytes[position++] = ref & 0xff
    bytes[position++] = (ref >>> 8) & 0xff
    bytes[position++] = (ref >>> 16) & 0xff
    bytes[position++] = ref >>> 24
  }

  return store.put(bytes)
}

export function unpackCel(store: Store, cel: Ref, out: Uint32Array): void {
  out.fill(EMPTY_REF)

  if (cel === EMPTY_REF) return

  const bytes = store.read(cel)
  let position = (out.length + 7) >> 3

  for (let index = 0; index < out.length; index++) {
    if ((bytes[index >> 3] & (1 << (index & 7))) === 0) continue

    out[index] =
      (bytes[position] |
        (bytes[position + 1] << 8) |
        (bytes[position + 2] << 16) |
        (bytes[position + 3] << 24)) >>>
      0

    position += 4
  }
}

export function readTile(store: Store, tile: Ref, out: Uint8Array): void {
  if (isUniform(tile)) {
    out.fill(uniformValue(tile))
  } else if (tile === EMPTY_REF) {
    out.fill(0)
  } else {
    unpackTile(store.slabFor(tile), store.startOf(tile), out)
  }
}

function writeTile(
  store: Store,
  plane: Uint8Array,
  grid: TileGrid,
  column: number,
  row: number,
): Ref {
  const length = packTile(
    plane,
    grid.width,
    grid.height,
    column << TILE_SHIFT,
    row << TILE_SHIFT,
    packBuffer,
  )

  if (length < 0) return uniformRef(-1 - length)

  return store.put(packBuffer, length)
}

export function loadPlane(
  store: Store,
  cel: Ref,
  plane: Uint8Array,
  grid: TileGrid,
  scratch: Uint32Array,
): void {
  plane.fill(0)

  if (cel === EMPTY_REF) return

  unpackCel(store, cel, scratch)

  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const tile = scratch[row * grid.columns + column]

      if (tile === EMPTY_REF) continue

      readTile(store, tile, tileBuffer)
      copyTile(tileBuffer, plane, grid, column, row)
    }
  }
}

function copyTile(
  tile: Uint8Array,
  plane: Uint8Array,
  grid: TileGrid,
  column: number,
  row: number,
): void {
  const left = column << TILE_SHIFT
  const top = row << TILE_SHIFT
  const columns = Math.min(TILE_SIZE, grid.width - left)
  const lines = Math.min(TILE_SIZE, grid.height - top)

  for (let line = 0; line < lines; line++) {
    const start = line * TILE_SIZE
    const target = (top + line) * grid.width + left

    plane.set(tile.subarray(start, start + columns), target)
  }
}

export function packPlane(
  store: Store,
  plane: Uint8Array,
  grid: TileGrid,
  scratch: Uint32Array,
): Ref {
  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      scratch[row * grid.columns + column] = writeTile(
        store,
        plane,
        grid,
        column,
        row,
      )
    }
  }

  return packCel(store, scratch)
}

export function updateCel(
  store: Store,
  previous: Ref,
  plane: Uint8Array,
  grid: TileGrid,
  dirty: Uint8Array,
  scratch: Uint32Array,
): Ref {
  unpackCel(store, previous, scratch)

  for (let row = 0; row < grid.rows; row++) {
    for (let column = 0; column < grid.columns; column++) {
      const index = row * grid.columns + column

      if (dirty[index]) {
        scratch[index] = writeTile(store, plane, grid, column, row)
      }
    }
  }

  return packCel(store, scratch)
}
