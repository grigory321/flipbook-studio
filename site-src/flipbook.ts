import type { Draw } from './art.ts'

interface Point {
  x: number
  y: number
}

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Fade {
  from: number
  to: number
}

const SLANT = 1.05
const SHADE = 0.16
const STACK = 3

function clip(polygon: Point[], origin: Point, normal: Point): Point[] {
  const side = (point: Point): number =>
    (point.x - origin.x) * normal.x + (point.y - origin.y) * normal.y
  const out: Point[] = []

  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const a = side(point)
    const b = side(next)

    if (a >= 0) out.push(point)

    if (a >= 0 !== b >= 0) {
      const t = a / (a - b)

      out.push({
        x: point.x + (next.x - point.x) * t,
        y: point.y + (next.y - point.y) * t,
      })
    }
  })

  return out
}

function trace(context: CanvasRenderingContext2D, points: Point[]): void {
  context.beginPath()
  points.forEach((point, index) =>
    index === 0
      ? context.moveTo(point.x, point.y)
      : context.lineTo(point.x, point.y),
  )
  context.closePath()
}

export class Flipbook {
  readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly cache = new Map<number, HTMLCanvasElement>()
  private width = 0
  private height = 0
  private ratio = 1
  private origin: Point = { x: 0, y: 0 }
  private readonly host: HTMLElement
  private readonly pageAt: (index: number) => Draw
  private readonly margins: Margins
  private readonly back: string
  private readonly fadeRange: Fade

