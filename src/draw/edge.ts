import {
  COVERAGE_FULL,
  KNOCKOUT_VALUE,
  valueCoverage,
  valueInk,
} from '../core/ink.ts'
import type { Surface } from '../core/surface.ts'

export type EdgeStyle = 'none' | 'outline' | 'hollow'

export interface EdgeSpec {
  style: EdgeStyle
  width: number
  second: number
}

function discOffsets(radius: number): [number, number][] {
  const offsets: [number, number][] = []

  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      if (x * x + y * y <= radius * radius + radius / 2) offsets.push([x, y])
    }
  }

  return offsets
}

export function edgeMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const edge = new Uint8Array(width * height)
  const offsets = discOffsets(radius)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x

      if (!mask[index]) continue

      const isInner =
        mask[index - 1] &&
        mask[index + 1] &&
        mask[index - width] &&
        mask[index + width]

      if (isInner) continue

      for (const [offsetX, offsetY] of offsets) {
        const nextX = x + offsetX
        const nextY = y + offsetY

        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue
        }

        const next = nextY * width + nextX

        if (!mask[next]) edge[next] = 1
      }
    }
  }

  return edge
}

export class EdgeTracer {
  private readonly surface: Surface
  private readonly edge: EdgeSpec
  private readonly ink: number
  private readonly offsets: readonly (readonly [number, number])[]
  private readonly body: Uint8Array
  private readonly trace: Uint8Array

  constructor(surface: Surface, edge: EdgeSpec) {
    this.surface = surface
    this.edge = { ...edge }
    this.ink = surface.value
    this.offsets = discOffsets(edge.width)
    this.body = new Uint8Array(surface.plane.length)
    this.trace = new Uint8Array(surface.plane.length)
    surface.trace = this.trace
  }

  update(): void {
    const { surface, trace, body } = this

    if (surface.right < surface.left) return

    const added: number[] = []
    const repainted: number[] = []
    const faint: number[] = []

    for (let y = surface.top; y <= surface.bottom; y++) {
      for (let x = surface.left; x <= surface.right; x++) {
        const index = y * surface.width + x

        if (!trace[index]) continue

        trace[index] = 0

        if (body[index]) repainted.push(index)
        else if (this.isBody(surface.plane[index])) {
          body[index] = 1
          added.push(index)
        } else faint.push(index)
      }
    }

    surface.trace = null

    const isHollow = this.edge.style === 'hollow'
    const rim = isHollow ? this.ink : this.edge.second

    if (isHollow) {
      this.paint(repainted, this.edge.second)
      this.paint(added, this.edge.second)
    }

    this.paint(faint, rim)

    for (const index of added) {
      if (this.isOnBorder(index)) this.paint(this.around(index), rim)
    }

    surface.value = this.ink
    surface.trace = trace
  }

  finish(): void {
    this.update()
    this.surface.trace = null
  }

  private isBody(value: number): boolean {
    return (
      value !== 0 &&
      valueInk(value) === valueInk(this.ink) &&
      valueCoverage(value) * 2 >= COVERAGE_FULL
    )
  }

  private isOnBorder(index: number): boolean {
    const { body } = this
    const { width, height } = this.surface
    const x = index % width
    const y = (index - x) / width

    return (
      x === 0 ||
      y === 0 ||
      x === width - 1 ||
      y === height - 1 ||
      !body[index - 1] ||
      !body[index + 1] ||
      !body[index - width] ||
      !body[index + width]
    )
  }

  private around(index: number): number[] {
    const { width, height } = this.surface
    const x = index % width
    const y = (index - x) / width
    const points: number[] = []

    for (const [offsetX, offsetY] of this.offsets) {
      const nextX = x + offsetX
      const nextY = y + offsetY

      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) continue

      const next = nextY * width + nextX

      if (!this.body[next]) points.push(next)
    }

    return points
  }

  private paint(points: readonly number[], value: number): void {
    const { surface } = this
    const { width } = surface

    surface.value = value

    for (const index of points) {
      const x = index % width
      const y = (index - x) / width

      if (value === KNOCKOUT_VALUE) surface.erase(x, y)
      else surface.plot(x, y)
    }
  }
}
