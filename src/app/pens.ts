import type { ProfileId } from '../core/profile.ts'
import type { Surface } from '../core/surface.ts'
import {
  DSI_SAMPLES_PER_FRAME,
  DsiBrush,
  DsiPen,
  type DsiPenOptions,
} from '../draw/pen-dsi.ts'
import { N3dsKind, n3dsPenIndex, N3dsPen } from '../draw/pen-3ds.ts'
import {
  type FreeAction,
  FreePen,
  type FreePenOptions,
  type FreeStyle,
} from '../draw/pen-free.ts'
import { TouchFilter, type TouchSample } from '../draw/touch-3ds.ts'

export type PenEngine = 'free' | 'dsi' | '3ds'

export type StrokeKind = 'pen' | 'eraser' | 'paint'

export interface PenSpec {
  readonly id: string
  readonly engine: PenEngine
  readonly nameKey: string
  readonly size?: number
  readonly isPro?: boolean
  readonly isArt?: boolean
  readonly code: number
  readonly style?: FreeStyle
}

function dsiPen(
  id: string,
  nameKey: string,
  code: number,
  size?: number,
  isPro = false,
): PenSpec {
  return { id: `dsi.${id}`, engine: 'dsi', nameKey, code, size, isPro }
}

function n3dsPen(
  id: string,
  nameKey: string,
  code: number,
  size?: number,
): PenSpec {
  const isPro = code >= 8

  return { id: `3ds.${id}`, engine: '3ds', nameKey, code, size, isPro }
}

function freePen(id: string, nameKey: string, style: FreeStyle): PenSpec {
  return { id: `free.${id}`, engine: 'free', nameKey, code: 0, style }
}

const ART_STYLES: readonly FreeStyle[] = [
  'pencil',
  'colorPencil',
  'crayon',
  'chalk',
  'charcoal',
  'pastel',
  'watercolor',
  'airbrush',
  'marker',
  'highlighter',
  'nib',
  'ribbon',
  'neon',
  'spray',
  'stipple',
  'splatter',
  'dots',
  'stars',
  'hearts',
]

const ART_PENS: readonly PenSpec[] = ART_STYLES.map(style => ({
  ...freePen(style, `pen.${style}`, style),
  isArt: true,
}))

const DSI_PENS: readonly PenSpec[] = [
  dsiPen('pen1', 'pen.pen', DsiBrush.line, 1),
  dsiPen('pen2', 'pen.pen', DsiBrush.pen2, 2),
  dsiPen('pen3', 'pen.pen', DsiBrush.square3, 3),
  dsiPen('even2', 'pen.dotted', DsiBrush.pen2Even, 2),
  dsiPen('double', 'pen.double', DsiBrush.double),
  dsiPen('spray', 'pen.spray', DsiBrush.spray),
  dsiPen('jitter', 'pen.jitter', DsiBrush.jitter),
  dsiPen('crayon', 'pen.crayon', DsiBrush.scatter),
  dsiPen('pen5', 'pen.pen', DsiBrush.square5, 5, true),
  dsiPen('pen7', 'pen.pen', DsiBrush.square7, 7, true),
  dsiPen('pen9', 'pen.pen', DsiBrush.square9, 9, true),
  dsiPen('speed', 'pen.brush', DsiBrush.speed, undefined, true),
  dsiPen('outline', 'pen.outline', DsiBrush.outline, undefined, true),
  dsiPen('spray2', 'pen.sprayWide', DsiBrush.sprayWide, undefined, true),
  dsiPen('jitter2', 'pen.jitterWide', DsiBrush.jitterWide, undefined, true),
  dsiPen('crayon2', 'pen.crayonWide', DsiBrush.scatterWide, undefined, true),
]

