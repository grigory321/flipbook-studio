import type { TileGrid } from './cel.ts'
import { COVERAGE_FULL, coveredValue, valueCoverage, valueInk } from './ink.ts'
import { type Pattern, PATTERN_SOLID, patternBit } from './patterns.ts'
import { TILE_SHIFT } from './tile.ts'

export class Surface {
  readonly width: number
  readonly height: number
  readonly columns: number

  plane: Uint8Array
  others: Uint8Array[] = []

  value = 1
  pattern: Pattern = PATTERN_SOLID
  phase = 0
  masked = false
  overwrite = false
  alpha = COVERAGE_FULL
  eraseStrength = COVERAGE_FULL
  base: Uint8Array | null = null
  trace: Uint8Array | null = null

  readonly touched: Uint8Array

  left = 0
  top = 0
  right = -1
  bottom = -1

  constructor(grid: TileGrid, plane: Uint8Array) {
    this.width = grid.width
    this.height = grid.height
    this.columns = grid.columns
    this.plane = plane
    this.touched = new Uint8Array(grid.count)
    this.resetRegion()
  }

  resetRegion(): void {
    this.left = this.width
    this.top = this.height
    this.right = -1
    this.bottom = -1
  }

  markRegion(left: number, top: number, right: number, bottom: number): void {
    this.mark(Math.max(0, left), Math.max(0, top))
    this.mark(
      Math.min(this.width - 1, right),
      Math.min(this.height - 1, bottom),
    )

    const firstColumn = Math.max(0, left) >> TILE_SHIFT
    const lastColumn = Math.min(this.width - 1, right) >> TILE_SHIFT
    const firstRow = Math.max(0, top) >> TILE_SHIFT
    const lastRow = Math.min(this.height - 1, bottom) >> TILE_SHIFT

    for (let row = firstRow; row <= lastRow; row++) {
      for (let column = firstColumn; column <= lastColumn; column++) {
        this.touched[row * this.columns + column] = 1
      }
    }
  }

  private mark(x: number, y: number): void {
    if (this.trace) this.trace[y * this.width + x] = 1
    if (x < this.left) this.left = x
    if (y < this.top) this.top = y
    if (x > this.right) this.right = x
    if (y > this.bottom) this.bottom = y

    this.touched[(y >> TILE_SHIFT) * this.columns + (x >> TILE_SHIFT)] = 1
  }

  get paintValue(): number {
    return this.alpha < COVERAGE_FULL
      ? coveredValue(valueInk(this.value), this.alpha)
      : this.value
  }

  plot(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    if (this.masked && !this.patternAt(x, y)) {
      if (this.overwrite) this.erase(x, y)

      return
    }

    this.put(x, y)
  }

  private put(x: number, y: number): void {
    if (this.alpha < COVERAGE_FULL) {
      this.cover(x, y, COVERAGE_FULL, false)

      return
    }

    const index = y * this.width + x

    this.plane[index] = this.value

    for (const other of this.others) other[index] = 0

    this.mark(x, y)
  }

  rub(x: number, y: number): void {
    if (this.eraseStrength < COVERAGE_FULL) this.uncover(x, y, COVERAGE_FULL)
    else this.erase(x, y)
  }

  erase(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    const index = y * this.width + x

    this.plane[index] = 0

    for (const other of this.others) other[index] = 0

    this.mark(x, y)
  }

  cover(x: number, y: number, amount: number, builds: boolean): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    const index = y * this.width + x
    const value = this.plane[index]
    const had = valueCoverage(value)
    const ink = valueInk(this.value)
    const isSameInk = value === 0 || valueInk(value) === ink
    const coverage = Math.max(
      1,
      Math.round((amount * this.alpha) / COVERAGE_FULL),
    )

    if (!isSameInk && coverage * 2 < had) return

    const added = Math.round((coverage * (COVERAGE_FULL - had)) / COVERAGE_FULL)
    const next = isSameInk
      ? builds
        ? had + Math.max(1, added)
        : Math.max(had, coverage)
      : Math.max(coverage, had + added)

    this.plane[index] = coveredValue(
      ink,
      Math.min(next, this.coverLimit(index, ink)),
    )
    this.mark(x, y)
  }

  private coverLimit(index: number, ink: number): number {
    if (this.alpha >= COVERAGE_FULL) return COVERAGE_FULL

    const before = this.base ? this.base[index] : 0
    const kept =
      before !== 0 && valueInk(before) === ink ? valueCoverage(before) : 0

    return Math.max(this.alpha, kept)
  }

  plotIndex(index: number): void {
    this.mark(index % this.width, Math.floor(index / this.width))
  }

  uncover(x: number, y: number, amount: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    const index = y * this.width + x
    const value = this.plane[index]

    if (value === 0) return

    const strength = this.eraseStrength
    const removal = (amount * strength) / COVERAGE_FULL
    const left = Math.floor(
      (valueCoverage(value) * (COVERAGE_FULL - removal)) / COVERAGE_FULL,
    )

    this.plane[index] = coveredValue(
      valueInk(value),
      Math.max(left, this.eraseFloor(index, value)),
    )
    this.mark(x, y)
  }

  private eraseFloor(index: number, value: number): number {
    if (this.eraseStrength >= COVERAGE_FULL || !this.base) return 0

    const before = this.base[index]

    if (before === 0 || valueInk(before) !== valueInk(value)) return 0

    return Math.floor(
      (valueCoverage(before) * (COVERAGE_FULL - this.eraseStrength)) /
        COVERAGE_FULL,
    )
  }

  paint(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    if (this.patternAt(x, y)) this.put(x, y)
    else if (this.overwrite) this.erase(x, y)
  }

  erasePattern(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return

    if (this.patternAt(x, y)) this.erase(x, y)
  }

  patternAt(x: number, y: number): number {
    return patternBit(this.pattern, x + this.phase, y + this.phase)
  }
}
