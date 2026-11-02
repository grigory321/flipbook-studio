import { type PenSpec, startStroke, type StrokeKind } from '../../app/pens.ts'
import { TileGrid } from '../../core/cel.ts'
import { COVERAGE_FULL, valueCoverage } from '../../core/ink.ts'
import { type Pattern, PATTERN_SOLID, patternBit } from '../../core/patterns.ts'
import { Surface } from '../../core/surface.ts'
import { dsiRandomState, seedDsiRandom } from '../../draw/pen-dsi.ts'
import { loadN3dsRandom, saveN3dsRandom } from '../../draw/pen-3ds.ts'
import { type ShapeKind, shapeOutline } from '../../draw/shapes.ts'
import { h, icon } from '../dom.ts'

const PREVIEW_WIDTH = 56
const PREVIEW_HEIGHT = 32
const FRAME_MS = 1000 / 60
const PREVIEW_STEPS = 22
const DRAW_COLOR = 0xff3c2410

function curvePoint(step: number): [number, number] {
  const ratio = step / PREVIEW_STEPS
  const x = 6 + ratio * (PREVIEW_WIDTH - 12)
  const y = PREVIEW_HEIGHT / 2 + Math.sin(ratio * Math.PI * 2) * 8

  return [Math.round(x), Math.round(y)]
}

const SHAPE_INSET = 3.5
const SHAPE_SPAN = 17

export function shapePreview(kind: ShapeKind): SVGSVGElement {
  if (kind === 'line' || kind === 'rect' || kind === 'oval') return icon(kind)

  const svg = icon('rect')
  const place = (value: number): string =>
    (SHAPE_INSET + value * SHAPE_SPAN).toFixed(1)
  const points = shapeOutline(kind).map(([x, y]) => `${place(x)} ${place(y)}`)

  svg.querySelector('path')?.setAttribute('d', `M${points.join('L')}z`)

  return svg
}

const previewCache = new Map<string, HTMLCanvasElement>()

export function penPreview(
  spec: PenSpec,
  kind: StrokeKind,
  size: number,
): HTMLCanvasElement {
  const cacheKey = `${spec.id}:${kind}:${spec.engine === 'free' ? size : 0}`
  const cached = previewCache.get(cacheKey)
  const canvas = cached ?? drawPenPreview(spec, kind, size)

  previewCache.set(cacheKey, canvas)

  const copy = h('canvas', {
    class: 'pen-preview',
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  })

  copy.getContext('2d')?.drawImage(canvas, 0, 0)

  return copy
}

function drawPenPreview(
  spec: PenSpec,
  kind: StrokeKind,
  size: number,
  pattern: Pattern = PATTERN_SOLID,
): HTMLCanvasElement {
  const canvas = h('canvas', {
    class: 'pen-preview',
    width: PREVIEW_WIDTH,
    height: PREVIEW_HEIGHT,
  })

  const grid = new TileGrid(PREVIEW_WIDTH, PREVIEW_HEIGHT)
  const plane = new Uint8Array(PREVIEW_WIDTH * PREVIEW_HEIGHT)
  const surface = new Surface(grid, plane)

  surface.pattern = pattern

  if (kind === 'eraser') {
    plane.fill(1)
  }

  const savedDsi = dsiRandomState()
  const savedN3ds = saveN3dsRandom()
  const [startX, startY] = curvePoint(0)
  let now = 0

  seedDsiRandom(0x1f01)

  const stroke = startStroke({
    surface,
    spec,
    kind,
    size,
    patternErase: false,
    x: startX,
    y: startY,
    pressure: 0.6,
    now,
    isSmooth: spec.engine === 'free',
  })

  for (let step = 1; step <= PREVIEW_STEPS; step++) {
    const [x, y] = curvePoint(step)

    now += FRAME_MS
    stroke.move(x, y, 0.3 + (step / PREVIEW_STEPS) * 0.6)
    stroke.tick(now)
  }

  stroke.finish(...curvePoint(PREVIEW_STEPS))

  seedDsiRandom(savedDsi)
  loadN3dsRandom(savedN3ds)

  const context = canvas.getContext('2d')

  if (context) {
    const words = new Uint32Array(plane.length)

    plane.forEach((value, index) => {
      const coverage = valueCoverage(value)
      const shown = kind === 'eraser' ? COVERAGE_FULL - coverage : coverage
      const alpha = Math.round((shown * 255) / COVERAGE_FULL)

      words[index] = ((DRAW_COLOR & 0xffffff) | (alpha << 24)) >>> 0
    })

    const pixels = new Uint8ClampedArray(words.buffer)

    context.putImageData(
      new ImageData(pixels, PREVIEW_WIDTH, PREVIEW_HEIGHT),
      0,
      0,
    )
  }

  return canvas
}

const PATTERN_PREVIEW_SIZE = 24

export function patternPreview(
  pattern: Pattern,
  phase: number,
): HTMLCanvasElement {
  const canvas = h('canvas', {
    class: 'pattern-preview',
    width: PATTERN_PREVIEW_SIZE,
    height: PATTERN_PREVIEW_SIZE,
  })

  const context = canvas.getContext('2d')

  if (context) {
    const words = new Uint32Array(PATTERN_PREVIEW_SIZE * PATTERN_PREVIEW_SIZE)

    for (let y = 0; y < PATTERN_PREVIEW_SIZE; y++) {
      for (let x = 0; x < PATTERN_PREVIEW_SIZE; x++) {
        if (patternBit(pattern, x + phase, y + phase)) {
          words[y * PATTERN_PREVIEW_SIZE + x] = DRAW_COLOR
        }
      }
    }

    context.putImageData(
      new ImageData(
        new Uint8ClampedArray(words.buffer),
        PATTERN_PREVIEW_SIZE,
        PATTERN_PREVIEW_SIZE,
      ),
      0,
      0,
    )
  }

  return canvas
}
