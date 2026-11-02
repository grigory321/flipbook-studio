import { COVERAGE_FULL } from '../core/ink.ts'
import type { Surface } from '../core/surface.ts'

export type FreeStyle =
  | 'round'
  | 'square'
  | 'brush'
  | 'pencil'
  | 'spray'
  | 'marker'
  | 'crayon'
  | 'chalk'
  | 'nib'
  | 'dots'
  | 'splatter'
  | 'ribbon'
  | 'inkpen'
  | 'felt'
  | 'colorPencil'
  | 'charcoal'
  | 'pastel'
  | 'watercolor'
  | 'airbrush'
  | 'highlighter'
  | 'neon'
  | 'stipple'
  | 'stars'
  | 'hearts'

export type FreeAction = 'draw' | 'paint' | 'erase'

export interface FreePenOptions {
  isSmooth?: boolean
  cleansCorners?: boolean
  isStraight?: boolean
  usesPressure?: boolean
  erasesPattern?: boolean
}

type TipShape = (x: number, y: number, radius: number) => number

interface Tip {
  shape: TipShape
  extent: number
}

interface Brush {
  tip: Tip
  spacing: number
  flow: number
  builds?: boolean
  width?: number
  pressure?: number
  speed?: number
  tapers?: boolean
  jitter?: number
  grain?: (x: number, y: number) => number
  particles?: number
  bristles?: number
  dithers?: boolean
}

const TURN = Math.PI * 2
const PRESSURE_EASE = 0.5
const SPEED_EASE = 0.3
const NEUTRAL_PRESSURE = 0.5
const DEFAULT_PRESSURE = 0.9
const PRESSURE_SPAN = 1.5
const PRESSURE_MIN = 0.12
const FULL_SPEED = 26
const TAPER_REACH = 2.4
const TAPER_START = 0.3
const NIB_TILT = -Math.PI / 4
const STICK_THRESHOLD = 0.5

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function hashNoise(x: number, y: number): number {
  const mixed = Math.imul(x, 0x9e3775) ^ Math.imul(y, 0x85ebca6b)
  const shifted = Math.imul(mixed ^ (mixed >>> 13), 0xc2b2ae35)

  return ((shifted ^ (shifted >>> 16)) >>> 0) / 0x100000000
}

function valueNoise(x: number, y: number): number {
  const left = Math.floor(x)
  const top = Math.floor(y)
  const blendX = x - left
  const blendY = y - top
  const easeX = blendX * blendX * (3 - 2 * blendX)
  const easeY = blendY * blendY * (3 - 2 * blendY)
  const upper =
    hashNoise(left, top) * (1 - easeX) + hashNoise(left + 1, top) * easeX
  const lower =
    hashNoise(left, top + 1) * (1 - easeX) +
    hashNoise(left + 1, top + 1) * easeX

  return upper * (1 - easeY) + lower * easeY
}

function paperGrain(scale: number, keep: number, softness = 0.16) {
  return (x: number, y: number): number =>
    clamp01((keep - valueNoise(x / scale, y / scale)) / softness + 0.5)
}

function pencilStreak(x: number, y: number): number {
  const along = valueNoise((x + y) / 7, (x - y) / 1.4)

  return clamp01((0.6 - along) / 0.2 + 0.5)
}

function washGrain(x: number, y: number): number {
  return 0.55 + 0.45 * valueNoise(x / 9, y / 9)
}

const discShape: TipShape = (x, y, radius) =>
  clamp01(radius + 0.5 - Math.sqrt(x * x + y * y))

const squareShape: TipShape = (x, y, radius) =>
  Math.min(
    clamp01(radius + 0.5 - Math.abs(x)),
    clamp01(radius + 0.5 - Math.abs(y)),
  )

const hardDisc: Tip = { shape: discShape, extent: 1 }

const softDisc: Tip = {
  shape: (x, y, radius) => {
    const ratio = (x * x + y * y) / (radius * radius)

    return ratio >= 1 ? 0 : (1 - ratio) * (1 - ratio)
  },
  extent: 1,
}

