import { Random } from './random.ts'

const UNIT = 32
const LIMIT = 64
const MAX_OFFSET = LIMIT * UNIT

export interface WarpBox {
  left: number
  top: number
  right: number
  bottom: number
}

function falloff(ratio: number): number {
  const inverse = 1 - ratio

  return inverse * inverse
}

function clampOffset(value: number): number {
  return Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, value))
}

export class WarpField {
  readonly width: number
  readonly height: number

  private readonly offsetX: Int16Array
  private readonly offsetY: Int16Array

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.offsetX = new Int16Array(width * height)
    this.offsetY = new Int16Array(width * height)
  }

  private circle(x: number, y: number, radius: number): WarpBox {
    return {
      left: Math.max(0, Math.floor(x - radius)),
      top: Math.max(0, Math.floor(y - radius)),
      right: Math.min(this.width - 1, Math.ceil(x + radius)),
      bottom: Math.min(this.height - 1, Math.ceil(y + radius)),
    }
  }

  push(
    x: number,
    y: number,
    moveX: number,
    moveY: number,
    radius: number,
    strength: number,
  ): WarpBox {
    const box = this.circle(x, y, radius)
    const limit = radius * radius

    for (let row = box.top; row <= box.bottom; row++) {
      for (let column = box.left; column <= box.right; column++) {
        const distance = (column - x) * (column - x) + (row - y) * (row - y)

        if (distance >= limit) continue

        const weight = falloff(distance / limit) * strength * UNIT
        const index = row * this.width + column

        this.offsetX[index] = clampOffset(this.offsetX[index] + moveX * weight)
        this.offsetY[index] = clampOffset(this.offsetY[index] + moveY * weight)
      }
    }

    return box
  }

  swell(x: number, y: number, radius: number, amount: number): WarpBox {
    const box = this.circle(x, y, radius)
    const limit = radius * radius

    for (let row = box.top; row <= box.bottom; row++) {
      for (let column = box.left; column <= box.right; column++) {
        const offsetX = column - x
        const offsetY = row - y
        const distance = offsetX * offsetX + offsetY * offsetY

        if (distance >= limit) continue

        const weight = falloff(distance / limit) * amount * 0.5 * UNIT
        const index = row * this.width + column

        this.offsetX[index] = clampOffset(
          this.offsetX[index] + offsetX * weight,
        )
        this.offsetY[index] = clampOffset(
          this.offsetY[index] + offsetY * weight,
        )
      }
    }

    return box
  }

  fillNoise(seed: number, wavelength: number, amplitude: number): void {
    this.fillAxis(this.offsetX, seed, wavelength, amplitude)
    this.fillAxis(this.offsetY, seed ^ 0x5bd1e995, wavelength, amplitude)
  }

  private fillAxis(
    target: Int16Array,
    seed: number,
    wavelength: number,
    amplitude: number,
  ): void {
    const { width, height } = this
    const columns = Math.ceil(width / wavelength) + 2
    const rows = Math.ceil(height / wavelength) + 2
    const random = new Random(seed)
    const lattice = new Float32Array(columns * rows)

    for (let index = 0; index < lattice.length; index++) {
      lattice[index] = random.next() * 2 - 1
    }

    const smooth = (value: number): number => value * value * (3 - 2 * value)

    for (let y = 0; y < height; y++) {
      const cellY = y / wavelength
      const rowIndex = Math.floor(cellY)
      const blendY = smooth(cellY - rowIndex)

      for (let x = 0; x < width; x++) {
        const cellX = x / wavelength
        const columnIndex = Math.floor(cellX)
        const blendX = smooth(cellX - columnIndex)
        const at = rowIndex * columns + columnIndex
        const top = lattice[at] + (lattice[at + 1] - lattice[at]) * blendX
        const bottom =
          lattice[at + columns] +
          (lattice[at + columns + 1] - lattice[at + columns]) * blendX

        target[y * width + x] =
          (top + (bottom - top) * blendY) * amplitude * UNIT
      }
    }
  }

  apply(from: Uint8Array, to: Uint8Array, box?: WarpBox): void {
    const { width, height } = this
    const left = box?.left ?? 0
    const top = box?.top ?? 0
    const right = box?.right ?? width - 1
    const bottom = box?.bottom ?? height - 1

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const index = y * width + x
        const sourceX = Math.round(x - this.offsetX[index] / UNIT)
        const sourceY = Math.round(y - this.offsetY[index] / UNIT)
        const isInside =
          sourceX >= 0 && sourceY >= 0 && sourceX < width && sourceY < height

        to[index] = isInside ? from[sourceY * width + sourceX] : 0
      }
    }
  }
}