const N3DS_PENS: readonly PenSpec[] = [
  n3dsPen('pen1', 'pen.pen', 0, 1),
  n3dsPen('pen2', 'pen.pen', 1, 2),
  n3dsPen('pen3', 'pen.pen', 2, 3),
  n3dsPen('brush', 'pen.brush', 3),
  n3dsPen('outline', 'pen.outline', 4),
  n3dsPen('dots', 'pen.dots', 5),
  n3dsPen('pencil', 'pen.pencil', 6),
  n3dsPen('spray', 'pen.spray', 7),
  n3dsPen('pen5', 'pen.pen', 8, 5),
  n3dsPen('pen9', 'pen.pen', 9, 9),
  n3dsPen('pen15', 'pen.pen', 10, 15),
  n3dsPen('brush2', 'pen.brushWide', 11),
  n3dsPen('outline2', 'pen.outlineWide', 12),
  n3dsPen('dots2', 'pen.dotsWide', 13),
  n3dsPen('pencil2', 'pen.pencilWide', 14),
  n3dsPen('spray2', 'pen.sprayWide', 15),
]

const FREE_PENS: readonly PenSpec[] = [
  freePen('round', 'pen.round', 'round'),
  freePen('inkpen', 'pen.inkpen', 'inkpen'),
  freePen('brush', 'pen.brush', 'brush'),
  freePen('felt', 'pen.felt', 'felt'),
  freePen('square', 'pen.square', 'square'),
]

export const PEN_SETS: Readonly<Record<ProfileId, readonly PenSpec[]>> = {
  free: [...FREE_PENS, ...ART_PENS],
  dsi: [...DSI_PENS, ...ART_PENS],
  '3ds': [...N3DS_PENS, ...ART_PENS],
}

const ERASER_SHAPES = [
  { nameKey: 'eraser.dot', dsi: DsiBrush.eraseLine, sizes: [1, 1] },
  { nameKey: 'eraser.square', dsi: DsiBrush.eraseSquare3, sizes: [3, 3] },
  { nameKey: 'eraser.round', dsi: DsiBrush.eraseRound7, sizes: [7, 8] },
  { nameKey: 'eraser.round', dsi: DsiBrush.eraseRound15, sizes: [15, 16] },
  { nameKey: 'eraser.square', dsi: DsiBrush.eraseSquare7, sizes: [7, 9] },
  { nameKey: 'eraser.square', dsi: DsiBrush.eraseSquare15, sizes: [15, 13] },
  { nameKey: 'eraser.barV', dsi: DsiBrush.eraseBarV, sizes: [15, 15] },
  { nameKey: 'eraser.barH', dsi: DsiBrush.eraseBarH, sizes: [15, 15] },
]

function erasersFor(engine: 'dsi' | '3ds'): PenSpec[] {
  return ERASER_SHAPES.map((shape, index) => ({
    id: `${engine}.eraser${index}`,
    engine,
    nameKey: shape.nameKey,
    size: shape.sizes[engine === 'dsi' ? 0 : 1],
    code: engine === 'dsi' ? shape.dsi : index,
  }))
}

const FREE_ERASERS: readonly PenSpec[] = [
  freePen('eraser-round', 'eraser.round', 'round'),
  freePen('eraser-square', 'eraser.square', 'square'),
]

export const ERASER_SETS: Readonly<Record<ProfileId, readonly PenSpec[]>> = {
  free: FREE_ERASERS,
  dsi: erasersFor('dsi'),
  '3ds': erasersFor('3ds'),
}

export const PAINT_SETS: Readonly<Record<ProfileId, readonly PenSpec[]>> = {
  free: [freePen('paint', 'paint.brush', 'round')],
  dsi: [
    {
      id: 'dsi.paint3',
      engine: 'dsi',
      nameKey: 'paint.small',
      size: 3,
      code: 1,
    },
    {
      id: 'dsi.paint7',
      engine: 'dsi',
      nameKey: 'paint.medium',
      size: 7,
      code: 3,
    },
    {
      id: 'dsi.paint15',
      engine: 'dsi',
      nameKey: 'paint.large',
      size: 15,
      code: 7,
    },
  ],
  '3ds': [
    {
      id: '3ds.paint5',
      engine: '3ds',
      nameKey: 'paint.small',
      size: 5,
      code: 0,
    },
    {
      id: '3ds.paint9',
      engine: '3ds',
      nameKey: 'paint.medium',
      size: 9,
      code: 1,
    },
    {
      id: '3ds.paint15',
      engine: '3ds',
      nameKey: 'paint.large',
      size: 15,
      code: 2,
    },
  ],
}

