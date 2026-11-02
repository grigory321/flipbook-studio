import { PATTERN_TONE } from '../core/patterns.ts'
import type { Surface } from '../core/surface.ts'

export const DSI_SAMPLES_PER_FRAME = 4

export const DsiBrush = {
  spray: 0x00,
  line: 0x01,
  eraseSquare3: 0x02,
  square3: 0x03,
  double: 0x04,
  pen2: 0x05,
  jitter: 0x06,
  scatter: 0x07,
  pen2Even: 0x08,
  eraseRound7: 0x0f,
  eraseRound15: 0x10,
  eraseLine: 0x11,
  square5: 0x17,
  square7: 0x18,
  square9: 0x19,
  speed: 0x1a,
  outline: 0x1b,
  sprayWide: 0x1c,
  scatterWide: 0x1d,
  jitterWide: 0x1e,
  eraseSquare7: 0x1f,
  eraseSquare15: 0x20,
  eraseBarH: 0x21,
  eraseBarV: 0x22,
  paint: 0x100,
} as const

function mask(rows: readonly string[]): Uint8Array {
  const size = rows.length
  const bits = new Uint8Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      bits[y * size + x] = rows[y][x] === '#' ? 1 : 0
    }
  }

  return bits
}

const DIAMOND_5 = mask(['..#..', '.###.', '#####', '.###.', '..#..'])

export const ROUND_7 = mask([
  '..###..',
  '.#####.',
  '#######',
  '#######',
  '#######',
  '.#####.',
  '..###..',
])

export const ROUND_15 = mask([
  '......###......',
  '.....#####.....',
  '...#########...',
  '..###########..',
  '.#############.',
  '###############',
  '###############',
  '###############',
  '###############',
  '###############',
  '.#############.',
  '..###########..',
  '...#########...',
  '.....#####.....',
  '......###......',
])

const SQUARE_3_POINTS = [
  0, 0, 0, -1, 0, 1, 1, 0, 1, 1, 1, -1, -1, 0, -1, 1, -1, -1,
]

const MAX_X = 255
const MAX_Y = 191
const JUMP_LIMIT = 30
const HOLD_LIMIT = 80

let randomState = 0x1f01

export function seedDsiRandom(value: number): void {
  randomState = value & 0xffff
}

export function dsiRandomState(): number {
  return randomState
}

function random(): number {
  const lowBit = randomState & 1
  const tapBit = randomState & 8

  randomState >>= 1

  if (!lowBit === !tapBit) randomState |= 0x8000

  return randomState
}

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

class LineWalker {
  x: number
  y: number
  readonly stepsX: number
  readonly stepsY: number

  private readonly endX: number
  private readonly endY: number
  private readonly deltaX: number
  private readonly deltaY: number
  private error = 0

  constructor(startX: number, startY: number, endX: number, endY: number) {
    this.x = startX
    this.y = startY
    this.endX = endX
    this.endY = endY
    this.deltaX = endX - startX
    this.deltaY = endY - startY
    this.stepsX = Math.abs(this.deltaX)
    this.stepsY = Math.abs(this.deltaY)
  }

  next(): boolean {
    if (this.x === this.endX && this.y === this.endY) return false

    if (this.stepsX > this.stepsY) {
      this.error += this.stepsY

      if (this.error >= this.stepsX) {
        this.error -= this.stepsX
        this.y += this.deltaY < 0 ? -1 : 1
      }

      if (this.x !== this.endX) this.x += this.deltaX < 0 ? -1 : 1
    } else {
      this.error += this.stepsX

      if (this.error >= this.stepsY) {
        this.error -= this.stepsY
        this.x += this.deltaX < 0 ? -1 : 1
      }

      if (this.y !== this.endY) this.y += this.deltaY < 0 ? -1 : 1
    }

    return true
  }
}

function keepAlong(point: number[], vectorX: number, vectorY: number): void {
  const length = vectorX * vectorX + vectorY * vectorY

  if (!length) return

  const dot = point[0] * vectorX + point[1] * vectorY

  point[0] -= Math.trunc((vectorX * dot) / length)
  point[1] -= Math.trunc((vectorY * dot) / length)
}

export interface DsiPenOptions {
  paintRadius?: number
  patternErase?: boolean
}

export class DsiPen {
  private readonly surface: Surface
  private readonly brush: number
  private readonly paintRadius: number
  private readonly patternErase: boolean

  isStarting = false

