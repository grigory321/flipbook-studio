import { newtPage, newtShots } from './art.ts'
import { ease, Flipbook } from './flipbook.ts'
import { clamp, isCalm, onResize, onScroll, whenVisible } from './motion.ts'

const TURN_MS = 96
const HOLD_MS = 18
const PEEK = 0.08
const SETTLE_MS = 260
const IDLE_MS = 2600
const COVER_MS = 2300
const TRAIL_MS = 520
const TILT = 3.2
const SCROLL_PAGE = 70
const LOOP_PAUSE_MS = 1700
const REST_PEEK = 0.05

function startTrail(hero: HTMLElement, stage: HTMLElement): void {
  const canvas = hero.querySelector<HTMLCanvasElement>('[data-trail]')
  const context = canvas?.getContext('2d')

  if (!canvas || !context || isCalm || !matchMedia('(pointer: fine)').matches) {
    return
  }

  const points: { x: number; y: number; at: number }[] = []
  let isDrawing = false

  const size = (): void => {
    const ratio = Math.min(2, window.devicePixelRatio || 1)

    canvas.width = Math.round(hero.clientWidth * ratio)
    canvas.height = Math.round(hero.clientHeight * ratio)
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  const paint = (now: number): void => {
    while (points.length && now - points[0].at > TRAIL_MS) points.shift()

    context.clearRect(0, 0, canvas.width, canvas.height)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (let index = 1; index < points.length; index++) {
      const from = points[index - 1]
      const to = points[index]
      const life = 1 - (now - to.at) / TRAIL_MS

      context.strokeStyle = `rgb(255 255 255 / ${life * 0.85})`
      context.lineWidth = 1.5 + life * 4.5
      context.beginPath()
      context.moveTo(from.x, from.y)
      context.lineTo(to.x, to.y)
      context.stroke()
    }

    if (points.length) requestAnimationFrame(paint)
    else isDrawing = false
  }

  hero.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return

    const box = hero.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top

    points.push({ x, y, at: performance.now() })
    stage.style.setProperty(
      '--tilt-x',
      `${(x / box.width - 0.5) * TILT * 2}deg`,
    )
    stage.style.setProperty(
      '--tilt-y',
      `${(0.5 - y / box.height) * TILT * 2}deg`,
    )

    if (!isDrawing) {
      isDrawing = true
      requestAnimationFrame(paint)
    }
  })

  hero.addEventListener('pointerleave', () => {
    stage.style.setProperty('--tilt-x', '0deg')
    stage.style.setProperty('--tilt-y', '0deg')
  })

  onResize(hero, size)
  size()
}

export function startHero(): void {
  const host = document.querySelector<HTMLElement>('[data-hero-flip]')
  const book = host?.closest<HTMLElement>('.hero-book')
  const grip = book?.querySelector<HTMLElement>('[data-corner]')
  const hero = book?.closest<HTMLElement>('.hero')
  const stage = book?.closest<HTMLElement>('.hero-stage')

  if (!host || !book || !grip || !hero || !stage) return

  startTrail(hero, stage)

  const shots = newtShots()
  const pages = shots.map((shot, index) => newtPage(shot, index))
  const flipbook = new Flipbook(
    host,
    index => pages[index % pages.length],
    { top: 0.5, right: 0.08, bottom: 0.12, left: 0.3 },
    { from: 0.4, to: 0.7 },
  )
  const count = pages.length
  let page = 0
  let turn = 0
  let isVisible = false
  let isRunning = false
  let idleUntil = performance.now() + COVER_MS
  let dragging: { id: number; progress: number } | null = null
  let settling: {
    from: number
    to: number
    at: number
    isNext: boolean
  } | null = null
  let peek = 0
  let peekTarget = 0
  let last = 0
  let isResting = false

  const draw = (): void => {
    const progress = dragging
      ? dragging.progress
      : settling
        ? settling.from +
          (settling.to - settling.from) *
            ease(clamp((performance.now() - settling.at) / SETTLE_MS))
        : Math.max(
            turn,
            peek,
            isResting
              ? REST_PEEK +
                  Math.max(0, Math.sin(performance.now() / 160)) * 0.03
              : 0,
          )

    flipbook.draw(page, progress > 0 ? (page + 1) % count : null, progress)
  }

  const tick = (now: number): void => {
    if (!isVisible) {
      isRunning = false

      return
    }

    const delta = Math.min(64, now - (last || now))

    last = now
    peek += (peekTarget - peek) * Math.min(1, delta / 90)

    if (settling) {
      if (now - settling.at >= SETTLE_MS) {
        if (settling.isNext) page = (page + 1) % count

        settling = null
        turn = 0
        idleUntil = now + IDLE_MS
      }
    } else if (!dragging && !isCalm && now > idleUntil && peekTarget === 0) {
      isResting = false
      turn += delta / TURN_MS

      if (turn >= 1 + HOLD_MS / TURN_MS) {
        turn = 0
        page = (page + 1) % count

        if (page === 0) {
          idleUntil = now + LOOP_PAUSE_MS
          isResting = true
        }
      }
    }

    draw()
    requestAnimationFrame(tick)
  }

  const run = (): void => {
    if (isRunning || !isVisible) return

    isRunning = true
    last = 0
    requestAnimationFrame(tick)
  }

  const progressAt = (event: PointerEvent): number => {
    const box = host.getBoundingClientRect()
    const x = clamp((box.right - event.clientX) / box.width)
    const y = clamp((box.bottom - event.clientY) / box.height, 0, 1.6)

    return clamp(y * 0.78 + x * 0.32)
  }

  grip.addEventListener('pointerenter', () => {
    if (!dragging) peekTarget = PEEK
  })

  grip.addEventListener('pointerleave', () => {
    peekTarget = 0
  })

  grip.addEventListener('pointerdown', event => {
    event.preventDefault()
    grip.setPointerCapture(event.pointerId)
    turn = 0
    settling = null
    dragging = {
      id: event.pointerId,
      progress: Math.max(PEEK, progressAt(event)),
    }
    book.classList.add('is-dragging')
    run()
  })

  grip.addEventListener('pointermove', event => {
    if (dragging?.id !== event.pointerId) return

    dragging.progress = Math.max(0.02, progressAt(event))
  })

  const release = (event: PointerEvent): void => {
    if (dragging?.id !== event.pointerId) return

    const from = dragging.progress
    const isNext = from > 0.32

    settling = {
      from,
      to: isNext ? 1 : 0,
      at: performance.now(),
      isNext,
    }
    dragging = null
    peekTarget = 0
    peek = 0
    book.classList.remove('is-dragging')
  }

  grip.addEventListener('pointerup', release)
  grip.addEventListener('pointercancel', release)

  onResize(host, () => {
    if (flipbook.resize()) draw()
  })

  let lastScroll = scrollY

  onScroll(() => {
    const travel = Math.abs(scrollY - lastScroll)

    lastScroll = scrollY

    if (isCalm || dragging || settling || !isVisible) return

    turn += travel / SCROLL_PAGE
    idleUntil = 0
    isResting = false
    run()
  })

  whenVisible(host, visible => {
    isVisible = visible

    if (visible) run()
  })

  flipbook.resize()

  if (isCalm) {
    page = shots.findIndex(shot => shot.pose === 'look')
    draw()
  }
}