const N3DS_BORDER = 5
const FRAME_MS = 1000 / 60
const MAX_CATCH_UP_FRAMES = 6
const TOUCH_READ_MS = 4

export type ExactPoint = readonly [number, number]

export interface Stroke {
  move(x: number, y: number, pressure: number, exact?: ExactPoint): void
  tick(now: number): void
  finish(x: number, y: number, exact?: ExactPoint): void
}

class FreeStroke implements Stroke {
  private readonly pen: FreePen
  private lastPressure = 0.5

  constructor(
    surface: Surface,
    spec: PenSpec,
    action: FreeAction,
    size: number,
    x: number,
    y: number,
    pressure: number,
    options: FreePenOptions,
  ) {
    this.pen = new FreePen(surface, spec.style ?? 'round', action, size, {
      ...options,
      cleansCorners: true,
    })
    this.pen.begin(x, y, pressure)
  }

  move(x: number, y: number, pressure: number, exact?: ExactPoint): void {
    const [exactX, exactY] = exact ?? [x, y]

    this.lastPressure = pressure
    this.pen.move(exactX, exactY, pressure)
  }

  tick(): void {}

  finish(x: number, y: number, exact?: ExactPoint): void {
    const [exactX, exactY] = exact ?? [x, y]

    this.pen.move(exactX, exactY, this.lastPressure)
    this.pen.end()
  }
}

class DsiStroke implements Stroke {
  private readonly pen: DsiPen
  private clock: number
  private targetX: number
  private targetY: number
  private doneX: number
  private doneY: number
  private count = 1

  constructor(
    surface: Surface,
    brush: number,
    options: DsiPenOptions,
    x: number,
    y: number,
    now: number,
  ) {
    this.pen = new DsiPen(surface, brush, options)
    this.clock = now
    this.targetX = this.doneX = x
    this.targetY = this.doneY = y
    this.pen.down(x, y)
    this.pen.isStarting = true
    this.pen.sample(x, y)
  }

  move(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
  }

  tick(now: number): void {
    let frames = Math.floor((now - this.clock) / FRAME_MS)

    if (frames <= 0) return

    if (frames > MAX_CATCH_UP_FRAMES) {
      frames = MAX_CATCH_UP_FRAMES
      this.clock = now
    } else {
      this.clock += frames * FRAME_MS
    }

    this.advance(frames)
  }

  private advance(frames: number): void {
    const { doneX, doneY, targetX, targetY } = this
    const samples = frames * DSI_SAMPLES_PER_FRAME

    for (let index = 1; index <= samples; index++) {
      const x = Math.round(doneX + ((targetX - doneX) * index) / samples)
      const y = Math.round(doneY + ((targetY - doneY) * index) / samples)

      this.pen.isStarting = this.count < DSI_SAMPLES_PER_FRAME
      this.pen.sample(x, y)
      this.count++
    }

    this.doneX = targetX
    this.doneY = targetY
  }

  finish(x: number, y: number): void {
    this.targetX = x
    this.targetY = y

    if (x !== this.doneX || y !== this.doneY) this.advance(1)

    this.pen.sample(this.doneX, this.doneY)
  }
}

class N3dsStroke implements Stroke {
  private readonly pen: N3dsPen
  private readonly filter = new TouchFilter()
  private clock: number
  private targetX: number
  private targetY: number
  private doneX: number
  private doneY: number
  private frameCount = 0

  constructor(
    surface: Surface,
    kind: N3dsKind,
    tipIndex: number,
    x: number,
    y: number,
    now: number,
  ) {
    this.pen = new N3dsPen(surface, kind, tipIndex)
    this.clock = now
    this.targetX = this.doneX = x
    this.targetY = this.doneY = y
    this.advance(1, now)
  }

  move(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
  }