  private x = 0
  private y = 0
  private oneBackX = 0
  private oneBackY = 0
  private twoBackX = 0
  private twoBackY = 0
  private outlineX = 0
  private outlineY = 0

  private isHolding = false
  private holdCount = 0
  private holdX = 0
  private holdY = 0
  private lastDeltaX = 0
  private lastDeltaY = 0
  private lastX = 0
  private lastY = 0
  private lastDistance = 0

  constructor(surface: Surface, brush: number, options: DsiPenOptions = {}) {
    this.surface = surface
    this.brush = brush
    this.paintRadius = options.paintRadius ?? 1
    this.patternErase = options.patternErase ?? false
  }

  down(x: number, y: number): void {
    this.x = x
    this.y = y
  }

  lineTo(x: number, y: number): void {
    this.stroke(x, y)
  }

  sample(x: number, y: number): void {
    let deltaX = x - this.x
    let deltaY = y - this.y
    let isJump = true

    if (this.isHolding) {
      const heldX = x - this.holdX
      const heldY = y - this.holdY
      let isStillHeld = false

      if (Math.abs(deltaX) > Math.abs(heldX)) {
        deltaX = heldX
        isStillHeld = true
      }

      if (Math.abs(deltaY) > Math.abs(heldY)) {
        deltaY = heldY
        isStillHeld = true
      }

      if (!isStillHeld) {
        this.isHolding = false
        this.holdCount = 0
        isJump = false
      } else if (++this.holdCount > HOLD_LIMIT) {
        this.isHolding = false
        this.holdCount = 0

        return
      }
    }

    let distance = Math.floor(Math.hypot(deltaX, deltaY))

    if (distance - this.lastDistance < JUMP_LIMIT) isJump = false
    else this.isHolding = false

    if (isJump || this.isHolding) {
      const corrected = this.correctJump(x, y, deltaX, deltaY)

      deltaX = corrected[0]
      deltaY = corrected[1]
      this.isHolding = true
      distance = 0
    }

    this.lastDistance = distance
    this.lastDeltaX = deltaX
    this.lastDeltaY = deltaY
    this.lastX = x
    this.lastY = y

    if (this.isHolding) {
      this.holdX = x
      this.holdY = y
    }

    this.stroke(this.x + deltaX, this.y + deltaY)
  }

  private correctJump(
    x: number,
    y: number,
    deltaX: number,
    deltaY: number,
  ): [number, number] {
    const lastX = this.lastDeltaX
    const lastY = this.lastDeltaY

    if (lastX === 0 && lastY === 0) return [0, 0]

    const across = [deltaX, deltaY]

    keepAlong(across, lastX, lastY)

    const nextX = deltaX - across[0]
    const nextY = deltaY - across[1]
    let isBackward = false

    if (Math.abs(lastX) > Math.abs(lastY)) {
      isBackward = (lastX > 0 && nextX < 0) || (lastX < 0 && nextX > 0)
    } else {
      isBackward = (lastY > 0 && nextY < 0) || (lastY < 0 && nextY > 0)
    }

    if (Math.floor(Math.hypot(nextX, nextY)) > this.lastDistance) {
      isBackward = true
    }

    if (Math.abs(x - this.lastX) < Math.abs(lastX)) {
      this.lastDeltaX = x - this.lastX
    }

    if (Math.abs(y - this.lastY) < Math.abs(lastY)) {
      this.lastDeltaY = y - this.lastY
    }

    return isBackward ? [this.lastDeltaX, this.lastDeltaY] : [nextX, nextY]
  }

  private plot(x: number, y: number): void {
    this.surface.plot(x, y)
  }

  private eraseSoft(x: number, y: number): void {
    if (this.patternErase) this.surface.erasePattern(x, y)
    else this.surface.erase(x, y)
  }