const roughDisc: Tip = {
  shape: (x, y, radius) =>
    clamp01((radius - Math.sqrt(x * x + y * y)) / (radius * 0.45 + 0.5) + 0.3),
  extent: 1.14,
}

const squareTip: Tip = { shape: squareShape, extent: 1 }

function ovalTip(wide: number, thin: number, tilt: number): Tip {
  const cos = Math.cos(tilt)
  const sin = Math.sin(tilt)

  return {
    shape: (x, y, radius) =>
      discShape((x * cos + y * sin) / wide, (y * cos - x * sin) / thin, radius),
    extent: Math.max(wide, thin),
  }
}

function barTip(wide: number, thin: number): Tip {
  return {
    shape: (x, y, radius) => squareShape(x / wide, y / thin, radius),
    extent: Math.max(wide, thin),
  }
}

const neonTip: Tip = {
  shape: (x, y, radius) => {
    const distance = Math.sqrt(x * x + y * y)
    const glow = distance >= radius ? 0 : (1 - distance / radius) ** 2

    return Math.max(clamp01(radius * 0.34 + 0.5 - distance), glow * 0.6)
  },
  extent: 1,
}

const starTip: Tip = {
  shape: (x, y, radius) => {
    const reach = Math.sqrt(Math.abs(x)) + Math.sqrt(Math.abs(y))

    return clamp01((Math.sqrt(radius) - reach) * 2.5 + 0.5)
  },
  extent: 1.25,
}

const heartTip: Tip = {
  shape: (x, y, radius) => {
    const unitX = x / (radius * 0.86)
    const unitY = -y / (radius * 0.86) + 0.15
    const shell = unitX * unitX + unitY * unitY - 1
    const value = shell ** 3 - unitX * unitX * unitY ** 3

    return clamp01(0.5 - value * radius * 0.4)
  },
  extent: 1.3,
}

