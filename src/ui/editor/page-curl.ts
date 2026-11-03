import type { PaperStyle } from '../../core/note.ts'
import { h } from '../dom.ts'

const STRIPS = 14
const LEAD = 0.7
const MAX_ANGLE = 178
const TURN_MS = 520
const SHADE = 0.1
const BOUNCE = 0.03
const BOUNCE_FROM = 0.8
const FADE = 0.3
const CORNER = 0.3
const SLANT = 1
const SLANT_CURVE = 3
const SEAM = 1

export type CurlDirection = 'forward' | 'back'

type Point = readonly [number, number]

interface Box {
  left: number
  top: number
  width: number
  height: number
}

interface Strip {
  element: HTMLElement
  face: HTMLCanvasElement
  back: HTMLElement
  shade: HTMLElement
  axis: string
  box: Box
}

function liftAndSwing(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function fallWithBounce(t: number): number {
  const fall = Math.max(0, 1 - Math.min(1, t / BOUNCE_FROM)) ** 3
  const bounce = Math.max(0, (t - BOUNCE_FROM) / (1 - BOUNCE_FROM))

  return fall + BOUNCE * Math.sin(Math.PI * bounce)
}

function hingeAt(index: number, height: number): Point {
  if (index >= STRIPS) return [height * 10, height * 10]

  const t = index / (STRIPS - 1)
  const right = t * (1 - CORNER)

  return [height * (right + SLANT * t ** SLANT_CURVE), height * right]
}

function clipToPage(
  polygon: readonly Point[],
  width: number,
  height: number,
): Point[] {
  const sides: [(point: Point) => number, number][] = [
    [point => point[0], 0],
    [point => -point[0], -width],
    [point => point[1], 0],
    [point => -point[1], -height],
  ]
  let points: Point[] = [...polygon]

  for (const [measure, limit] of sides) {
    const kept: Point[] = []

    for (const [index, point] of points.entries()) {
      const previous = points[(index + points.length - 1) % points.length]

      if (!previous) continue

      const inside = measure(point) >= limit
      const wasInside = measure(previous) >= limit

      if (inside !== wasInside) {
        const share =
          (limit - measure(previous)) / (measure(point) - measure(previous))

        kept.push([
          previous[0] + (point[0] - previous[0]) * share,
          previous[1] + (point[1] - previous[1]) * share,
        ])
      }

      if (inside) kept.push(point)
    }

    points = kept
  }

  return points
}

function boxAround(points: readonly Point[]): Box {
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const left = Math.floor(Math.min(...xs))
  const top = Math.floor(Math.min(...ys))

  return {
    left,
    top,
    width: Math.max(1, Math.ceil(Math.max(...xs)) - left),
    height: Math.max(1, Math.ceil(Math.max(...ys)) - top),
  }
}

function clipPath(
  points: readonly Point[],
  box: Box,
  isMirrored = false,
): string {
  const corners = points.map(([x, y]) => {
    const local = x - box.left

    return `${isMirrored ? box.width - local : local}px ${y - box.top}px`
  })

  return `polygon(${corners.join(',')})`
}

function place(element: HTMLElement, box: Box): void {
  element.style.left = `${box.left}px`
  element.style.top = `${box.top}px`
  element.style.width = `${box.width}px`
  element.style.height = `${box.height}px`
}

export class PageCurl {
  readonly element = h('div', { class: 'page-curl', hidden: true })

  private readonly strips: Strip[] = []
  private frame = 0
  private onEnd: (() => void) | null = null

  constructor(width: number, height: number) {
    let parent: HTMLElement = this.element

    for (let index = 0; index < STRIPS; index++) {
      const [left, right] = hingeAt(index, height)
      const [nextLeft, nextRight] = hingeAt(index + 1, height)
      const area = clipToPage(
        [
          [0, left],
          [width, right],
          [width, nextRight],
          [0, nextLeft],
        ],
        width,
        height,
      )
      const overlap = clipToPage(
        [
          [0, left],
          [width, right],
          [width, nextRight + SEAM],
          [0, nextLeft + SEAM],
        ],
        width,
        height,
      )
      const box = boxAround(overlap)
      const face = h('canvas', {
        class: 'curl-face',
        width: box.width,
        height: box.height,
      })
      const back = h('div', { class: 'curl-back' })
      const shade = h('div', { class: 'curl-shade' })
      const element = h('div', { class: 'curl-strip' }, face, back, shade)

      for (const leaf of [face, back, shade]) {
        place(leaf, box)
        leaf.style.setProperty('--strip-x', `${-box.left}px`)
        leaf.style.setProperty('--strip-y', `${-box.top}px`)
      }

      face.style.clipPath = clipPath(overlap, box)
      back.style.clipPath = clipPath(overlap, box, true)
      shade.style.clipPath = clipPath(area, box)
      element.style.transformOrigin = `0 ${left}px`
      parent.append(element)
      this.strips.push({
        element,
        face,
        back,
        shade,
        axis: `${width}, ${right - left}, 0`,
        box,
      })

      parent = element
    }
  }

  paint(source: HTMLCanvasElement, paper: string, style: PaperStyle): void {
    for (const { face, back, box } of this.strips) {
      const context = face.getContext('2d')

      face.dataset.paper = style
      back.dataset.paper = style
      face.style.backgroundColor = paper
      back.style.backgroundColor = paper
      context?.clearRect(0, 0, box.width, box.height)
      context?.drawImage(
        source,
        box.left,
        box.top,
        box.width,
        box.height,
        0,
        0,
        box.width,
        box.height,
      )
    }
  }

  play(direction: CurlDirection, onEnd: () => void): void {
    this.cancel()
    this.onEnd = onEnd
    this.element.hidden = false

    const isForward = direction === 'forward'
    const started = performance.now()

    const step = (now: number): void => {
      const time = Math.min(1, (now - started) / TURN_MS)
      const progress = isForward ? liftAndSwing(time) : fallWithBounce(time)

      this.pose(progress)

      if (time < 1) this.frame = requestAnimationFrame(step)
      else this.finish()
    }

    this.pose(isForward ? 0 : 1)
    this.frame = requestAnimationFrame(step)
  }

  cancel(): void {
    if (!this.frame) return

    cancelAnimationFrame(this.frame)
    this.finish()
  }

  private finish(): void {
    this.frame = 0
    this.element.hidden = true

    const onEnd = this.onEnd

    this.onEnd = null
    onEnd?.()
  }

  private pose(progress: number): void {
    let previous = 0

    for (const [index, strip] of this.strips.entries()) {
      const lead = LEAD * (1 - index / (STRIPS - 1))
      const share = Math.max(0, Math.min(1, progress * (1 + LEAD) - lead))
      const angle = share * MAX_ANGLE

      strip.element.style.transform = `rotate3d(${strip.axis}, ${angle - previous}deg)`
      strip.shade.style.opacity = String(
        SHADE * Math.sin((angle * Math.PI) / 180),
      )
      previous = angle
    }

    this.element.style.opacity = String(Math.min(1, (1 - progress) / FADE))
  }
}
