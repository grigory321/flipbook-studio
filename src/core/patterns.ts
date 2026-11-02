export interface Pattern {
  readonly id: string
  readonly nameKey?: string
  readonly name?: string
  readonly width: number
  readonly height: number
  readonly bits: Uint8Array
}

type BitRule = (x: number, y: number) => number

function fromRule(
  id: string,
  nameKey: string,
  period: number,
  rule: BitRule,
): Pattern {
  const bits = new Uint8Array(period * period)

  for (let y = 0; y < period; y++) {
    for (let x = 0; x < period; x++) {
      bits[y * period + x] = rule(x, y) ? 1 : 0
    }
  }

  return { id, nameKey, width: period, height: period, bits }
}

export function patternFromRows(
  id: string,
  nameKey: string,
  rows: readonly number[],
): Pattern {
  const size = rows.length
  const bits = new Uint8Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      bits[y * size + x] = (rows[y] >> (size - 1 - x)) & 1
    }
  }

  return { id, nameKey, width: size, height: size, bits }
}

const sparseDot: BitRule = (x, y) => (x % 3 === 1 && y % 3 === 1 ? 1 : 0)

const toneWord = 0xa1a4

export const PATTERN_SOLID = fromRule('solid', 'pattern.solid', 1, () => 1)

export const PATTERN_TONE = fromRule('tone', 'pattern.tone', 4, (x, y) =>
  toneWord & (0x8000 >>> (x + y * 4)) ? 1 : 0,
)

export const DEVICE_PATTERNS: readonly Pattern[] = [
  PATTERN_SOLID,
  fromRule('dots-sparse', 'pattern.dotsSparse', 3, sparseDot),
  fromRule('dots', 'pattern.dots', 2, (x, y) => ((x | y) & 1 ? 0 : 1)),
  PATTERN_TONE,
  fromRule('lines-h', 'pattern.linesH', 2, (_, y) => y & 1),
  fromRule('lines-v', 'pattern.linesV', 2, x => x & 1),
  fromRule('checker', 'pattern.checker', 2, (x, y) => (x ^ y) & 1),
  fromRule('mesh', 'pattern.mesh', 2, (x, y) => (x | y) & 1),
  fromRule('dots-inverse', 'pattern.dotsInverse', 3, (x, y) =>
    sparseDot(x, y) ? 0 : 1,
  ),
]

export function patternBit(pattern: Pattern, x: number, y: number): number {
  const column = ((x % pattern.width) + pattern.width) % pattern.width
  const row = ((y % pattern.height) + pattern.height) % pattern.height

  return pattern.bits[row * pattern.width + column]
}