const BRUSHES: Readonly<Record<FreeStyle, Brush>> = {
  round: { tip: hardDisc, spacing: 0.12, flow: 1 },
  square: { tip: squareTip, spacing: 0.12, flow: 1 },
  inkpen: {
    tip: hardDisc,
    spacing: 0.08,
    flow: 1,
    pressure: 1,
    speed: 0.55,
    tapers: true,
  },
  felt: { tip: roughDisc, spacing: 0.1, flow: 0.95, width: 1.05 },
  brush: {
    tip: hardDisc,
    spacing: 0.08,
    flow: 1,
    width: 1.4,
    pressure: 1.1,
    speed: 0.5,
    tapers: true,
    bristles: 9,
  },
  nib: {
    tip: ovalTip(1, 0.3, NIB_TILT),
    spacing: 0.06,
    flow: 1,
    width: 1.3,
    pressure: 1,
    tapers: true,
  },
  ribbon: { tip: ovalTip(2.1, 0.55, 0), spacing: 0.08, flow: 1 },
  marker: {
    tip: ovalTip(1.5, 0.6, 0),
    spacing: 0.08,
    flow: 0.86,
    width: 1.2,
  },
  highlighter: {
    tip: barTip(1.5, 0.6),
    spacing: 0.08,
    flow: 0.44,
    width: 1.5,
    pressure: 0,
  },
  pencil: {
    tip: roughDisc,
    spacing: 0.1,
    flow: 0.42,
    builds: true,
    grain: paperGrain(1.2, 0.56),
    dithers: true,
  },
  colorPencil: {
    tip: roughDisc,
    spacing: 0.1,
    flow: 0.5,
    builds: true,
    width: 1.2,
    grain: pencilStreak,
    dithers: true,
  },
  crayon: {
    tip: roughDisc,
    spacing: 0.1,
    flow: 0.92,
    width: 1.3,
    grain: paperGrain(1.6, 0.66, 0.26),
    dithers: true,
  },
  chalk: {
    tip: roughDisc,
    spacing: 0.1,
    flow: 0.66,
    builds: true,
    width: 1.4,
    jitter: 0.1,
    grain: paperGrain(1.25, 0.54, 0.28),
    dithers: true,
  },
  charcoal: {
    tip: roughDisc,
    spacing: 0.09,
    flow: 0.48,
    builds: true,
    width: 1.5,
    jitter: 0.16,
    grain: paperGrain(1.5, 0.56, 0.3),
    dithers: true,
  },
  pastel: {
    tip: softDisc,
    spacing: 0.08,
    flow: 0.2,
    builds: true,
    width: 2,
    grain: paperGrain(2.4, 0.72, 0.3),
    dithers: true,
  },
  watercolor: {
    tip: softDisc,
    spacing: 0.1,
    flow: 0.1,
    builds: true,
    width: 2.4,
    grain: washGrain,
    dithers: true,
  },
  airbrush: {
    tip: softDisc,
    spacing: 0.12,
    flow: 0.09,
    builds: true,
    width: 3,
    dithers: true,
  },
  spray: {
    tip: hardDisc,
    spacing: 0.3,
    flow: 0.9,
    width: 3,
    pressure: 0.5,
    particles: 7,
  },
  stipple: {
    tip: hardDisc,
    spacing: 0.5,
    flow: 1,
    width: 2.6,
    pressure: 0.5,
    particles: 3,
  },
  splatter: {
    tip: hardDisc,
    spacing: 0.7,
    flow: 1,
    width: 6,
    pressure: 0.5,
    particles: 6,
  },
  dots: { tip: hardDisc, spacing: 1.5, flow: 1, width: 1.4 },
  neon: {
    tip: neonTip,
    spacing: 0.1,
    flow: 1,
    width: 2.6,
    dithers: true,
  },
  stars: {
    tip: starTip,
    spacing: 1.7,
    flow: 1,
    width: 2.2,
    jitter: 0.4,
    pressure: 0.5,
  },
  hearts: {
    tip: heartTip,
    spacing: 1.8,
    flow: 1,
    width: 2.2,
    jitter: 0.3,
    pressure: 0.5,
  },
}

export class FreePen {
  private readonly surface: Surface
  private readonly action: FreeAction
  private readonly brush: Brush
  private readonly size: number
  private readonly isSmooth: boolean
  private readonly isStraight: boolean
  private readonly usesPressure: boolean
  private readonly cleansCorners: boolean
  private readonly erasesPattern: boolean

  private x = 0
  private y = 0
  private pressure = NEUTRAL_PRESSURE
  private speed = 0
  private seed = 1
  private walked = 0
  private nextDab = 0
  private curveX = 0
  private curveY = 0
  private angle = 0
  private bristles: readonly (readonly [number, number])[] = []
  private doneX = 0
  private doneY = 0
  private waitingX = 0
  private waitingY = 0
  private isWaiting = false

  constructor(
    surface: Surface,
    style: FreeStyle,
    action: FreeAction,
    size: number,
    options: FreePenOptions = {},
  ) {
    this.surface = surface
    this.action = action
    this.brush = BRUSHES[style]
    this.size = Math.max(1, size)
    this.isSmooth = options.isSmooth ?? false
    this.isStraight = options.isStraight ?? false
    this.usesPressure = options.usesPressure ?? true
    this.erasesPattern = (options.erasesPattern ?? false) && action === 'erase'
    this.cleansCorners =
      (options.cleansCorners ?? false) &&
      !this.isSmooth &&
      this.size === 1 &&
      action !== 'erase'
  }

  begin(x: number, y: number, pressure: number): void {
    this.x = this.curveX = x
    this.y = this.curveY = y
    this.pressure = this.usesPressure ? pressure : NEUTRAL_PRESSURE
    this.speed = 0
    this.seed = (Math.round(x) * 31 + Math.round(y) * 17 + 1) >>> 0
    this.walked = 0
    this.nextDab = 0
    this.prepareBristles()

    if (this.cleansCorners) {
      this.doneX = Math.round(x)
      this.doneY = Math.round(y)
      this.isWaiting = false
      this.touch(this.doneX, this.doneY, 1)

      return
    }

    this.dab(x, y)
  }

