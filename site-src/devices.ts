import { newtPage, newtShots } from './art.ts'
import { isCalm, onResize, whenVisible } from './motion.ts'

const FPS = 8

export function startDevices(): void {
  const hosts = [...document.querySelectorAll<HTMLElement>('[data-device-art]')]

  if (!hosts.length) return

  const shots = newtShots()
  const pages = shots.map((shot, index) => newtPage(shot, index))
  const ratio = Math.min(2, window.devicePixelRatio || 1)
  const screens = hosts.map(host => {
    const canvas = document.createElement('canvas')

    host.append(canvas)

    return { host, canvas, context: canvas.getContext('2d') }
  })
  let isVisible = false
  let isRunning = false
  let frame = -1

  const paint = (index: number): void => {
    for (const { host, canvas, context } of screens) {
      const width = host.clientWidth
      const height = host.clientHeight

      if (!context || !width || !height) continue

      if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio)
        canvas.height = Math.round(height * ratio)
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      pages[index](context, width, height)
    }
  }

  const tick = (now: number): void => {
    if (!isVisible) {
      isRunning = false

      return
    }

    const next = Math.floor((now / 1000) * FPS) % pages.length

    if (next !== frame) {
      frame = next
      paint(frame)
    }

    requestAnimationFrame(tick)
  }

  const still = shots.findIndex(shot => shot.pose === 'look')

  for (const { host } of screens) {
    onResize(host, () => paint(Math.max(0, frame < 0 ? still : frame)))
  }

  whenVisible(hosts[0].closest('.devices') ?? hosts[0], visible => {
    isVisible = visible

    if (isCalm) {
      paint(still)

      return
    }

    if (visible && !isRunning) {
      isRunning = true
      requestAnimationFrame(tick)
    }
  })
}
