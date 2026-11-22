import {
  DASH,
  POSES,
  SPARK,
  Z_GLYPH,
  type Art,
  type Pose,
} from '../src/ui/mascot.ts'

export type Draw = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) => void

export interface Shot {
  pose: Pose
  x: number
  lift: number
  squash: number
  facing: 1 | -1
  sleep: number
  isSurprised: boolean
}

export interface Ball {
  x: number
  y: number
  squash: number
}

const INK = '#1b1a18'
const BELLY = '#fd7103'
const LINE = 'rgb(92 136 196 / 36%)'
const DOT = 'rgb(72 116 182 / 60%)'
const HEAD = 'rgb(92 136 196 / 82%)'
const PENCIL = 'rgb(75 42 18 / 62%)'
const RULES = 11
const NEWT_WIDTH = 0.42
const GROUND = 0.8
const BALL_GROUND = 0.78

const paths = new Map<string, Path2D>()

function pathOf(d: string): Path2D {
  let path = paths.get(d)

  if (!path) {
    path = new Path2D(d)
    paths.set(d, path)
  }

  return path
}

export function paper(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  hasHead = true,
  rules = RULES,
): void {
  const gap = height / rules
  const line = Math.max(1, height / 360)

  context.fillStyle = '#fffefb'
  context.fillRect(0, 0, width, height)
  context.fillStyle = LINE

  for (let index = 1; index < rules; index++) {
    context.fillRect(0, Math.round(index * gap) - line, width, line)
  }

  context.fillStyle = DOT

  for (let index = 1; index < rules; index++) {
    const y = Math.round(index * gap) - line / 2

    for (let x = gap * 0.75; x < width; x += gap * 1.5) {
      context.fillRect(x - line, y - line, line * 2, line * 2)
    }
  }

  if (!hasHead) return

  const size = gap * 0.36
  const top = gap * 0.62

  context.font = `700 ${size}px ui-rounded, 'Zen Maru Gothic', sans-serif`
  context.fillStyle = HEAD
  context.textBaseline = 'alphabetic'
  context.fillText('No.', width * 0.56, top)
  context.fillText('Date', width * 0.72, top)
  context.fillRect(width * 0.6, top + line, width * 0.09, line)
  context.fillRect(width * 0.78, top + line, width * 0.18, line)
}

export function pageNumber(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  value: number,
): void {
  context.font = `700 ${height * 0.032}px ui-rounded, 'Zen Maru Gothic', sans-serif`
  context.fillStyle = 'rgb(92 136 196 / 70%)'
  context.textAlign = 'right'
  context.fillText(String(value), width * 0.965, height * 0.965)
  context.textAlign = 'left'
}

function artAnchor(art: Art): number {
  return art.box[0] - art.left
}

function drawArt(context: CanvasRenderingContext2D, art: Art): void {
  if (art.belly) {
    context.fillStyle = BELLY
    context.fill(pathOf(art.belly), 'evenodd')
  }

  if (art.eyes) {
    context.fillStyle = '#fff'
    context.fill(pathOf(art.eyes))
  }

  if (art.ink) {
    context.fillStyle = INK
    context.fill(pathOf(art.ink), 'evenodd')
  }
}

function pencilLine(
  context: CanvasRenderingContext2D,
  width: number,
  y: number,
  seed: number,
): void {
  context.beginPath()
  context.moveTo(width * 0.05, y)

  for (let step = 1; step <= 12; step++) {
    const x = width * (0.05 + (0.9 * step) / 12)
    const wave = Math.sin(step * 1.7 + seed * 2.3) * width * 0.0022

    context.lineTo(x, y + wave)
  }

  context.lineWidth = Math.max(1.4, width / 300)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = PENCIL
  context.stroke()
}

