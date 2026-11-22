import { newtPage, newtShots, paper, type Draw } from './art.ts'
import { ease, Flipbook } from './flipbook.ts'
import { isCalm, onResize, onScroll, whenVisible } from './motion.ts'
import { inkedPages, onDrawingChange } from './store.ts'

const SCROLL_PAGE = 40
const SETTLE_MS = 160
const CURL_FROM = 0.35
const PLAY_TURN_MS = 80
const PLAY_HOLD_MS = 120

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const PROBE = 0.25
const FIT_PAD = 0.12
const MIN_BOX = 0.3

function inkBox(layers: HTMLCanvasElement[]): Box | null {
  const first = layers[0]

  if (!first) return null

  const probe = document.createElement('canvas')
  const width = Math.ceil(first.width * PROBE)
  const height = Math.ceil(first.height * PROBE)
  const context = probe.getContext('2d', { willReadFrequently: true })

  if (!context) return null

  probe.width = width
  probe.height = height

  for (const layer of layers) context.drawImage(layer, 0, 0, width, height)

  const data = context.getImageData(0, 0, width, height).data
  let left = width
  let top = height
  let right = -1
  let bottom = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 12) continue

      left = Math.min(left, x)
      right = Math.max(right, x)
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }

  if (right < 0) return null

  const minWidth = first.width * MIN_BOX
  const minHeight = first.height * MIN_BOX
  const boxWidth = Math.max(minWidth, (right - left + 1) / PROBE)
  const boxHeight = Math.max(minHeight, (bottom - top + 1) / PROBE)
  const centerX = (left + right + 1) / 2 / PROBE
  const centerY = (top + bottom + 1) / 2 / PROBE

  return {
    x: centerX - boxWidth / 2,
    y: centerY - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
  }
}

function drawnPage(layer: HTMLCanvasElement, box: Box): Draw {
  return (context, width, height) => {
    paper(context, width, height, false, 5)

    const scale = Math.min(
      (width * (1 - FIT_PAD * 2)) / box.width,
      (height * (1 - FIT_PAD * 2)) / box.height,
    )
    const drawWidth = box.width * scale
    const drawHeight = box.height * scale
    const left = (width - drawWidth) / 2
    const top = (height - drawHeight) / 2
    const spread = Math.max(0.6, width / 220)

    for (const [dx, dy] of [
      [0, 0],
      [spread, 0],
      [-spread, 0],
      [0, spread],
      [0, -spread],
    ]) {
      context.drawImage(
        layer,
        box.x,
        box.y,
        box.width,
        box.height,
        left + dx,
        top + dy,
        drawWidth,
        drawHeight,
      )
    }
  }
}

function drawnPages(): Draw[] {
  const layers = inkedPages()
  const box = inkBox(layers)

  return box ? layers.map(layer => drawnPage(layer, box)) : []
}

function wrap(index: number, count: number): number {
  return ((index % count) + count) % count
}

export function startCorners(): void {
  const hosts = [
    ...document.querySelectorAll<HTMLElement>('[data-corner-book]'),
  ]
  const shots = newtShots()
  const newtPages = shots.map((shot, index) => newtPage(shot, index, true))
  let pages: Draw[] = newtPages

  const books = hosts.flatMap(host => {
    const flip = host.querySelector<HTMLElement>('.flip')

    if (!flip) return []

    return [
      {
        host,
        flipbook: new Flipbook(
          flip,
          index => pages[wrap(index, pages.length)],
          { top: 0.6, right: 0.05, bottom: 0.14, left: 0.3 },
          { from: 0.45, to: 0.8 },
        ),
        isVisible: false,
        shown: -1,
      },
    ]
  })

  let offset = 0
  let settleTimer = 0
  let settleId = 0

  const position = (): number => scrollY / SCROLL_PAGE + offset

  const draw = (): void => {
    const value = isCalm ? 0 : position()
    const page = Math.floor(value)
    const fraction = value - page
    const turn =
      fraction < CURL_FROM ? 0 : ease((fraction - CURL_FROM) / (1 - CURL_FROM))
    const key = page * 1000 + Math.round(turn * 400)

    for (const book of books) {
      if (!book.isVisible || book.shown === key) continue

      book.shown = key
      book.flipbook.draw(
        wrap(page, pages.length),
        turn > 0 ? wrap(page + 1, pages.length) : null,
        turn,
      )
    }
  }

  const settle = (): void => {
    const value = position()
    const target = Math.round(value - CURL_FROM / 2)
    const from = offset
    const to = offset + (target - value)
    const start = performance.now()
    const id = ++settleId

    const step = (now: number): void => {
      if (id !== settleId) return

      const t = Math.min(1, (now - start) / SETTLE_MS)

      offset = from + (to - from) * ease(t)
      draw()

      if (t < 1) requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
  }

  const refresh = (): void => {
    const drawn = drawnPages()

    pages = drawn.length ? drawn : newtPages

    for (const book of books) {
      book.host.classList.toggle('is-yours', drawn.length > 0)
      book.flipbook.invalidate()
      book.shown = -1
    }

    draw()
  }

  for (const book of books) {
    onResize(book.host, () => {
      if (book.flipbook.resize()) {
        book.shown = -1
        draw()
      }
    })

    whenVisible(book.host, visible => {
      book.isVisible = visible

      if (visible) {
        book.flipbook.resize()
        book.shown = -1
        draw()
      }
    })
  }

  if (!isCalm) {
    onScroll(() => {
      settleId++
      draw()
      clearTimeout(settleTimer)
      settleTimer = window.setTimeout(settle, 140)
    })
  }

  onDrawingChange(refresh)
  startClosingBook()
}

function startClosingBook(): void {
  const figure = document.querySelector<HTMLElement>('[data-cta-book]')
  const host = figure?.querySelector<HTMLElement>('.flip')

  if (!figure || !host) return

  let pages: Draw[] = []
  let isVisible = false
  let isRunning = false
  let page = 0
  let at = 0

  const flipbook = new Flipbook(
    host,
    index => pages[wrap(index, Math.max(1, pages.length))],
    { top: 0.6, right: 0.06, bottom: 0.12, left: 0.26 },
    { from: 0.45, to: 0.8 },
  )

  const tick = (now: number): void => {
    if (!isVisible || pages.length === 0) {
      isRunning = false

      return
    }

    const elapsed = now - at
    const turn = Math.max(0, (elapsed - PLAY_HOLD_MS) / PLAY_TURN_MS)

    if (turn >= 1) {
      page = wrap(page + 1, pages.length)
      at = now
    }

    flipbook.draw(
      page,
      pages.length > 1 && turn > 0 && turn < 1
        ? wrap(page + 1, pages.length)
        : null,
      isCalm ? 0 : ease(Math.min(1, turn)),
    )
    requestAnimationFrame(tick)
  }

  const run = (): void => {
    if (isRunning || !isVisible || pages.length === 0) return

    if (isCalm) {
      flipbook.draw(0, null, 0)

      return
    }

    isRunning = true
    at = performance.now()
    requestAnimationFrame(tick)
  }

  onDrawingChange(() => {
    pages = drawnPages()
    figure.hidden = pages.length === 0
    document
      .querySelector('[data-cta]')
      ?.classList.toggle('is-yours', pages.length > 0)
    page = 0
    flipbook.invalidate()

    if (pages.length) {
      flipbook.resize()
      run()
    }
  })

  onResize(host, () => {
    if (flipbook.resize() && pages.length) flipbook.draw(page, null, 0)
  })

  whenVisible(figure, visible => {
    isVisible = visible

    if (visible) run()
  })
}
