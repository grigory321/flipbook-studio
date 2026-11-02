import { KNOCKOUT_VALUE } from '../core/ink.ts'

export type FloatHandle =
  'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate'

export type FloatPoint = readonly [number, number]

export interface FloatBox {
  left: number
  top: number
  right: number
  bottom: number
}

const PLANE_SHIFT = 4
const VALUE_MASK = (1 << PLANE_SHIFT) - 1

const SCALE_MIN = 0.03
const SCALE_MAX = 24

const CORNER_HANDLES: readonly FloatHandle[] = ['nw', 'ne', 'se', 'sw']
const EDGE_HANDLES: readonly FloatHandle[] = ['n', 'e', 's', 'w']

export function layeredValue(plane: number, value: number): number {
  return (plane << PLANE_SHIFT) | value
}

export function splitLayeredValue(value: number): [number, number] {
  return [value >> PLANE_SHIFT, value & VALUE_MASK]
}

function clampScale(scale: number): number {
  const size = Math.abs(scale)
  const limited = Math.max(SCALE_MIN, Math.min(SCALE_MAX, size))

  return scale < 0 ? -limited : limited
}

export class Floating {
  readonly sourceWidth: number
  readonly sourceHeight: number
  readonly pixels: Uint8Array
  readonly isLayered: boolean
  retouch: (() => void) | null = null

  private readonly homeX: number
  private readonly homeY: number

  private centerX: number
  private centerY: number
  private scaleX = 1
  private scaleY = 1
  private angle = 0
  private quad: [number, number][] | null = null
  private readonly inverse = new Float64Array(9)

  constructor(
    pixels: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
    centerX: number,
    centerY: number,
    isLayered = false,
  ) {
    this.pixels = pixels
    this.sourceWidth = sourceWidth
    this.sourceHeight = sourceHeight
    this.centerX = this.homeX = centerX
    this.centerY = this.homeY = centerY
    this.isLayered = isLayered
    this.refresh()
  }

  get isAtHome(): boolean {
    return (
      this.centerX === this.homeX &&
      this.centerY === this.homeY &&
      this.scaleX === 1 &&
      this.scaleY === 1 &&
      this.angle === 0 &&
      this.quad === null
    )
  }

  get isFreeCorners(): boolean {
    return this.quad !== null
  }

  get center(): FloatPoint {
    return [this.centerX, this.centerY]
  }

  reset(): void {
    this.centerX = this.homeX
    this.centerY = this.homeY
    this.scaleX = 1
    this.scaleY = 1
    this.angle = 0
    this.quad = null
    this.refresh()
  }

  place(centerX: number, centerY: number, scale: number, angle: number): void {
    this.centerX = centerX
    this.centerY = centerY
    this.scaleX = clampScale(scale)
    this.scaleY = clampScale(scale)
    this.angle = angle
    this.quad = null
    this.refresh()
  }

  moveBy(deltaX: number, deltaY: number): void {
    this.centerX += deltaX
    this.centerY += deltaY

    if (this.quad) {
      for (const corner of this.quad) {
        corner[0] += deltaX
        corner[1] += deltaY
      }
    }

    this.refresh()
  }

  zoomBy(factor: number): void {
    this.scaleX = clampScale(this.scaleX * factor)
    this.scaleY = clampScale(this.scaleY * factor)
    this.refresh()
  }

  rotateTo(angle: number): void {
    this.angle = angle
    this.refresh()
  }

  rotateBy(delta: number): void {
    this.rotateTo(this.angle + delta)
  }

  get rotation(): number {
    return this.angle
  }

  flipHorizontal(): void {
    this.scaleX = -this.scaleX
    this.angle = -this.angle
    this.refresh()
  }

  flipVertical(): void {
    this.scaleY = -this.scaleY
    this.angle = -this.angle
    this.refresh()
  }

  setFreeCorners(isFree: boolean): void {
    this.quad = isFree
      ? this.corners().map(([x, y]): [number, number] => [x, y])
      : null
    this.refresh()
  }

  private toLocal(x: number, y: number): FloatPoint {
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)
    const offsetX = x - this.centerX
    const offsetY = y - this.centerY

