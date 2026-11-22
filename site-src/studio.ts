import {
  ball,
  ballShots,
  ground,
  pageNumber,
  paper,
  type Ball,
  type Draw,
} from './art.ts'
import { ease, Flipbook } from './flipbook.ts'
import {
  clamp,
  isCalm,
  onResize,
  onScroll,
  progressThrough,
  whenVisible,
} from './motion.ts'

const FRAMES = 12
const GHOST = 100
const FPS = 8
const STILL = 3
const BALL_RADIUS = 0.1
const BALL_GROUND = 0.78

function pad(value: number): string {
  return String(value).padStart(3, '0')
}

function ballPage(shot: Ball, index: number, ghost?: Ball): Draw {
  return (context, width, height) => {
    paper(context, width, height)
    ground(context, width, height)

    if (ghost) ball(context, width, height, ghost, 0.32)

    if (index >= 0) ball(context, width, height, shot)

    pageNumber(context, width, height, Math.max(1, index + 1))
  }
}

function strokeEnd(shot: Ball, progress: number): { x: number; y: number } {
  const angle = Math.PI * 2 * progress
  const rx = BALL_RADIUS * (2 - shot.squash)
  const ry = BALL_RADIUS * shot.squash
  const cy = BALL_GROUND - shot.y - ry

  return {
    x: shot.x + (Math.cos(angle) * rx * 3) / 4,
    y: cy + Math.sin(angle) * ry,
  }
}

