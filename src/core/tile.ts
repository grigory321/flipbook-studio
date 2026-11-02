export const TILE_SIZE = 32
export const TILE_SHIFT = 5
export const TILE_PIXELS = TILE_SIZE * TILE_SIZE

const ROW_ZERO = 0
const ROW_PREVIOUS = 1
const ROW_BEFORE_PREVIOUS = 2
const ROW_LITERAL = 3

const PLANES_FOR = new Uint8Array(257)

for (let count = 2; count <= 256; count++) {
  PLANES_FOR[count] = 32 - Math.clz32(count - 1)
}

export const TILE_PACKED_LIMIT = 1 + 256 + 8 * (8 + TILE_SIZE * 5)

const localIndex = new Uint8Array(256)
const valueSeen = new Uint8Array(256)
const planeRows = new Int32Array(TILE_SIZE)
const previousRows = new Int32Array(TILE_SIZE * 8)

export function packTile(
  plane: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  out: Uint8Array,
): number {
  const columns = Math.min(TILE_SIZE, width - left)
  const lines = Math.min(TILE_SIZE, height - top)
  const hasGap = columns < TILE_SIZE || lines < TILE_SIZE

  valueSeen.fill(0)

  if (hasGap) valueSeen[0] = 1

  for (let line = 0; line < lines; line++) {
    const start = (top + line) * width + left

    for (let index = start; index < start + columns; index++) {
      valueSeen[plane[index]] = 1
    }
  }

  let count = 0
  let position = 1

  for (let value = 0; value < 256; value++) {
    if (!valueSeen[value]) continue

    localIndex[value] = count++
    out[position++] = value
  }

  if (count === 1) return -1 - out[1]

  out[0] = count - 1

  const planes = PLANES_FOR[count]

  for (let bit = 0; bit < planes; bit++) {
    for (let line = 0; line < TILE_SIZE; line++) planeRows[line] = 0

    for (let line = 0; line < lines; line++) {
      const start = (top + line) * width + left
      let word = 0

      for (let x = 0; x < columns; x++) {
        word |= ((localIndex[plane[start + x]] >> bit) & 1) << x
      }

      planeRows[line] = word
    }

    position = writeRows(planeRows, out, position)
  }

  return position
}

function writeRows(rows: Int32Array, out: Uint8Array, start: number): number {
  const kinds = start
  let position = start + 8

  out.fill(0, kinds, position)

  for (let line = 0; line < TILE_SIZE; line++) {
    const word = rows[line]
    let kind = ROW_LITERAL

    if (word === 0) {
      kind = ROW_ZERO
    } else if (line >= 1 && word === rows[line - 1]) {
      kind = ROW_PREVIOUS
    } else if (line >= 2 && word === rows[line - 2]) {
      kind = ROW_BEFORE_PREVIOUS
    }

    out[kinds + (line >> 2)] |= kind << ((line & 3) * 2)

    if (kind === ROW_LITERAL) position = writeLiteral(word, out, position)
  }

  return position
}

function writeLiteral(word: number, out: Uint8Array, start: number): number {
  const mark = start
  let position = start + 1
  let present = 0

  for (let index = 0; index < 4; index++) {
    const byte = (word >>> (index * 8)) & 0xff

    if (byte === 0) continue

    present |= 1 << index
    out[position++] = byte
  }

  out[mark] = present

  return position
}

export function unpackTile(
  source: Uint8Array,
  start: number,
  out: Uint8Array,
): void {
  const count = source[start] + 1
  const values = start + 1
  const planes = PLANES_FOR[count]
  let position = values + count

  out.fill(source[values], 0, TILE_PIXELS)

  if (planes === 1) {
    unpackSinglePlane(source, position, source[values + 1], out)

    return
  }

  for (let bit = 0; bit < planes; bit++) {
    position = readRows(source, position, previousRows, bit * TILE_SIZE)
  }

  for (let line = 0; line < TILE_SIZE; line++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      let index = 0

      for (let bit = 0; bit < planes; bit++) {
        index |= ((previousRows[bit * TILE_SIZE + line] >>> x) & 1) << bit
      }

      if (index) out[line * TILE_SIZE + x] = source[values + index]
    }
  }
}

function unpackSinglePlane(
  source: Uint8Array,
  start: number,
  value: number,
  out: Uint8Array,
): void {
  readRows(source, start, previousRows, 0)

  for (let line = 0; line < TILE_SIZE; line++) {
    let word = previousRows[line]
    const base = line * TILE_SIZE

    while (word !== 0) {
      const lowest = word & -word

      out[base + 31 - Math.clz32(lowest)] = value
      word ^= lowest
    }
  }
}

function readRows(
  source: Uint8Array,
  start: number,
  rows: Int32Array,
  rowsStart: number,
): number {
  let position = start + 8

  for (let line = 0; line < TILE_SIZE; line++) {
    const kind = (source[start + (line >> 2)] >> ((line & 3) * 2)) & 3
    let word = 0

    if (kind === ROW_PREVIOUS) {
      word = rows[rowsStart + line - 1]
    } else if (kind === ROW_BEFORE_PREVIOUS) {
      word = rows[rowsStart + line - 2]
    } else if (kind === ROW_LITERAL) {
      const present = source[position++]

      for (let index = 0; index < 4; index++) {
        if (present & (1 << index)) {
          word |= source[position++] << (index * 8)
        }
      }
    }

    rows[rowsStart + line] = word
  }

  return position
}
