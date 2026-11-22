import { pageNumber, paper } from './art.ts'
import { ease, Flipbook } from './flipbook.ts'
import { clamp, isCalm, onResize, whenVisible } from './motion.ts'
import { changed, drawing } from './store.ts'

const PAGES = 4
const WIDTH = 800
const HEIGHT = 600
const PEN = 7
const ERASER = 34
const TURN_MS = 240
const PLAY_TURN_MS = 70
const PLAY_HOLD_MS = 130

interface Turn {
  from: number
  to: number
  at: number
  duration: number
}

export function startToy(): void {
  const toy = document.querySelector<HTMLElement>('[data-toy]')
  const host = toy?.querySelector<HTMLElement>('[data-toy-flip]')
  const playButton = toy?.querySelector<HTMLButtonElement>('[data-play]')
  const playText = toy?.querySelector<HTMLElement>('[data-play-text]')
  const clearButton = toy?.querySelector<HTMLButtonElement>('[data-clear]')
  const eraserButton = toy?.querySelector<HTMLButtonElement>('[data-eraser]')

  if (
    !toy ||
    !host ||
    !playButton ||
    !playText ||
    !clearButton ||
    !eraserButton
  ) {
    return
  }

  const swatches = [...toy.querySelectorAll<HTMLButtonElement>('[data-ink]')]
  const tabs = [...toy.querySelectorAll<HTMLButtonElement>('[data-page]')]
  const layers = Array.from({ length: PAGES }, () => {
    const canvas = document.createElement('canvas')

    canvas.width = WIDTH
    canvas.height = HEIGHT

    return canvas
  })
  const contexts = layers.map(layer => layer.getContext('2d'))
  const inked = layers.map(() => false)

  drawing.layers = layers
  drawing.inked = inked

  const guide = (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void => {
    const radius = height * 0.12

    context.save()
    context.setLineDash([height * 0.012, height * 0.022])
    context.lineCap = 'round'
    context.lineWidth = Math.max(2, height / 160)
    context.strokeStyle = 'rgb(63 169 245 / 70%)'
    context.beginPath()
    context.ellipse(
      width * 0.3,
      height * 0.6,
      radius,
      radius,
      0,
      0,
      Math.PI * 2,
    )
    context.stroke()
    context.setLineDash([])
    context.fillStyle = 'rgb(63 169 245 / 85%)'
    context.beginPath()
    context.arc(
      width * 0.3 + radius,
      height * 0.6,
      height * 0.016,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.restore()
  }

  const sheet =
    (index: number, isOnion: boolean) =>
    (
      context: CanvasRenderingContext2D,
      width: number,
      height: number,
    ): void => {
      paper(context, width, height)

      if (index === 0 && !inked.some(Boolean)) guide(context, width, height)

      if (isOnion && index > 0) {
        context.save()
        context.globalAlpha = 0.2
        context.drawImage(layers[index - 1], 0, 0, width, height)
        context.restore()
      }

      context.drawImage(layers[index], 0, 0, width, height)
      pageNumber(context, width, height, index + 1)
    }

  const flipbook = new Flipbook(host, index => sheet(index % PAGES, false), {
    top: 0.7,
    right: 0.06,
    bottom: 0.1,
    left: 0.24,
  })

  let page = 0
  let ink = swatches[0]?.dataset.ink ?? '#1b1a18'
  let isEraser = false
  let isPlaying = false
  let isVisible = false
  let turn: Turn | null = null
  let playAt = 0
  let stroke: {
    id: number
    x: number
    y: number
    mx: number
    my: number
  } | null = null

  const draw = (): void => {
    if (turn) {
      const t = clamp((performance.now() - turn.at) / turn.duration)
      const isForward = turn.to > turn.from || (isPlaying && turn.to === 0)

      if (isForward) flipbook.draw(turn.from, turn.to, ease(t))
      else flipbook.draw(turn.to, turn.from, ease(1 - t))

      return
    }

    flipbook.draw(page, null, 0, sheet(page, !isPlaying))
  }

  const setPage = (next: number): void => {
    page = next
    tabs.forEach((tab, index) => {
      tab.classList.toggle('is-on', index === page)
      tab.setAttribute('aria-pressed', String(index === page))
    })
  }

  const loop = (now: number): void => {
    if (turn && now - turn.at >= turn.duration) {
      setPage(turn.to)
      turn = null
      playAt = now
    }

    if (isPlaying && !turn && now - playAt >= PLAY_HOLD_MS && isVisible) {
      turn = {
        from: page,
        to: (page + 1) % PAGES,
        at: now,
        duration: isCalm ? 1 : PLAY_TURN_MS,
      }
    }

    draw()

    if (turn || isPlaying) requestAnimationFrame(loop)
  }

  const goTo = (next: number): void => {
    if (next === page || turn) return

    if (isCalm) {
      setPage(next)
      draw()

      return
    }

    turn = { from: page, to: next, at: performance.now(), duration: TURN_MS }
    requestAnimationFrame(loop)
  }

  const setPlaying = (value: boolean): void => {
    isPlaying = value
    toy.classList.toggle('is-playing', value)
    playText.textContent =
      (value ? toy.dataset.stopLabel : toy.dataset.playLabel) ?? ''
    flipbook.invalidate()

    if (value) {
      playAt = performance.now()
      requestAnimationFrame(loop)
    } else {
      turn = null
      draw()
    }
  }

  const point = (event: PointerEvent): { x: number; y: number } => {
    const box = host.getBoundingClientRect()

    return {
      x: ((event.clientX - box.left) / box.width) * WIDTH,
      y: ((event.clientY - box.top) / box.height) * HEIGHT,
    }
  }

  const paint = (x: number, y: number): void => {
    const context = contexts[page]

    if (!context || !stroke) return

    const mx = (stroke.x + x) / 2
    const my = (stroke.y + y) / 2

    context.save()
    context.globalCompositeOperation = isEraser
      ? 'destination-out'
      : 'source-over'
    context.strokeStyle = ink
    context.lineWidth = isEraser ? ERASER : PEN
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(stroke.mx, stroke.my)
    context.quadraticCurveTo(stroke.x, stroke.y, mx, my)
    context.stroke()
    context.restore()

    stroke.x = x
    stroke.y = y
    stroke.mx = mx
    stroke.my = my
    draw()
  }

  host.addEventListener('pointerdown', event => {
    if (isPlaying || event.button > 0) return

    if (turn) {
      setPage(turn.to)
      turn = null
    }

    event.preventDefault()
    host.setPointerCapture(event.pointerId)

    const { x, y } = point(event)

    stroke = { id: event.pointerId, x, y, mx: x, my: y }
    paint(x + 0.01, y + 0.01)
  })

  host.addEventListener('pointermove', event => {
    if (stroke?.id !== event.pointerId) return

    for (const sample of event.getCoalescedEvents?.() ?? [event]) {
      const { x, y } = point(sample)

      paint(x, y)
    }
  })

  const finish = (event: PointerEvent): void => {
    if (stroke?.id !== event.pointerId) return

    stroke = null
    flipbook.invalidate(page)
    tabs[page]?.classList.add('has-ink')
    inked[page] = true
    changed()
  }

  host.addEventListener('pointerup', finish)
  host.addEventListener('pointercancel', finish)

  for (const swatch of swatches) {
    swatch.addEventListener('click', () => {
      ink = swatch.dataset.ink ?? ink
      isEraser = false
      eraserButton.setAttribute('aria-pressed', 'false')
      swatches.forEach(item => {
        item.classList.toggle('is-on', item === swatch)
        item.setAttribute('aria-pressed', String(item === swatch))
      })
    })
  }

  eraserButton.addEventListener('click', () => {
    isEraser = !isEraser
    eraserButton.setAttribute('aria-pressed', String(isEraser))
    swatches.forEach(item =>
      item.classList.toggle('is-on', !isEraser && item.dataset.ink === ink),
    )
  })

  clearButton.addEventListener('click', () => {
    contexts[page]?.clearRect(0, 0, WIDTH, HEIGHT)
    tabs[page]?.classList.remove('has-ink')
    inked[page] = false
    changed()
    flipbook.invalidate(page)
    draw()
  })

  tabs.forEach((tab, index) =>
    tab.addEventListener('click', () => {
      if (isPlaying) setPlaying(false)

      goTo(index)
    }),
  )

  playButton.addEventListener('click', () => setPlaying(!isPlaying))

  onResize(host, () => {
    if (flipbook.resize()) draw()
  })

  whenVisible(host, visible => {
    isVisible = visible

    if (!visible && isPlaying) setPlaying(false)
  })

  flipbook.resize()
  draw()
}
