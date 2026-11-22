import { newtPage, newtShots } from './art.ts'
import { isCalm, onScroll, progressAcross } from './motion.ts'

const FRAME_WIDTH = 240
const FRAME_HEIGHT = 180

export function startFilm(): void {
  const strip = document.querySelector<HTMLElement>('[data-film]')
  const track = strip?.querySelector<HTMLElement>('[data-film-track]')

  if (!strip || !track) return

  const shots = newtShots()
  const ratio = Math.min(2, window.devicePixelRatio || 1)

  shots.forEach((shot, index) => {
    const frame = document.createElement('span')
    const canvas = document.createElement('canvas')
    const number = document.createElement('span')
    const context = canvas.getContext('2d')

    canvas.width = FRAME_WIDTH * ratio
    canvas.height = FRAME_HEIGHT * ratio

    if (context) {
      context.scale(ratio, ratio)
      newtPage(shot, index)(context, FRAME_WIDTH, FRAME_HEIGHT)
    }

    frame.className = 'film-frame'
    number.textContent = String(index + 1).padStart(3, '0')
    frame.append(canvas, number)
    track.append(frame)
  })

  if (isCalm) return

  onScroll(() => {
    const progress = progressAcross(strip)
    const travel = Math.max(0, track.scrollWidth - strip.clientWidth)

    track.style.transform = `translate3d(${-progress * travel}px, 0, 0)`
  })
}