    return [offsetX * cos + offsetY * sin, offsetY * cos - offsetX * sin]
  }

  private fromLocal(x: number, y: number): FloatPoint {
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)

    return [this.centerX + x * cos - y * sin, this.centerY + x * sin + y * cos]
  }

  dragHandle(handle: FloatHandle, x: number, y: number): void {
    if (this.quad) {
      const index = CORNER_HANDLES.indexOf(handle)

      if (index >= 0) this.quad[index] = [x, y]

      this.refresh()

      return
    }

    const [localX, localY] = this.toLocal(x, y)
    const halfWidth = this.sourceWidth / 2
    const halfHeight = this.sourceHeight / 2

    if (handle === 'e' || handle === 'w') {
      const scale = Math.abs(localX) / halfWidth

      this.scaleX = clampScale(Math.sign(this.scaleX) * scale)
    } else if (handle === 'n' || handle === 's') {
      const scale = Math.abs(localY) / halfHeight

      this.scaleY = clampScale(Math.sign(this.scaleY) * scale)
    } else {
      const reach = Math.hypot(
        this.scaleX * halfWidth,
        this.scaleY * halfHeight,
      )
      const factor = Math.hypot(localX, localY) / reach

      this.scaleX = clampScale(this.scaleX * factor)
      this.scaleY = clampScale(this.scaleY * factor)
    }

    this.refresh()
  }

  corners(): FloatPoint[] {
    if (this.quad) return this.quad

    const halfWidth = (this.sourceWidth / 2) * this.scaleX
    const halfHeight = (this.sourceHeight / 2) * this.scaleY

    return [
      this.fromLocal(-halfWidth, -halfHeight),
      this.fromLocal(halfWidth, -halfHeight),
      this.fromLocal(halfWidth, halfHeight),
      this.fromLocal(-halfWidth, halfHeight),
    ]
  }

  handles(stem: number): [FloatHandle, number, number][] {
    const corners = this.corners()
    const points: [FloatHandle, number, number][] = corners.map(
      (corner, index) => [CORNER_HANDLES[index], corner[0], corner[1]],
    )

    if (this.quad) return points

    corners.forEach(([x, y], index) => {
      const [nextX, nextY] = corners[(index + 1) % corners.length]

      points.push([EDGE_HANDLES[index], (x + nextX) / 2, (y + nextY) / 2])
    })

    const halfHeight = (this.sourceHeight / 2) * Math.abs(this.scaleY)
    const [topX, topY] = this.fromLocal(0, -halfHeight - stem)

    points.push(['rotate', topX, topY])

    return points
  }

  handleAt(
    x: number,
    y: number,
    reach: number,
    stem: number,
  ): FloatHandle | null {
    let best: FloatHandle | null = null
    let bestDistance = reach

    for (const [handle, handleX, handleY] of this.handles(stem)) {
      const distance = Math.hypot(x - handleX, y - handleY)

      if (distance <= bestDistance) {
        best = handle
        bestDistance = distance
      }
    }

    return best
  }

  bounds(): FloatBox {
    const corners = this.corners()
    const xs = corners.map(corner => corner[0])
    const ys = corners.map(corner => corner[1])

    return {
      left: Math.floor(Math.min(...xs)),
      top: Math.floor(Math.min(...ys)),
      right: Math.ceil(Math.max(...xs)) - 1,
      bottom: Math.ceil(Math.max(...ys)) - 1,
    }
  }

  contains(x: number, y: number): boolean {
    const [column, row] = this.toSource(x, y)

    return (
      column >= 0 &&
      row >= 0 &&
      column < this.sourceWidth &&
      row < this.sourceHeight
    )
  }

  private toSource(x: number, y: number): [number, number] {
    const matrix = this.inverse
    const pointX = x + 0.5
    const pointY = y + 0.5
    const weight = matrix[6] * pointX + matrix[7] * pointY + matrix[8]

    return [
      (matrix[0] * pointX + matrix[1] * pointY + matrix[2]) / weight,
      (matrix[3] * pointX + matrix[4] * pointY + matrix[5]) / weight,
    ]
  }

  sample(x: number, y: number): number {
    const [u, v] = this.toSource(x, y)
    const column = Math.floor(u)
    const row = Math.floor(v)

    if (
      column < 0 ||
      row < 0 ||
      column >= this.sourceWidth ||
      row >= this.sourceHeight
    ) {
      return 0
    }

    return this.pixels[row * this.sourceWidth + column]
  }

  private refresh(): void {
    if (this.quad) this.refreshQuad(this.quad)
    else this.refreshAffine()
  }

  private refreshAffine(): void {
    const matrix = this.inverse
    const cos = Math.cos(this.angle)
    const sin = Math.sin(this.angle)
    const { centerX, centerY, scaleX, scaleY } = this

    matrix[0] = cos / scaleX
    matrix[1] = sin / scaleX
    matrix[2] = this.sourceWidth / 2 - (cos * centerX + sin * centerY) / scaleX
    matrix[3] = -sin / scaleY
    matrix[4] = cos / scaleY
    matrix[5] = this.sourceHeight / 2 - (cos * centerY - sin * centerX) / scaleY
    matrix[6] = 0
    matrix[7] = 0
    matrix[8] = 1
  }

  private refreshQuad(quad: readonly FloatPoint[]): void {
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = quad
    const sumX = x0 - x1 + x2 - x3
    const sumY = y0 - y1 + y2 - y3
    const edgeX1 = x1 - x2
    const edgeX2 = x3 - x2
    const edgeY1 = y1 - y2
    const edgeY2 = y3 - y2
    const divisor = edgeX1 * edgeY2 - edgeX2 * edgeY1 || 1e-9
    const g = (sumX * edgeY2 - edgeX2 * sumY) / divisor
    const h = (edgeX1 * sumY - sumX * edgeY1) / divisor
    const a = x1 - x0 + g * x1
    const b = x3 - x0 + h * x3
    const c = x0
    const d = y1 - y0 + g * y1
    const e = y3 - y0 + h * y3
    const f = y0
    const matrix = this.inverse

    matrix[0] = (e - f * h) * this.sourceWidth
    matrix[1] = (c * h - b) * this.sourceWidth
    matrix[2] = (b * f - c * e) * this.sourceWidth
    matrix[3] = (f * g - d) * this.sourceHeight
    matrix[4] = (a - c * g) * this.sourceHeight
    matrix[5] = (c * d - a * f) * this.sourceHeight
    matrix[6] = d * h - e * g
    matrix[7] = b * g - a * h
    matrix[8] = a * e - b * d
  }

  bake(): Floating {
    const { left, top, right, bottom } = this.bounds()
    const width = right - left + 1
    const height = bottom - top + 1
    const pixels = new Uint8Array(width * height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        pixels[y * width + x] = this.sample(left + x, top + y)
      }
    }

    return new Floating(
      pixels,
      width,
      height,
      left + width / 2,
      top + height / 2,
      this.isLayered,
    )
  }

  stamp(planes: readonly Uint8Array[], width: number, height: number): void {
    const box = this.bounds()
    const left = Math.max(0, box.left)
    const top = Math.max(0, box.top)
    const right = Math.min(width - 1, box.right)
    const bottom = Math.min(height - 1, box.bottom)

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const value = this.sample(x, y)

        if (value === 0) continue

        const index = y * width + x

        if (value === KNOCKOUT_VALUE) {
          for (const target of planes) target[index] = 0

          continue
        }

        if (!this.isLayered) {
          planes[0][index] = value

          continue
        }

        const [plane, ink] = splitLayeredValue(value)

        planes.forEach((target, order) => {
          target[index] = order === plane ? ink : 0
        })
      }
    }
  }
}

export function liftMask(
  planes: readonly Uint8Array[],
  width: number,
  height: number,
  mask: Uint8Array,
): Floating | null {
  const isLayered = planes.length > 1
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x

      if (!mask[index] || !planes.some(plane => plane[index])) continue

      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }

  if (right < 0) return null

  const boxWidth = right - left + 1
  const boxHeight = bottom - top + 1
  const pixels = new Uint8Array(boxWidth * boxHeight)

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const index = y * width + x

      if (!mask[index]) continue

      planes.forEach((plane, order) => {
        const value = plane[index]

        if (value === 0) return

        pixels[(y - top) * boxWidth + x - left] = isLayered
          ? layeredValue(order, value)
          : value
        plane[index] = 0
      })
    }
  }

  return new Floating(
    pixels,
    boxWidth,
    boxHeight,
    left + boxWidth / 2,
    top + boxHeight / 2,
    isLayered,
  )
}