export function startStudio(): void {
  const track = document.querySelector<HTMLElement>('[data-how]')
  const studio = document.querySelector<HTMLElement>('[data-studio]')
  const host = document.querySelector<HTMLElement>('[data-studio-flip]')
  const pen = document.querySelector<HTMLElement>('[data-studio-pen]')
  const play = document.querySelector<HTMLElement>('[data-studio-play]')
  const pageText = document.querySelector<HTMLElement>('[data-studio-page]')
  const countText = document.querySelector<HTMLElement>('[data-studio-count]')
  const onion = document.querySelector<HTMLElement>('[data-studio-onion]')
  const add = document.querySelector<HTMLElement>('[data-studio-add]')
  const strip = document.querySelector<HTMLElement>('[data-studio-frames]')

  if (
    !track ||
    !studio ||
    !host ||
    !pen ||
    !play ||
    !pageText ||
    !countText ||
    !onion ||
    !add ||
    !strip
  ) {
    return
  }

  const steps = [...document.querySelectorAll<HTMLElement>('.how-step')]
  const shots = ballShots(FRAMES)
  const pages = shots.map((shot, index) => ballPage(shot, index))
  const ghostPage = ballPage(shots[1], -1, shots[0])
  const flipbook = new Flipbook(
    host,
    index => (index === GHOST ? ghostPage : pages[index % FRAMES]),
    { top: 0.7, right: 0.06, bottom: 0.1, left: 0.24 },
  )
  const frames = shots.map((shot, index) => {
    const frame = document.createElement('span')
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    canvas.width = 120
    canvas.height = 90

    if (context) ballPage(shot, index)(context, 120, 90)

    frame.className = 'studio-frame'
    frame.style.setProperty('--n', String(Math.max(0, index - 2)))
    frame.append(canvas)
    frame.hidden = true
    strip.append(frame)

    return frame
  })

  let progress = 0
  let isVisible = false
  let isLooping = false
  let playStart = 0
  let shownFrames = -1

  const setFrames = (count: number, current: number): void => {
    if (count !== shownFrames) {
      shownFrames = count
      frames.forEach((frame, index) => {
        frame.hidden = index >= count
      })
    }

    frames.forEach((frame, index) =>
      frame.classList.toggle('is-current', index === current),
    )
  }

  const setPen = (point: { x: number; y: number } | null): void => {
    pen.classList.toggle('is-on', point !== null)

    if (!point) return

    const width = flipbook.pageWidth
    const height = flipbook.pageHeight

    pen.style.setProperty('--pen-x', `${point.x * width}px`)
    pen.style.setProperty('--pen-y', `${point.y * height - pen.offsetHeight}px`)
  }

  const drawLive = (shot: Ball, stroke: number, ghost?: Ball): void => {
    flipbook.draw(0, null, 0, (context, width, height) => {
      paper(context, width, height)
      ground(context, width, height)

      if (ghost) ball(context, width, height, ghost, 0.32)

      if (stroke > 0) ball(context, width, height, shot, 1, stroke)

      pageNumber(context, width, height, ghost ? 2 : 1)
    })
  }

  const playing = (now: number): void => {
    if (!isLooping) return

    if (!isVisible || progress < 0.66) {
      isLooping = false

      return
    }

    const frame = Math.floor(((now - playStart) / 1000) * FPS) % FRAMES

    flipbook.draw(frame, null, 0)
    pageText.textContent = pad(frame + 1)
    setFrames(FRAMES, frame)
    requestAnimationFrame(playing)
  }

  const render = (): void => {
    const p = isCalm ? 0.9 : progress
    const step = p < 0.33 ? 0 : p < 0.66 ? 1 : 2

    track.style.setProperty('--how', String(p))
    steps.forEach((element, index) =>
      element.classList.toggle('is-active', index === step),
    )
    studio.dataset.step = String(step)
    add.classList.toggle('is-pressed', p > 0.35 && p < 0.39)
    play.classList.toggle('is-pressed', p > 0.67 && p < 0.7)
    studio.classList.toggle('is-playing', step === 2 && !isCalm)
    onion.classList.toggle('is-on', p > 0.4 && step === 1)

    if (step === 2) {
      countText.textContent = pad(FRAMES)
      setPen(null)

      if (isCalm) {
        flipbook.draw(STILL, null, 0)
        pageText.textContent = pad(STILL + 1)
        setFrames(FRAMES, STILL)

        return
      }

      if (!isLooping && isVisible) {
        isLooping = true
        playStart = performance.now()
        requestAnimationFrame(playing)
      }

      return
    }

    isLooping = false

    if (step === 0) {
      const stroke = clamp((p - 0.03) / 0.2)
      const isFilled = p > 0.25

      pageText.textContent = pad(1)
      countText.textContent = pad(1)
      setFrames(1, 0)
      setPen(
        stroke > 0 && stroke < 1 && !isFilled
          ? strokeEnd(shots[0], stroke)
          : null,
      )

      if (isFilled) flipbook.draw(0, null, 0)
      else drawLive(shots[0], stroke)

      return
    }

    const isAdded = p > 0.37
    const turn = clamp((p - 0.38) / 0.1)
    const stroke = clamp((p - 0.5) / 0.11)
    const isFilled = p > 0.62

    pageText.textContent = pad(isAdded ? 2 : 1)
    countText.textContent = pad(isAdded ? 2 : 1)
    setFrames(isAdded ? 2 : 1, isAdded ? 1 : 0)

    if (turn < 1) {
      setPen(null)
      flipbook.draw(0, isAdded ? GHOST : null, ease(turn))

      return
    }

    setPen(
      stroke > 0 && stroke < 1 && !isFilled
        ? strokeEnd(shots[2], stroke)
        : null,
    )

    if (isFilled) {
      flipbook.draw(0, null, 0, (context, width, height) => {
        ghostPage(context, width, height)
        ball(context, width, height, shots[2])
      })
    } else {
      drawLive(shots[2], stroke, shots[0])
    }
  }

  onScroll(() => {
    const next = progressThrough(track)

    if (Math.abs(next - progress) < 0.0005 && shownFrames >= 0) return

    progress = next
    render()
  })

  onResize(host, () => {
    if (flipbook.resize()) render()
  })

  whenVisible(track, visible => {
    isVisible = visible

    if (visible) render()
  })

  flipbook.resize()
  render()
}
