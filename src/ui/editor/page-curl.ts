import type { PaperStyle } from '../../core/note.ts'
import { h } from '../dom.ts'

const STRIPS = 8
const LEAD = 0.6
const MAX_ANGLE = 168
const FORWARD_MS = 420
const BACK_MS = 480
const SHADE = 0.3
const BOUNCE = 0.035
const BOUNCE_FROM = 0.78
const FADE = 0.2

export type CurlDirection = 'forward' | 'back'

interface Strip {
  element: HTMLElement
  face: HTMLCanvasElement
  back: HTMLElement
  shade: HTMLElement
  top: number
  height: number
}

function easeIn(t: number): number {
  return t * t * (2.2 - 1.2 * t)
}

function fallWithBounce(t: number): number {
  const fall = Math.max(0, 1 - Math.min(1, t / BOUNCE_FROM)) ** 3
  const bounce = Math.max(0, (t - BOUNCE_FROM) / (1 - BOUNCE_FROM))

  return fall + BOUNCE * Math.sin(Math.PI * bounce)
}

export class PageCurl {
  readonly element = h('div', { class: 'page-curl', hidden: true })

  private readonly strips: Strip[] = []
  private frame = 0
  private onEnd: (() => void) | null = null

  constructor(width: number, height: number) {
    let parent: HTMLElement = this.element
    let previousHeight = 0

    for (let index = 0; index < STRIPS; index++) {
      const top = Math.round((index * height) / STRIPS)
      const bottom = Math.round(((index + 1) * height) / STRIPS)
      const stripHeight = bottom - top
      const face = h('canvas', {
        class: 'curl-face',
        width,
        height: stripHeight,
      })
      const back = h('div', { class: 'curl-back' })
      const shade = h('div', { class: 'curl-shade' })
      const element = h('div', { class: 'curl-strip' }, face, back, shade)

      element.style.top = `${previousHeight}px`
      element.style.height = `${stripHeight}px`
      face.style.backgroundPosition = `0 ${-top}px`
      parent.append(element)
      this.strips.push({
        element,
        face,
        back,
        shade,
        top,
        height: stripHeight,
      })

      parent = element
      previousHeight = stripHeight
    }
  }

  paint(source: HTMLCanvasElement, paper: string, style: PaperStyle): void {
    for (const strip of this.strips) {
      const context = strip.face.getContext('2d')

      strip.face.dataset.paper = style
      strip.face.style.backgroundColor = paper
      strip.back.style.backgroundColor = paper
      context?.clearRect(0, 0, strip.face.width, strip.height)
      context?.drawImage(
        source,
        0,
        strip.top,
        strip.face.width,
        strip.height,
        0,
        0,
        strip.face.width,
        strip.height,
      )
    }
  }

  play(direction: CurlDirection, onEnd: () => void): void {
    this.cancel()
    this.onEnd = onEnd
    this.element.hidden = false

    const isForward = direction === 'forward'
    const duration = isForward ? FORWARD_MS : BACK_MS
    const started = performance.now()

    const step = (now: number): void => {
      const time = Math.min(1, (now - started) / duration)
      const progress = isForward ? easeIn(time) : fallWithBounce(time)
      const visible = isForward ? (1 - time) / FADE : time / FADE

      this.pose(progress, Math.min(1, visible))

      if (time < 1) this.frame = requestAnimationFrame(step)
      else this.finish()
    }

    this.pose(isForward ? 0 : 1, isForward ? 1 : 0)
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

  private pose(progress: number, opacity: number): void {
    let previous = 0

    this.strips.forEach((strip, index) => {
      const lead = LEAD * (1 - index / (STRIPS - 1))
      const share = Math.max(0, Math.min(1, progress * (1 + LEAD) - lead))
      const angle = share * MAX_ANGLE

      strip.element.style.transform = `rotateX(${previous - angle}deg)`
      strip.shade.style.opacity = String(
        SHADE * Math.sin((angle * Math.PI) / 180),
      )
      previous = angle
    })

    this.element.style.opacity = String(opacity)
  }
}