export function newtPage(shot: Shot, index: number, isSmall = false): Draw {
  return (context, width, height) => {
    const ground = height * GROUND
    const scale = (width * NEWT_WIDTH) / POSES.stand.box[2]
    const art = POSES[shot.pose]
    const x = width * shot.x
    const lift = height * shot.lift

    paper(context, width, height, !isSmall, isSmall ? 5 : RULES)
    pencilLine(context, width, ground + height * 0.012, index)

    context.save()
    context.globalAlpha = 0.14 * (1 - Math.min(1, shot.lift * 3))
    context.fillStyle = INK
    context.beginPath()
    context.ellipse(
      x,
      ground + height * 0.006,
      width * 0.12 * (1 - shot.lift),
      height * 0.012,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.restore()

    if (shot.pose === 'jump' && !shot.isSurprised) {
      context.save()
      context.translate(x, ground)
      context.scale(shot.facing * scale, scale)
      context.translate(-artAnchor(DASH), -(DASH.box[1] + DASH.box[3]))
      drawArt(context, DASH)
      context.restore()
    }

    context.save()
    context.translate(x, ground - lift)
    context.scale(shot.facing * scale, scale * shot.squash)
    context.translate(-artAnchor(art), -(art.box[1] + art.box[3]))
    drawArt(context, art)

    if (shot.isSurprised) {
      context.fillStyle = BELLY
      context.fill(pathOf(SPARK), 'evenodd')
    }

    context.restore()

    if (shot.sleep > 0) {
      const glyph = pathOf(Z_GLYPH)

      for (let z = 0; z < 3; z++) {
        const phase = (shot.sleep + z) % 3
        const size = scale * (36 + z * 10)

        context.save()
        context.globalAlpha = phase === 0 ? 0.45 : 1
        context.translate(
          x - shot.facing * scale * (110 + phase * 40),
          ground - scale * (120 + phase * 70),
        )
        context.scale(size / 5, size / 5)
        context.fillStyle = BELLY
        context.fill(glyph)
        context.restore()
      }
    }

    if (!isSmall) pageNumber(context, width, height, index + 1)
  }
}

export function newtShots(): Shot[] {
  const shots: Shot[] = []
  let x = 0.3
  let facing: 1 | -1 = 1

  const add = (shot: Partial<Shot>): void => {
    shots.push({
      pose: 'stand',
      x,
      lift: 0,
      squash: 1,
      facing,
      sleep: 0,
      isSurprised: false,
      ...shot,
    })
  }

  const hop = (distance: number, height: number, isSurprised = false): void => {
    const from = x

    add({ squash: 0.84 })

    for (const [step, arc] of [
      [0.28, 0.72],
      [0.6, 1],
      [0.88, 0.62],
    ]) {
      x = from + distance * step * facing
      add({ pose: 'jump', lift: height * arc, squash: 1.04, isSurprised })
    }

    x = from + distance * facing
    add({ squash: 0.86 })
  }

  add({})
  add({})
  add({ pose: 'look' })
  add({ pose: 'look' })
  add({})
  hop(0.2, 0.1)
  hop(0.2, 0.1)
  add({})
  facing = -1
  add({})
  hop(0.2, 0.1)
  hop(0.2, 0.1)
  add({})

  for (let sleep = 0; sleep < 5; sleep++) add({ pose: 'flat', sleep })

  hop(0, 0.3, true)
  add({})
  facing = 1
  add({})

  return shots
}

export function ballShots(count: number): Ball[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / count
    const bounce = Math.abs(Math.cos(Math.PI * 2 * t))
    const isDown = bounce < 0.16

    return {
      x: 0.2 + 0.6 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * t)),
      y: bounce * 0.5,
      squash: isDown ? 0.72 : 1 + bounce * 0.06,
    }
  })
}

export function ball(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  shot: Ball,
  alpha = 1,
  stroke = 1,
): void {
  const radius = height * 0.1
  const x = width * shot.x
  const ground = height * BALL_GROUND
  const ry = radius * shot.squash
  const rx = radius * (2 - shot.squash)
  const y = ground - height * shot.y - ry

  context.save()
  context.globalAlpha = alpha
  context.beginPath()
  context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2 * stroke)

  if (stroke < 1) {
    context.lineWidth = Math.max(2, height / 120)
    context.lineCap = 'round'
    context.strokeStyle = '#e8650d'
    context.stroke()
    context.restore()

    return
  }

  context.fillStyle = '#ff7a12'
  context.fill()
  context.fillStyle = INK

  for (const side of [-1, 1]) {
    context.beginPath()
    context.ellipse(
      x + side * rx * 0.3,
      y - ry * 0.12,
      radius * 0.09,
      radius * 0.17 * shot.squash,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()
  }

  context.restore()
}

export function ground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  context.fillStyle = INK
  context.fillRect(0, height * BALL_GROUND, width, Math.max(2, height / 160))
}