  tick(now: number): void {
    let frames = Math.floor((now - this.clock) / FRAME_MS)

    if (frames <= 0) return

    if (frames > MAX_CATCH_UP_FRAMES) {
      frames = MAX_CATCH_UP_FRAMES
      this.clock = now
    } else {
      this.clock += frames * FRAME_MS
    }

    this.advance(frames, this.clock)
  }

  private readsInFrame(): number {
    const index = this.frameCount++

    return (
      Math.floor(((index + 1) * FRAME_MS) / TOUCH_READ_MS) -
      Math.floor((index * FRAME_MS) / TOUCH_READ_MS)
    )
  }

  private advance(frames: number, now: number): void {
    const { doneX, doneY, targetX, targetY } = this
    const counts: number[] = []

    for (let frame = 0; frame < frames; frame++) {
      counts.push(this.readsInFrame())
    }

    const total = counts.reduce((sum, count) => sum + count, 0)
    let index = 0

    for (let frame = 0; frame < frames; frame++) {
      const raw: TouchSample[] = []

      for (let read = 0; read < counts[frame]; read++) {
        index++
        raw.push({
          x:
            Math.round(doneX + ((targetX - doneX) * index) / total) +
            N3DS_BORDER,
          y:
            Math.round(doneY + ((targetY - doneY) * index) / total) +
            N3DS_BORDER,
          isTouching: true,
        })
      }

      const time = now - (frames - 1 - frame) * FRAME_MS

      this.apply(this.filter.frame(raw, time, this.pen.repeatsPoints))
    }

    this.doneX = targetX
    this.doneY = targetY
  }

  private apply(points: ReturnType<TouchFilter['frame']>): void {
    for (const point of points) {
      const x = point.x - N3DS_BORDER
      const y = point.y - N3DS_BORDER

      if (point.isStart) this.pen.begin(x, y)
      else this.pen.step(x, y)
    }
  }

  finish(x: number, y: number): void {
    this.targetX = x
    this.targetY = y

    if (x !== this.doneX || y !== this.doneY) {
      this.clock += FRAME_MS
      this.advance(1, this.clock)
    }

    this.apply(
      this.filter.flush(
        this.clock + FRAME_MS,
        this.pen.repeatsPoints,
        FRAME_MS,
      ),
    )
  }
}

export interface StrokeRequest {
  surface: Surface
  spec: PenSpec
  kind: StrokeKind
  size: number
  patternErase: boolean
  x: number
  y: number
  exact?: ExactPoint
  pressure: number
  now: number
  isSmooth?: boolean
  usesPressure?: boolean
}

function dsiBrushFor(request: StrokeRequest): {
  brush: number
  options: DsiPenOptions
} {
  const { spec, kind, patternErase } = request

  if (kind === 'paint') {
    return { brush: DsiBrush.paint, options: { paintRadius: spec.code } }
  }

  return { brush: spec.code, options: { patternErase } }
}

export function startStroke(request: StrokeRequest): Stroke {
  const { surface, spec, kind, x, y, now, pressure } = request

  if (spec.engine === 'dsi') {
    const { brush, options } = dsiBrushFor(request)

    return new DsiStroke(surface, brush, options, x, y, now)
  }

  if (spec.engine === '3ds') {
    const n3dsKind =
      kind === 'pen'
        ? N3dsKind.pen
        : kind === 'eraser'
          ? N3dsKind.eraser
          : N3dsKind.paint

    const tip =
      kind === 'pen'
        ? n3dsPenIndex(spec.code)
        : kind === 'eraser' && request.patternErase
          ? spec.code + 8
          : spec.code

    return new N3dsStroke(surface, n3dsKind, tip, x, y, now)
  }

  const action: FreeAction =
    kind === 'pen' ? 'draw' : kind === 'eraser' ? 'erase' : 'paint'

  const [startX, startY] = request.exact ?? [x, y]

  return new FreeStroke(
    surface,
    spec,
    action,
    request.size,
    startX,
    startY,
    pressure,
    {
      isSmooth: request.isSmooth,
      usesPressure: request.usesPressure,
      erasesPattern: request.patternErase,
    },
  )
}