  private stroke(x: number, y: number): void {
    switch (this.brush) {
      case DsiBrush.spray:
        return this.spray(x, y, DIAMOND_5, 5, 3)
      case DsiBrush.line:
        return this.thinLine(x, y, true)
      case DsiBrush.eraseSquare3:
        return this.threeDots(x, y, true)
      case DsiBrush.square3:
        return this.threeDots(x, y, false)
      case DsiBrush.double:
        return this.doubleLine(x, y, 1)
      case DsiBrush.pen2:
        return this.twoDots(x, y)
      case DsiBrush.jitter:
        return this.jitter(x, y, false)
      case DsiBrush.scatter:
        return this.scatter(x, y, false)
      case DsiBrush.pen2Even:
        return this.evenSquare(x, y)
      case DsiBrush.eraseRound7:
        return this.roundErase(x, y, ROUND_7, 7)
      case DsiBrush.eraseRound15:
        return this.roundErase(x, y, ROUND_15, 15)
      case DsiBrush.eraseLine:
        return this.thinLine(x, y, false)
      case DsiBrush.square5:
        return this.square(x, y, 2)
      case DsiBrush.square7:
        return this.square(x, y, 3)
      case DsiBrush.square9:
        return this.square(x, y, 4)
      case DsiBrush.speed:
        return this.speedPen(x, y)
      case DsiBrush.outline:
        return this.outline(x, y)
      case DsiBrush.sprayWide:
        return this.spray(x, y, ROUND_15, 15, 8)
      case DsiBrush.scatterWide:
        return this.scatter(x, y, true)
      case DsiBrush.jitterWide:
        return this.jitter(x, y, true)
      case DsiBrush.eraseSquare7:
        return this.squareErase(x, y, 3)
      case DsiBrush.eraseSquare15:
        return this.squareErase(x, y, 7)
      case DsiBrush.eraseBarH:
        return this.barErase(x, y, false)
      case DsiBrush.eraseBarV:
        return this.barErase(x, y, true)
      case DsiBrush.paint:
        return this.paint(x, y)
    }
  }

  private thinLine(x: number, y: number, isDrawing: boolean): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    while (walker.next()) {
      if (isDrawing) this.plot(walker.x, walker.y)
      else this.eraseSoft(walker.x, walker.y)
    }