  private prepareBristles(): void {
    const count = this.brush.bristles ?? 0
    const bristles: [number, number][] = []

    for (let index = 0; index < count; index++) {
      const across = (index + 0.5) / count - 0.5

      bristles.push([across * 1.7, 0.3 + this.random() * 0.34])
    }

    this.bristles = bristles
  }

  move(x: number, y: number, pressure: number): void {
    const distance = Math.hypot(x - this.x, y - this.y)
    const target = this.usesPressure ? pressure : NEUTRAL_PRESSURE

    this.pressure += (target - this.pressure) * PRESSURE_EASE
    this.speed += (distance / FULL_SPEED - this.speed) * SPEED_EASE

    if (distance === 0) return

    if (this.cleansCorners) this.walkClean(x, y)
    else if (this.isStraight) this.walkLine(this.x, this.y, x, y)
    else {
      const middleX = (this.x + x) / 2
      const middleY = (this.y + y) / 2

      this.walkCurve(this.x, this.y, middleX, middleY)
    }

    this.x = x
    this.y = y
  }

  end(): void {
    if (this.isWaiting) this.touch(this.waitingX, this.waitingY, 1)

    this.isWaiting = false

    if (!this.cleansCorners && !this.isStraight) {
      this.walkLine(this.curveX, this.curveY, this.x, this.y)
    }
  }

  private walkClean(x: number, y: number): void {
    const steps = Math.max(Math.abs(x - this.x), Math.abs(y - this.y))

    for (let step = 1; step <= steps; step++) {
      this.pushCleanPoint(
        Math.round(this.x + ((x - this.x) * step) / steps),
        Math.round(this.y + ((y - this.y) * step) / steps),
      )
    }
  }

  private pushCleanPoint(x: number, y: number): void {
    if (this.isWaiting && x === this.waitingX && y === this.waitingY) return

    const isNextToDone =
      Math.abs(x - this.doneX) <= 1 && Math.abs(y - this.doneY) <= 1

    if (this.isWaiting && !isNextToDone) {
      this.touch(this.waitingX, this.waitingY, 1)
      this.doneX = this.waitingX
      this.doneY = this.waitingY
    }

    this.waitingX = x
    this.waitingY = y
    this.isWaiting = true
  }

  private walkCurve(
    controlX: number,
    controlY: number,
    endX: number,
    endY: number,
  ): void {
    const startX = this.curveX
    const startY = this.curveY
    const reach =
      Math.hypot(controlX - startX, controlY - startY) +
      Math.hypot(endX - controlX, endY - controlY)
    const steps = Math.max(1, Math.ceil(reach))
    let lastX = startX
    let lastY = startY

    for (let step = 1; step <= steps; step++) {
      const ratio = step / steps
      const inverse = 1 - ratio
      const pointX =
        inverse * inverse * startX +
        2 * inverse * ratio * controlX +
        ratio * ratio * endX
      const pointY =
        inverse * inverse * startY +
        2 * inverse * ratio * controlY +
        ratio * ratio * endY

      this.walkLine(lastX, lastY, pointX, pointY)
      lastX = pointX
      lastY = pointY
    }

    this.curveX = endX
    this.curveY = endY
  }

  private walkLine(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    const length = Math.hypot(toX - fromX, toY - fromY)

    if (length === 0) return

    this.angle = Math.atan2(toY - fromY, toX - fromX)

    let position = this.nextDab

    while (position <= length) {
      const ratio = position / length

      this.dab(fromX + (toX - fromX) * ratio, fromY + (toY - fromY) * ratio)
      position += this.dabGap()
    }

    this.nextDab = position - length
    this.walked += length
    this.curveX = toX
    this.curveY = toY
  }

