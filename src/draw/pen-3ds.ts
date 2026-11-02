import type { Surface } from '../core/surface.ts'

export const N3dsKind = { pen: 0, eraser: 1, paint: 2 } as const

export type N3dsKind = (typeof N3dsKind)[keyof typeof N3dsKind]

interface Tip {
  size: number
  bits: Uint8Array
}

function tip(rows: readonly string[]): Tip {
  const size = rows.length
  const bits = new Uint8Array(size * size)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      bits[y * size + x] = rows[y][x] === '#' ? 1 : 0
    }
  }

  return { size, bits }
}

function filledTip(size: number): Tip {
  return { size, bits: new Uint8Array(size * size).fill(1) }
}

function barTip(size: number, isVertical: boolean): Tip {
  const bits = new Uint8Array(size * size)
  const center = size >> 1

  for (let index = 0; index < size; index++) {
    bits[isVertical ? index * size + center : center * size + index] = 1
  }

  return { size, bits }
}

const ROUND_5 = tip(['.###.', '#####', '#####', '#####', '.###.'])

const ROUND_7 = tip([
  '..###..',
  '.#####.',
  '#######',
  '#######',
  '#######',
  '.#####.',
  '..###..',
])

const ROUND_8 = tip([
  '..####..',
  '.######.',
  '########',
  '########',
  '########',
  '########',
  '.######.',
  '..####..',
])

const ROUND_9 = tip([
  '...###...',
  '.#######.',
  '.#######.',
  '#########',
  '#########',
  '#########',
  '.#######.',
  '.#######.',
  '...###...',
])

const ROUND_15 = tip([
  '....#######....',
  '..###########..',
  '.#############.',
  '.#############.',
  '###############',
  '###############',
  '###############',
  '###############',
  '###############',
  '###############',
  '###############',
  '.#############.',
  '.#############.',
  '..###########..',
  '....#######....',
])

const ROUND_16 = tip([
  '.....######.....',
  '...##########...',
  '..############..',
  '.##############.',
  '.##############.',
  '################',
  '################',
  '################',
  '################',
  '################',
  '################',
  '.##############.',
  '.##############.',
  '..############..',
  '...##########...',
  '.....######.....',
])

const DIAMOND_5 = tip(['..#..', '.###.', '#####', '.###.', '..#..'])