    this.x = x
    this.y = y
  }

  private threeDots(x: number, y: number, isErasing: boolean): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    while (walker.next()) {
      this.x = walker.x
      this.y = walker.y

      for (let index = 0; index < SQUARE_3_POINTS.length; index += 2) {
        const pointX = walker.x + SQUARE_3_POINTS[index]
        const pointY = walker.y + SQUARE_3_POINTS[index + 1]

        if (isErasing) this.eraseSoft(pointX, pointY)
        else this.plot(pointX, pointY)
      }
    }

    this.x = x
    this.y = y
  }

  private twoDots(x: number, y: number): void {
    const deltaX = x - this.x
    const deltaY = y - this.y
    const stepsX = Math.abs(deltaX)
    const stepsY = Math.abs(deltaY)
    let error = 0

    while (this.x !== x || this.y !== y) {
      const startX = this.x
      let sideX = 0
      let sideY = 0

      if (stepsX > stepsY) {
        error += stepsY

        if (error >= stepsX) {
          error -= stepsX
          sideY = deltaY >= 0 ? 1 : -1
          this.y += sideY
        }

        if (startX !== x) {
          sideX = deltaX < 0 ? -1 : 1
          this.x += sideX
        }
      } else {
        error += stepsX

        if (error >= stepsY) {
          error -= stepsY
          sideX = deltaX >= 0 ? 1 : -1
          this.x += sideX
        }

        if (this.y !== y) {
          sideY = deltaY >= 0 ? 1 : -1
          this.y += sideY
        }
      }

      this.plot(this.x, this.y)
      this.plot(this.x + sideY, this.y)
      this.plot(this.x, this.y + sideX)
    }
  }

  private plot2x2(x: number, y: number): void {
    this.plot(x, y)
    this.plot(x + 1, y)
    this.plot(x, y + 1)
    this.plot(x + 1, y + 1)
  }

  private evenSquare(x: number, y: number): void {
    this.x &= ~1
    this.y &= ~1

    if (this.isStarting) {
      this.oneBackX = this.x
      this.oneBackY = this.y
      this.twoBackX = this.x
      this.twoBackY = this.y
    }

    let deltaX = x - this.x
    let deltaY = y - this.y

    if (deltaX & 1) deltaX += deltaX < 0 ? 1 : -1
    if (deltaY & 1) deltaY += deltaY < 0 ? 1 : -1

    const targetX = this.x + deltaX
    const targetY = this.y + deltaY
    const stepsX = Math.abs(deltaX)
    const stepsY = Math.abs(deltaY)
    let error = 0

    while (this.x !== targetX || this.y !== targetY) {
      const startX = this.x

      if (stepsX > stepsY) {
        error += stepsY

        if (error >= stepsX) {
          this.y += deltaY < 0 ? -2 : 2
          error -= stepsX
        }

        if (startX !== targetX) this.x += deltaX < 0 ? -2 : 2
      } else {
        error += stepsX

        if (error >= stepsY) {
          this.x += deltaX < 0 ? -2 : 2
          error -= stepsY
        }

        if (this.y !== targetY) this.y += deltaY < 0 ? -2 : 2
      }

      this.plot2x2(this.x, this.y)
      this.plot2x2(
        Math.trunc((this.x + this.twoBackX) / 2),
        Math.trunc((this.y + this.twoBackY) / 2),
      )
      this.twoBackX = this.oneBackX
      this.twoBackY = this.oneBackY
      this.plot2x2(
        Math.trunc((this.x + this.oneBackX) / 2),
        Math.trunc((this.y + this.oneBackY) / 2),
      )
      this.oneBackX = this.x
      this.oneBackY = this.y
    }
  }

  private doubleLine(x: number, y: number, radius: number): void {
    const deltaX = x - this.x
    const deltaY = y - this.y
    const stepsX = Math.abs(deltaX)
    const stepsY = Math.abs(deltaY)
    let error = 0
    let direction = 0

    while (this.x !== x || this.y !== y) {
      const startX = this.x

      if (stepsX > stepsY) {
        error += stepsY

        if (error >= stepsX) {
          error -= stepsX

          if (deltaY >= 0) {
            direction = 1
            this.y++
          } else {
            direction = 0
            this.y--
          }
        }

        if (startX !== x) {
          if (deltaX < 0) {
            direction = 2
            this.x--
          } else {
            direction = 3
            this.x++
          }
        }
      } else {
        error += stepsX

        if (error >= stepsY) {
          error -= stepsY

          if (deltaX >= 0) {
            direction = 7
            this.x++
          } else {
            direction = 6
            this.x--
          }
        }

        if (this.y !== y) {
          if (deltaY >= 0) {
            direction = 5
            this.y++
          } else {
            direction = 4
            this.y--
          }
        }
      }

      this.plotDouble(direction, radius)
    }
  }

  private plotDouble(direction: number, radius: number): void {
    const { x, y } = this

    if (!(direction & 2)) {
      this.plot(x + radius, y)
      this.plot(x - radius, y)
    } else {
      this.plot(x, y - radius)
      this.plot(x, y + radius)
    }

    this.surface.erase(x, y)

    switch (direction & 3) {
      case 0:
        this.plot(x, y - radius)
        break
      case 1:
        this.plot(x, y + radius)
        break
      case 2:
        this.plot(x - radius, y)
        break
      default:
        this.plot(x + radius, y)
    }
  }

  private jitter(x: number, y: number, isWide: boolean): void {
    const range = isWide ? 10 : 5
    const offset = isWide ? 5 : 2
    const startX = this.x
    const startY = this.y
    const shiftStartX = (random() % range) - offset
    const shiftStartY = (random() % range) - offset
    const shiftEndX = (random() % range) - offset
    const shiftEndY = (random() % range) - offset

    this.x = clamp(startX + shiftStartX, 0, MAX_X)
    this.y = clamp(startY + shiftStartY, 0, MAX_Y)
    this.thinLine(
      clamp(x + shiftEndX, 0, MAX_X),
      clamp(y + shiftEndY, 0, MAX_Y),
      true,
    )
    this.x = x
    this.y = y
  }

  private scatter(x: number, y: number, isWide: boolean): void {
    const deltaX = x - this.x
    const deltaY = y - this.y
    const distance = deltaX * deltaX + deltaY * deltaY
    const startX = this.x
    const startY = this.y

    let spread = 1

    if (distance < 4) spread = 6
    else if (distance < 8) spread = 5
    else if (distance < 12) spread = 4
    else if (distance < 24) spread = 3
    else if (distance < 48) spread = 2

    let radius = spread * spread
    let count = 16 - spread

    if (isWide) {
      count <<= 2
      radius <<= 1
    }

    for (let index = 0; index < count; index++) {
      const point = [Math.floor(Math.sqrt(random() % (radius + 1))), 0]

      point[1] = Math.floor(Math.sqrt(random() % (radius + 1)))

      if (point[0] > 0) point[0]--
      if (point[1] > 0) point[1]--
      if (random() & 1) point[0] = -point[0]
      if (random() & 1) point[1] = -point[1]

      const shift = [(random() % 3) - 1, 0]

      shift[1] = (random() % 3) - 1

      keepAlong(point, deltaX, deltaY)
      keepAlong(shift, deltaX, deltaY)

      this.x = clamp(startX + point[0], 0, MAX_X)
      this.y = clamp(startY + point[1], 0, MAX_Y)
      this.thinLine(
        clamp(x + point[0] + shift[0], 0, MAX_X),
        clamp(y + point[1] + shift[1], 0, MAX_Y),
        true,
      )
    }

    this.x = x
    this.y = y
  }

  private speedPen(x: number, y: number): void {
    const deltaX = x - this.x
    const deltaY = y - this.y
    const distance = deltaX * deltaX + deltaY * deltaY

    if (distance < 4) this.threeDots(x, y, false)
    else if (distance < 32) this.twoDots(x, y)
    else this.thinLine(x, y, true)
  }

  private spray(
    x: number,
    y: number,
    shape: Uint8Array,
    size: number,
    offset: number,
  ): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    if (walker.stepsX < 1 && walker.stepsY < 1) return

    while (walker.next()) {
      this.x = walker.x
      this.y = walker.y

      const moved = walker.stepsX + walker.stepsY
      const scale = moved << 6
      let index = 0

      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          if (moved && moved < ((random() % scale) & 0xffff)) {
            index++
            continue
          }

          if (shape[index]) {
            this.plot(this.x - offset + column, this.y - offset + row)
          }

          index++
        }
      }
    }

    this.x = x
    this.y = y
  }

  private roundErase(
    x: number,
    y: number,
    shape: Uint8Array,
    size: number,
  ): void {
    const walker = new LineWalker(this.x, this.y, x, y)
    const offset = size >> 1

    while (walker.next()) {
      this.x = walker.x
      this.y = walker.y

      for (let row = 0; row < size; row++) {
        for (let column = 0; column < size; column++) {
          if (shape[row * size + column]) {
            this.eraseSoft(walker.x - offset + column, walker.y - offset + row)
          }
        }
      }
    }

    this.x = x
    this.y = y
  }

  private square(x: number, y: number, radius: number): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    while (walker.next()) {
      this.x = walker.x
      this.y = walker.y

      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          this.plot(walker.x + offsetX, walker.y + offsetY)
        }
      }
    }

    this.x = x
    this.y = y
  }

  private outline(x: number, y: number): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    if (this.isStarting) {
      this.outlineX = this.x
      this.outlineY = this.y
    }

    while (walker.next()) {
      this.outlineX = this.x
      this.outlineY = this.y
      this.x = walker.x
      this.y = walker.y

      for (let row = 0; row < 7; row++) {
        for (let column = 0; column < 7; column++) {
          if (ROUND_7[row * 7 + column]) {
            this.plot(walker.x - 3 + column, walker.y - 3 + row)
          }
        }
      }

      for (let row = 0; row < 5; row++) {
        for (let column = 0; column < 5; column++) {
          if (DIAMOND_5[row * 5 + column]) {
            this.surface.erase(
              this.outlineX - 2 + column,
              this.outlineY - 2 + row,
            )
          }
        }
      }
    }

    this.x = x
    this.y = y
  }

  private squareErase(x: number, y: number, radius: number): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    do {
      this.x = walker.x
      this.y = walker.y

      for (let offsetY = -radius; offsetY <= radius; offsetY++) {
        for (let offsetX = -radius; offsetX <= radius; offsetX++) {
          this.eraseSoft(walker.x + offsetX, walker.y + offsetY)
        }
      }
    } while (walker.next())

    this.x = x
    this.y = y
  }

  private barErase(x: number, y: number, isVertical: boolean): void {
    const walker = new LineWalker(this.x, this.y, x, y)

    do {
      this.x = walker.x
      this.y = walker.y

      for (let offset = -7; offset <= 7; offset++) {
        const pointX = isVertical ? walker.x : walker.x + offset
        const pointY = isVertical ? walker.y + offset : walker.y

        this.eraseSoft(pointX, pointY)
      }
    } while (walker.next())

    this.x = x
    this.y = y
  }

  private paint(x: number, y: number): void {
    const walker = new LineWalker(this.x, this.y, x, y)
    const isTone = this.surface.pattern === PATTERN_TONE
    const radius = isTone ? 5 : this.paintRadius
    const hadOverwrite = this.surface.overwrite

    this.surface.overwrite = isTone || hadOverwrite

    while (walker.next()) {
      this.x = walker.x
      this.y = walker.y

      for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        for (let offsetY = -radius; offsetY <= radius; offsetY++) {
          this.surface.paint(walker.x + offsetX, walker.y + offsetY)
        }
      }
    }

    this.surface.overwrite = hadOverwrite
    this.x = x
    this.y = y
  }
}