  private dabGap(): number {
    return Math.max(0.5, this.currentRadius() * 2 * this.brush.spacing)
  }

  private currentRadius(): number {
    const { brush, pressure, speed } = this
    const sensitivity = brush.pressure ?? DEFAULT_PRESSURE
    const force = Math.max(
      PRESSURE_MIN,
      1 + sensitivity * (pressure - NEUTRAL_PRESSURE) * PRESSURE_SPAN,
    )
    const pace = 1 - (brush.speed ?? 0) * clamp01(speed)
    const start = brush.tapers
      ? Math.min(
          1,
          TAPER_START +
            (1 - TAPER_START) * (this.walked / (this.size * TAPER_REACH)),
        )
      : 1

    return Math.max(
      0.5,
      ((this.size * (brush.width ?? 1)) / 2) * force * pace * start,
    )
  }

  private random(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0

    return this.seed / 0x100000000
  }

  private dab(x: number, y: number): void {
    const { brush } = this
    const radius = this.currentRadius()

    if (brush.particles) {
      this.scatter(x, y, radius, brush.particles)

      return
    }

    if (brush.bristles) {
      this.pressBristles(x, y, radius)

      return
    }

    const jitter = (brush.jitter ?? 0) * radius
    const centerX = x + (this.random() - 0.5) * 2 * jitter
    const centerY = y + (this.random() - 0.5) * 2 * jitter

    this.press(centerX, centerY, radius, brush.tip, brush.flow)
  }

  private pressBristles(x: number, y: number, radius: number): void {
    const normalX = -Math.sin(this.angle)
    const normalY = Math.cos(this.angle)

    for (const [across, thickness] of this.bristles) {
      this.press(
        x + normalX * across * radius,
        y + normalY * across * radius,
        Math.max(0.5, radius * thickness),
        hardDisc,
        this.brush.flow,
      )
    }
  }

  private scatter(x: number, y: number, radius: number, count: number): void {
    for (let index = 0; index < count; index++) {
      const angle = this.random() * TURN
      const distance = Math.sqrt(this.random()) * radius
      const drop = 0.5 + this.random() * Math.max(0.3, this.size / 7)

      this.press(
        x + Math.cos(angle) * distance,
        y + Math.sin(angle) * distance,
        drop,
        hardDisc,
        this.brush.flow,
      )
    }
  }

  private press(
    centerX: number,
    centerY: number,
    radius: number,
    tip: Tip,
    flow: number,
  ): void {
    const { grain } = this.brush
    const reach = Math.ceil(radius * tip.extent) + 1
    const left = Math.floor(centerX) - reach
    const top = Math.floor(centerY) - reach
    const right = Math.ceil(centerX) + reach
    const bottom = Math.ceil(centerY) + reach

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const shape = tip.shape(x + 0.5 - centerX, y + 0.5 - centerY, radius)

        if (shape <= 0) continue

        const amount = shape * flow * (grain ? grain(x, y) : 1)

        if (amount > 0) this.touch(x, y, amount)
      }
    }
  }

  private touch(x: number, y: number, amount: number): void {
    if (this.erasesPattern && !this.surface.patternAt(x, y)) return

    if (this.isSmooth && this.action !== 'paint') {
      const coverage = Math.min(
        COVERAGE_FULL,
        Math.floor(amount * COVERAGE_FULL + this.random()),
      )

      if (coverage === 0) return

      if (this.action === 'erase') this.surface.uncover(x, y, coverage)
      else this.surface.cover(x, y, coverage, this.brush.builds ?? false)

      return
    }

    const threshold = this.brush.dithers
      ? hashNoise(x, y) * 0.9 + 0.05
      : STICK_THRESHOLD * this.brush.flow

    if (amount < threshold) return

    if (this.action === 'erase') this.surface.rub(x, y)
    else if (this.action === 'paint') this.surface.paint(x, y)
    else this.surface.plot(x, y)
  }
}