const OCTAGON_15 = tip([
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

const PEN_TIPS: readonly (Tip | null)[] = [
  filledTip(1),
  filledTip(2),
  filledTip(3),
  null,
  null,
  null,
  null,
  null,
  null,
  ROUND_5,
  ROUND_9,
  ROUND_15,
]

const PEN_BRUSH_SMALL = 3
const PEN_OUTLINE_SMALL = 4
const PEN_DOTS_SMALL = 5
const PEN_NOISE_SMALL = 6
const PEN_SPRAY_SMALL = 7
const PEN_BRUSH_LARGE = 12
const PEN_OUTLINE_LARGE = 13
const PEN_DOTS_LARGE = 14
const PEN_NOISE_LARGE = 15
const PEN_SPRAY_LARGE = 16

const ERASER_TIPS: readonly Tip[] = [
  filledTip(1),
  filledTip(3),
  ROUND_8,
  ROUND_16,
  filledTip(9),
  filledTip(13),
  barTip(15, true),
  barTip(15, false),
]

const PAINT_TIPS: readonly Tip[] = [ROUND_5, ROUND_9, ROUND_15]

export function n3dsPenIndex(uiIndex: number): number {
  const position = uiIndex & 7

  return uiIndex >= 8 ? position + 9 : position
}

const randomTable = new Int32Array(55)
let randomFront = 31
let randomRear = 0

function seedN3dsRandom(value: number): void {
  let seed = value >>> 0

  for (let index = 54; index >= 0; index--) {
    randomTable[index] = seed + (seed >>> 16)
    seed = (Math.imul(seed, 0x10dcd) + 0x66d619e1) >>> 0
  }

  randomFront = 31
  randomRear = 0
}

seedN3dsRandom(Date.now() >>> 0)

export interface N3dsRandomState {
  table: Int32Array
  front: number
  rear: number
}

export function saveN3dsRandom(): N3dsRandomState {
  return { table: randomTable.slice(), front: randomFront, rear: randomRear }
}

export function loadN3dsRandom(state: N3dsRandomState): void {
  randomTable.set(state.table)
  randomFront = state.front
  randomRear = state.rear
}

function random(): number {
  const value = (randomTable[randomRear] + randomTable[randomFront]) | 0

  randomTable[randomRear] = value

  if (++randomFront === 55) randomFront = 0
  if (++randomRear === 55) randomRear = 0

  return value & 0x7fffffff
}

type PointCallback = (x: number, y: number) => void

function walkLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  visit: PointCallback,
): void {
  if (startX === endX && startY === endY) {
    visit(endX, endY)

    return
  }

  const deltaX = endX - startX
  const deltaY = endY - startY
  const stepsX = Math.abs(deltaX)
  const stepsY = Math.abs(deltaY)
  const signX = deltaX >= 0 ? 1 : -1
  const signY = deltaY >= 0 ? 1 : -1
  let x = startX
  let y = startY

  if (stepsX >= stepsY) {
    let error = -stepsY

    while (x !== endX) {
      x += signX
      error += stepsY * 2

      if (error > 0) {
        y += signY
        error -= stepsX * 2
      }

      visit(x, y)
    }
  } else {
    let error = -stepsX

    while (y !== endY) {
      y += signY
      error += stepsX * 2

      if (error > 0) {
        x += signX
        error -= stepsY * 2
      }

      visit(x, y)
    }
  }
}

function stampTip(tip: Tip, x: number, y: number, visit: PointCallback): void {
  const half = tip.size >> 1

  for (let row = 0; row < tip.size; row++) {
    for (let column = 0; column < tip.size; column++) {
      if (tip.bits[row * tip.size + column]) {
        visit(x + column - half, y + row - half)
      }
    }
  }
}

function half(value: number): number {
  return (value / 2) | 0
}

function perpendicular(
  vectorX: number,
  vectorY: number,
  deltaX: number,
  deltaY: number,
): [number, number] {
  const f = Math.fround
  const length = Math.trunc(f(deltaX * deltaX + deltaY * deltaY))

  if (!length) return [vectorX, vectorY]

  const dot = Math.trunc(f(vectorX * deltaX + vectorY * deltaY))

  return [
    f(vectorX - f(f(deltaX * dot) / length)),
    f(vectorY - f(f(deltaY * dot) / length)),
  ]
}

export class N3dsPen {
  private readonly surface: Surface
  private readonly kind: N3dsKind
  private readonly tipIndex: number

  private x = 0
  private y = 0

  private brushX = 0
  private brushY = 0
  private oneBackX = 0
  private oneBackY = 0
  private twoBackX = 0
  private twoBackY = 0
  private brushWidth = 2
  private brushFraction = 0
  private outlineX = 0
  private outlineY = 0

  constructor(surface: Surface, kind: N3dsKind, tipIndex: number) {
    this.surface = surface
    this.kind = kind
    this.tipIndex = tipIndex
  }

  begin(x: number, y: number): void {
    this.x = x
    this.y = y

    if (this.kind === N3dsKind.paint) {
      this.paintSegment(x, y, x, y)

      return
    }

    if (this.kind !== N3dsKind.pen) return

    if (this.tipIndex === PEN_BRUSH_SMALL) {
      this.brushX = x
      this.brushY = y
      this.oneBackX = this.twoBackX = x & ~1
      this.oneBackY = this.twoBackY = y & ~1
    } else if (this.tipIndex === PEN_BRUSH_LARGE) {
      this.brushWidth = 2
      this.brushFraction = 0
    } else if (this.tipIndex === PEN_OUTLINE_LARGE) {
      this.outlineX = x
      this.outlineY = y
      this.outlineLarge(x, y, x, y)
    }
  }

  step(x: number, y: number): void {
    this.segment(this.x, this.y, x, y)
    this.x = x
    this.y = y
  }

  point(x: number, y: number): void {
    this.x = x
    this.y = y
    this.segment(x, y, x, y)
  }

  private segment(ax: number, ay: number, bx: number, by: number): void {
    if (this.kind === N3dsKind.pen) this.penSegment(ax, ay, bx, by)
    else if (this.kind === N3dsKind.eraser) this.eraserSegment(ax, ay, bx, by)
    else this.paintSegment(ax, ay, bx, by)
  }

  private penSegment(ax: number, ay: number, bx: number, by: number): void {
    const surface = this.surface
    const penTip = PEN_TIPS[this.tipIndex]

    if (penTip) {
      walkLine(ax, ay, bx, by, (x, y) => {
        stampTip(penTip, x, y, (px, py) => surface.plot(px, py))
      })

      return
    }

    switch (this.tipIndex) {
      case PEN_BRUSH_SMALL:
        this.brushSmall(bx, by)
        break
      case PEN_OUTLINE_SMALL:
        this.outlineSmall(ax, ay, bx, by)
        break
      case PEN_DOTS_SMALL:
        this.dots(ax, ay, bx, by, DIAMOND_5)
        break
      case PEN_NOISE_SMALL:
        this.noise(ax, ay, bx, by, 5)
        break
      case PEN_SPRAY_SMALL:
        this.spray(ax, ay, bx, by, false)
        break
      case PEN_BRUSH_LARGE:
        this.brushLarge(ax, ay, bx, by)
        break
      case PEN_OUTLINE_LARGE:
        this.outlineLarge(ax, ay, bx, by)
        break
      case PEN_DOTS_LARGE:
        this.dots(ax, ay, bx, by, OCTAGON_15)
        break
      case PEN_NOISE_LARGE:
        this.noise(ax, ay, bx, by, 10)
        break
      case PEN_SPRAY_LARGE:
        this.spray(ax, ay, bx, by, true)
        break
    }
  }

  private eraserSegment(ax: number, ay: number, bx: number, by: number): void {
    const surface = this.surface
    const eraserTip = ERASER_TIPS[this.tipIndex & 7]
    const isPatterned = this.tipIndex >= 8

    walkLine(ax, ay, bx, by, (x, y) => {
      stampTip(eraserTip, x, y, (px, py) => {
        if (isPatterned) surface.erasePattern(px, py)
        else surface.erase(px, py)
      })
    })
  }

  private paintSegment(ax: number, ay: number, bx: number, by: number): void {
    const surface = this.surface
    const paintTip = PAINT_TIPS[this.tipIndex] ?? PAINT_TIPS[0]

    walkLine(ax, ay, bx, by, (x, y) => {
      stampTip(paintTip, x, y, (px, py) => surface.paint(px, py))
    })
  }

  private lineSquare(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    width: number,
  ): void {
    const surface = this.surface
    const low = width & 1 ? -(((width - 1) / 2) | 0) : 1 - ((width / 2) | 0)
    const high = width & 1 ? ((width - 1) / 2) | 0 : (width / 2) | 0

    walkLine(ax, ay, bx, by, (x, y) => {
      for (let offsetY = low; offsetY <= high; offsetY++) {
        for (let offsetX = low; offsetX <= high; offsetX++) {
          surface.plot(x + offsetX, y + offsetY)
        }
      }
    })
  }

  private plot2x2(x: number, y: number): void {
    const surface = this.surface

    surface.plot(x, y)
    surface.plot(x + 1, y)
    surface.plot(x, y + 1)
    surface.plot(x + 1, y + 1)
  }

  private brushSmall(targetX: number, targetY: number): void {
    let x = this.brushX & ~1
    let y = this.brushY & ~1
    let deltaX = targetX - x
    let deltaY = targetY - y

    if (deltaX & 1) deltaX += deltaX < 0 ? 1 : -1
    if (deltaY & 1) deltaY += deltaY < 0 ? 1 : -1

    const endX = x + deltaX
    const endY = y + deltaY

    if (x === endX && y === endY) {
      this.plot2x2(endX, endY)

      return
    }

    const stepsX = Math.abs(deltaX)
    const stepsY = Math.abs(deltaY)
    let error = 0

    for (;;) {
      if (x === endX && y === endY) {
        this.brushX = endX
        this.brushY = endY

        return
      }

      if (stepsX > stepsY) {
        error += stepsY

        if (stepsX <= error) {
          y += deltaY < 0 ? -2 : 2
          error -= stepsX
        }

        if (x !== endX) x += deltaX < 0 ? -2 : 2
      } else {
        error += stepsX

        if (stepsY <= error) {
          x += deltaX < 0 ? -2 : 2
          error -= stepsY
        }

        if (y !== endY) y += deltaY < 0 ? -2 : 2
      }

      this.plot2x2(x, y)
      this.plot2x2(half(this.twoBackX + x), half(this.twoBackY + y))
      this.twoBackX = this.oneBackX
      this.twoBackY = this.oneBackY
      this.plot2x2(half(x + this.oneBackX), half(y + this.oneBackY))
      this.oneBackX = x
      this.oneBackY = y
    }
  }

  private brushLarge(ax: number, ay: number, bx: number, by: number): void {
    const f = Math.fround
    const distance = Math.trunc(
      f((bx - ax) * (bx - ax) + (by - ay) * (by - ay)),
    )

    let width =
      distance < 1
        ? f(this.brushWidth + 1)
        : f(this.brushWidth - f(distance * f(0.02)))

    if (width > 7) width = 7
    if (width <= f(0.4)) width = f(0.4)

    this.brushWidth = width

    const total = f(width + this.brushFraction)
    const whole = Math.trunc(total)

    this.brushFraction = f(total - whole)
    this.lineSquare(ax, ay, bx, by, whole)
  }

  private outlineSmall(ax: number, ay: number, bx: number, by: number): void {
    const surface = this.surface
    const deltaX = bx - ax
    const deltaY = by - ay
    const stepsX = Math.abs(deltaX)
    const stepsY = Math.abs(deltaY)
    let x = ax
    let y = ay
    let error = 0
    let direction = 0

    const draw = (): void => {
      if ((direction & 2) === 0) {
        surface.plot(x + 1, y)
        surface.plot(x - 1, y)
      } else {
        surface.plot(x, y - 1)
        surface.plot(x, y + 1)
      }

      surface.erase(x, y)

      switch (direction & 3) {
        case 0:
          surface.plot(x, y - 1)
          break
        case 1:
          surface.plot(x, y + 1)
          break
        case 2:
          surface.plot(x - 1, y)
          break
        default:
          surface.plot(x + 1, y)
      }
    }

    while (x !== bx || y !== by) {
      if (stepsX > stepsY) {
        error += stepsY

        if (error >= stepsX) {
          error -= stepsX
          y += deltaY < 0 ? -1 : 1
          direction = deltaY < 0 ? 0 : 1
        }

        if (x !== bx) {
          x += deltaX < 0 ? -1 : 1
          direction = deltaX < 0 ? 2 : 3
        }
      } else {
        error += stepsX

        if (error >= stepsY) {
          error -= stepsY
          x += deltaX < 0 ? -1 : 1
          direction = deltaX < 0 ? 6 : 7
        }

        if (y !== by) {
          y += deltaY < 0 ? -1 : 1
          direction = deltaY < 0 ? 4 : 5
        }
      }

      draw()
    }

    draw()
  }

  private outlineLarge(ax: number, ay: number, bx: number, by: number): void {
    const surface = this.surface

    walkLine(ax, ay, bx, by, (x, y) => {
      stampTip(ROUND_7, x, y, (px, py) => surface.plot(px, py))
      stampTip(DIAMOND_5, this.outlineX, this.outlineY, (px, py) => {
        surface.erase(px, py)
      })
      this.outlineX = x
      this.outlineY = y
    })
  }

  private dots(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    dotTip: Tip,
  ): void {
    const surface = this.surface
    const offset = dotTip.size >> 1
    const length = Math.trunc(Math.abs(bx - ax) + Math.abs(by - ay) + 1)
    const scale = length << 6

    walkLine(ax, ay, bx, by, (x, y) => {
      let index = 0

      for (let row = 0; row < dotTip.size; row++) {
        for (let column = 0; column < dotTip.size; column++, index++) {
          if (random() % scale <= length && dotTip.bits[index]) {
            surface.plot(x - offset + column, y - offset + row)
          }
        }
      }
    })
  }

  private noise(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    range: number,
  ): void {
    const center = ((range - 1) / 2) | 0
    const startX = random() % range
    const startY = random() % range
    const endX = random() % range
    const endY = random() % range

    this.lineSquare(
      ax + startX - center,
      ay + startY - center,
      bx + endX - center,
      by + endY - center,
      1,
    )
  }

  private spray(
    ax: number,
    ay: number,
    bx: number,
    by: number,
    isLarge: boolean,
  ): void {
    const f = Math.fround
    const deltaX = bx - ax
    const deltaY = by - ay
    const distance = Math.trunc(f(deltaX * deltaX + deltaY * deltaY))

    let spread = 1

    if (distance < 4) spread = 6
    else if (distance < 8) spread = 5
    else if (distance < 12) spread = 4
    else if (distance < 24) spread = 3
    else if (distance < 48) spread = 2

    let radius = spread * spread
    let count = 16 - spread

    if (isLarge) {
      count *= 4
      radius *= 2
    }

    for (let index = 0; index < count; index++) {
      let offsetX = Math.trunc(Math.sqrt(random() % (radius + 1)))
      let offsetY = Math.trunc(Math.sqrt(random() % (radius + 1)))

      if (offsetX > 0) offsetX--
      if (offsetY > 0) offsetY--
      if (random() & 1) offsetX = -offsetX
      if (random() & 1) offsetY = -offsetY

      const jitterX = (random() % 3) - 1
      const jitterY = (random() % 3) - 1
      const vector = perpendicular(offsetX, offsetY, deltaX, deltaY)
      const jitter = perpendicular(jitterX, jitterY, deltaX, deltaY)

      this.lineSquare(
        Math.trunc(f(ax + vector[0])),
        Math.trunc(f(ay + vector[1])),
        Math.trunc(f(bx + f(vector[0] + jitter[0]))),
        Math.trunc(f(by + f(vector[1] + jitter[1]))),
        1,
      )
    }
  }

  taper(ax: number, ay: number, bx: number, by: number): void {
    const f = Math.fround
    const deltaX = f(bx - ax)
    const deltaY = f(by - ay)
    const distance = f(Math.sqrt(f(f(deltaX * deltaX) + f(deltaY * deltaY))))

    this.brushFraction = 0

    if (!(distance > 0)) return

    const inverse = f(1 / distance)
    const unitX = f(deltaX * inverse)
    const unitY = f(deltaY * inverse)
    let x = f(ax)
    let y = f(ay)
    let nextX = f(x + unitX)
    let nextY = f(y + unitY)

    for (let index = 0; index < distance; index++) {
      this.brushWidth = f(7 - f(f(index / distance) * 6))
      this.brushLarge(
        Math.trunc(x),
        Math.trunc(y),
        Math.trunc(nextX),
        Math.trunc(nextY),
      )
      x = nextX
      y = nextY
      nextX = f(x + unitX)
      nextY = f(y + unitY)
    }
  }

  get isBrushLarge(): boolean {
    return this.kind === N3dsKind.pen && this.tipIndex === PEN_BRUSH_LARGE
  }

  get repeatsPoints(): boolean {
    return this.isBrushLarge
  }
}