  constructor(
    host: HTMLElement,
    pageAt: (index: number) => Draw,
    margins: Margins,
    fade: Fade = { from: 0.62, to: 1 },
    back = '#f3efe6',
  ) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) throw new Error('canvas')

    canvas.className = 'flip-canvas'
    canvas.setAttribute('aria-hidden', 'true')
    host.append(canvas)
    this.canvas = canvas
    this.context = context
    this.host = host
    this.pageAt = pageAt
    this.margins = margins
    this.back = back
    this.fadeRange = fade
  }

  get pageWidth(): number {
    return this.width
  }

  get pageHeight(): number {
    return this.height
  }

  resize(): boolean {
    const width = this.host.clientWidth
    const height = this.host.clientHeight
    const ratio = Math.min(2, window.devicePixelRatio || 1)

    if (
      width === this.width &&
      height === this.height &&
      ratio === this.ratio
    ) {
      return false
    }

    const { top, right, bottom, left } = this.margins
    const full = {
      width: width * (1 + left + right),
      height: height * (1 + top + bottom),
    }

    this.width = width
    this.height = height
    this.ratio = ratio
    this.origin = { x: width * left, y: height * top }
    this.canvas.width = Math.round(full.width * ratio)
    this.canvas.height = Math.round(full.height * ratio)
    this.canvas.style.width = `${full.width}px`
    this.canvas.style.height = `${full.height}px`
    this.canvas.style.left = `${-this.origin.x}px`
    this.canvas.style.top = `${-this.origin.y}px`
    this.cache.clear()

    return true
  }

  invalidate(index?: number): void {
    if (index === undefined) this.cache.clear()
    else this.cache.delete(index)
  }

  private page(index: number): HTMLCanvasElement {
    let bitmap = this.cache.get(index)

    if (!bitmap) {
      bitmap = document.createElement('canvas')
      bitmap.width = Math.round(this.width * this.ratio)
      bitmap.height = Math.round(this.height * this.ratio)

      const context = bitmap.getContext('2d')

      if (context) {
        context.scale(this.ratio, this.ratio)
        this.pageAt(index)(context, this.width, this.height)
      }

      this.cache.set(index, bitmap)

      if (this.cache.size > 48) {
        const oldest = this.cache.keys().next().value

        if (oldest !== undefined && oldest !== index) this.cache.delete(oldest)
      }
    }

    return bitmap
  }

  private stack(context: CanvasRenderingContext2D): void {
    const { width, height } = this

    for (let layer = STACK; layer >= 1; layer--) {
      const inset = layer * 0.6
      const y = layer * 2.6

      context.fillStyle = '#ddd6cb'
      context.fillRect(inset - 0.6, y + 0.6, width - inset * 2 + 1.2, height)
      context.fillStyle = layer % 2 === 0 ? '#f6f2eb' : '#fffdf8'
      context.fillRect(inset, y, width - inset * 2, height)
    }

    context.fillStyle = 'rgb(80 55 25 / 16%)'
    context.fillRect(-0.6, -0.6, width + 1.2, height + 1.2)
  }

  draw(from: number, to: number | null, progress: number, live?: Draw): void {
    const context = this.context
    const { width, height, ratio } = this
    const t = Math.min(1, Math.max(0, progress))

    if (!width || !height) return

    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    context.setTransform(
      ratio,
      0,
      0,
      ratio,
      this.origin.x * ratio,
      this.origin.y * ratio,
    )
    this.stack(context)

    const front = (): void => {
      if (live) live(context, width, height)
      else context.drawImage(this.page(from), 0, 0, width, height)
    }

    if (to === null || t <= 0) {
      front()

      return
    }

    context.drawImage(this.page(to), 0, 0, width, height)

    const rightY = height * (1 - t)
    const leftY = rightY + height * SLANT * (1 - t)
    const along = { x: -width, y: leftY - rightY }
    const length = Math.hypot(along.x, along.y)
    const direction = { x: along.x / length, y: along.y / length }
    const lifted = { x: direction.y, y: -direction.x }
    const hinge = { x: width, y: rightY }
    const sheet = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ]
    const kept = clip(sheet, hinge, { x: -lifted.x, y: -lifted.y })
    const flap = clip(sheet, hinge, lifted)

    if (kept.length > 2) {
      context.save()
      trace(context, kept)
      context.clip()
      front()
      context.restore()
    }

    if (flap.length < 3) return

    const a = direction.x * direction.x - direction.y * direction.y
    const b = 2 * direction.x * direction.y
    const mirror = (point: Point): Point => {
      const x = point.x - hinge.x
      const y = point.y - hinge.y

      return {
        x: hinge.x + a * x + b * y,
        y: hinge.y + b * x - a * y,
      }
    }
    const { from: fadeFrom, to: fadeTo } = this.fadeRange
    const fade = Math.min(1, Math.max(0, (fadeTo - t) / (fadeTo - fadeFrom)))
    const reach = Math.max(
      ...flap.map(
        point =>
          (point.x - hinge.x) * lifted.x + (point.y - hinge.y) * lifted.y,
      ),
    )

    context.save()
    trace(context, flap)
    context.clip()

    const shade = context.createLinearGradient(
      hinge.x,
      hinge.y,
      hinge.x + lifted.x * reach * 0.5,
      hinge.y + lifted.y * reach * 0.5,
    )

    shade.addColorStop(0, `rgb(60 40 20 / ${SHADE * fade})`)
    shade.addColorStop(1, 'rgb(60 40 20 / 0%)')
    context.fillStyle = shade
    context.fillRect(-width, -height, width * 3, height * 3)
    context.restore()

    const mirrored = flap.map(mirror)

    context.save()
    context.globalAlpha = fade
    trace(context, mirrored)
    context.clip()
    context.fillStyle = this.back
    context.fillRect(-width, -height * 2, width * 3, height * 4)
    context.transform(
      a,
      b,
      b,
      -a,
      hinge.x - a * hinge.x - b * hinge.y,
      hinge.y - b * hinge.x + a * hinge.y,
    )
    context.globalAlpha = fade * 0.12
    context.drawImage(this.page(from), 0, 0, width, height)
    context.restore()

    context.save()
    context.globalAlpha = fade
    trace(context, mirrored)
    context.clip()

    const curve = context.createLinearGradient(
      hinge.x,
      hinge.y,
      hinge.x - lifted.x * reach,
      hinge.y - lifted.y * reach,
    )

    curve.addColorStop(0, 'rgb(255 255 255 / 0%)')
    curve.addColorStop(0.08, 'rgb(255 255 255 / 55%)')
    curve.addColorStop(0.45, 'rgb(120 90 50 / 0%)')
    curve.addColorStop(1, 'rgb(120 90 50 / 10%)')
    context.fillStyle = curve
    context.fillRect(-width, -height * 2, width * 3, height * 4)
    context.restore()

    context.save()
    context.globalAlpha = fade
    trace(context, mirrored)
    context.lineWidth = 1
    context.strokeStyle = 'rgb(80 55 25 / 22%)'
    context.stroke()
    context.restore()
  }
}

export function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}
