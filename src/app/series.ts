import { loadPlane } from '../core/cel.ts'
import { EMPTY_REF } from '../core/store.ts'
import { fullMask } from '../draw/mask.ts'
import { WarpField } from '../draw/warp.ts'
import type { Editor } from './editor.ts'
import { type Floating, type FloatPoint, liftMask } from './floating.ts'
import { easeAt, type MotionEase, motionAt, type MotionPath } from './motion.ts'

export type WobbleKind = 'line' | 'whole'

export interface WobbleOptions {
  count: number
  strength: number
  kind: WobbleKind
}

const WOBBLE_CYCLE = 3

const WOBBLE_SHAPES: Readonly<
  Record<WobbleKind, readonly (readonly [number, number])[]>
> = {
  line: [
    [30, 0.8],
    [24, 1.2],
    [20, 1.7],
  ],
  whole: [
    [110, 1.6],
    [90, 2.6],
    [72, 3.6],
  ],
}

const SEED_STEP = 0x9e3779b9

export function sourcePlanes(editor: Editor): (Uint8Array | null)[] {
  const { frames, grid, meta, store } = editor.note
  const page = editor.page.peek()
  const scratch = new Uint32Array(grid.count)
  const planes: (Uint8Array | null)[] = []

  for (let layer = 0; layer < frames.layers; layer++) {
    const ref = frames.cel(page, layer)

    if (ref === EMPTY_REF) {
      planes.push(null)

      continue
    }

    const plane = new Uint8Array(meta.width * meta.height)

    loadPlane(store, ref, plane, grid, scratch)
    planes.push(plane)
  }

  return planes
}

export function wobbleVariants(
  editor: Editor,
  planes: readonly (Uint8Array | null)[],
  kind: WobbleKind,
  strength: number,
): (Uint8Array | null)[][] {
  const { meta, profile } = editor.note
  const { width, height } = meta
  const hasCoverage = profile.inkSlots === 0
  const page = editor.page.peek()
  const field = new WarpField(width, height)
  const [wavelength, amplitude] = WOBBLE_SHAPES[kind][strength]
  const variants: (Uint8Array | null)[][] = [planes.slice()]

  for (let variant = 1; variant < WOBBLE_CYCLE; variant++) {
    field.fillNoise(
      Math.imul(page + 1, 31) + Math.imul(variant, SEED_STEP),
      wavelength,
      amplitude,
    )
    variants.push(
      planes.map(plane => {
        if (!plane) return null

        const moved = new Uint8Array(plane.length)

        field.resample(plane, moved, hasCoverage)

        return moved
      }),
    )
  }

  return variants
}

export function insertWobble(editor: Editor, options: WobbleOptions): boolean {
  if (!editor.canAddPages(options.count)) return false

  editor.dropFloating()

  const { frames } = editor.note
  const { stride, layers } = frames
  const page = editor.page.peek()
  const source = frames.copyRows(page, 1)
  const variants = wobbleVariants(
    editor,
    sourcePlanes(editor),
    options.kind,
    options.strength,
  )
  const cycle = variants.map((planes, variant) => {
    const row = source.slice()

    frames.clearRowSounds(row)

    if (variant === 0) return row

    for (let layer = 0; layer < layers; layer++) {
      const plane = planes[layer]

      if (plane) row[layer] = editor.packPlane(source[layer], plane)
    }

    return row
  })
  const rows = new Uint32Array(options.count * stride)

  for (let index = 0; index < options.count; index++) {
    rows.set(cycle[(index + 1) % WOBBLE_CYCLE], index * stride)
  }

  editor.replacePages(page + 1, 0, rows, page + 1)

  return true
}

export type MotionMode = 'add' | 'overlay'

export interface MotionOptions {
  path: MotionPath
  count: number
  ease: MotionEase
  follows: boolean
  finalScale: number
  mode: MotionMode
  returns: boolean
  allLayers: boolean
}

export interface Mover {
  layers: number[]
  sprite: Floating
  home: FloatPoint
}

export function placeMover(
  mover: Mover,
  pivot: FloatPoint,
  options: MotionOptions,
  step: number,
): void {
  const progress = step / options.count
  const travel = options.returns ? 1 - Math.abs(progress * 2 - 1) : progress
  const ratio = easeAt(options.ease, travel)
  const [offsetX, offsetY, turn] = motionAt(options.path, ratio)
  const scale = 1 + (options.finalScale - 1) * ratio
  const angle = options.follows ? turn : 0
  const awayX = mover.home[0] - pivot[0]
  const awayY = mover.home[1] - pivot[1]
  const cos = Math.cos(angle) * scale
  const sin = Math.sin(angle) * scale

  mover.sprite.place(
    pivot[0] + offsetX + awayX * cos - awayY * sin,
    pivot[1] + offsetY + awayX * sin + awayY * cos,
    scale,
    angle,
  )
}

export function liftLayers(
  planes: readonly Uint8Array[],
  taken: readonly number[],
  width: number,
  height: number,
): Mover[] {
  const mask = fullMask(width, height)

  return planes.flatMap((plane, layer) => {
    if (taken.includes(layer)) return []

    const sprite = liftMask([plane], width, height, mask)

    return sprite ? [{ layers: [layer], sprite, home: sprite.center }] : []
  })
}

export async function buildMotion(
  editor: Editor,
  options: MotionOptions,
): Promise<boolean> {
  const lifted = editor.floating.peek()

  if (!lifted) return false

  const { note } = editor
  const { frames, grid, meta, store } = note
  const { stride, layers } = frames
  const page = editor.page.peek()
  const available = frames.count - page - 1
  const reused =
    options.mode === 'overlay' ? Math.min(available, options.count) : 0

  if (!editor.canAddPages(options.count - reused)) return false

  await note.ensurePages(page + 1, reused)

  const sprite = lifted.bake()
  const main: Mover = {
    layers: editor.selectionLayers(),
    sprite,
    home: sprite.center,
  }
  const movers = options.allLayers
    ? [main, ...liftLayers(editor.planes, main.layers, meta.width, meta.height)]
    : [main]

  for (const mover of movers) mover.sprite.isSmooth = sprite.isSmooth

  const targetLayers = movers.flatMap(mover => mover.layers)
  const holeCels = targetLayers.map(layer =>
    editor.packPlane(frames.cel(page, layer), editor.planes[layer].slice()),
  )
  const scratch = new Uint32Array(grid.count)
  const rows = new Uint32Array(options.count * stride)
  const base = frames.copyRows(page, 1)
  const pixels = meta.width * meta.height
  const working = targetLayers.map(() => new Uint8Array(pixels))

  frames.clearRowSounds(base)

  for (let step = 1; step <= options.count; step++) {
    const row = rows.subarray((step - 1) * stride, step * stride)
    const isReused = step <= reused

    row.set(isReused ? frames.copyRows(page + step, 1) : base)

    targetLayers.forEach((layer, order) => {
      if (!isReused) row[layer] = holeCels[order]

      if (row[layer] === EMPTY_REF) working[order].fill(0)
      else loadPlane(store, row[layer], working[order], grid, scratch)
    })

    for (const mover of movers) {
      placeMover(mover, main.home, options, step)
      mover.sprite.stamp(
        mover.layers.map(layer => working[targetLayers.indexOf(layer)]),
        meta.width,
        meta.height,
      )
    }

    targetLayers.forEach((layer, order) => {
      row[layer] = editor.packPlane(row[layer], working[order])
    })
  }

  editor.discardFloating()
  editor.replacePages(page + 1, reused, rows, page + 1)

  return layers > 0
}

export type RangeAction =
  'reverse' | 'pingPong' | 'repeat' | 'stretch' | 'delete'

export function arrangeRows(
  rows: Uint32Array,
  stride: number,
  action: RangeAction,
  times: number,
): Uint32Array {
  const count = rows.length / stride
  const order: number[] = []

  if (action === 'reverse') {
    for (let page = count - 1; page >= 0; page--) order.push(page)
  } else if (action === 'pingPong') {
    for (let page = 0; page < count; page++) order.push(page)
    for (let page = count - 2; page > 0; page--) order.push(page)
  } else if (action === 'repeat') {
    for (let turn = 0; turn < times; turn++) {
      for (let page = 0; page < count; page++) order.push(page)
    }
  } else if (action === 'stretch') {
    for (let page = 0; page < count; page++) {
      for (let turn = 0; turn < times; turn++) order.push(page)
    }
  }

  const result = new Uint32Array(order.length * stride)

  order.forEach((page, index) => {
    result.set(
      rows.subarray(page * stride, (page + 1) * stride),
      index * stride,
    )
  })

  return result
}

export function applyRange(
  editor: Editor,
  first: number,
  last: number,
  action: RangeAction,
  times: number,
): boolean {
  const { frames } = editor.note

  editor.dropFloating()

  const count = last - first + 1
  const source = frames.copyRows(first, count)
  const rows = arrangeRows(source, frames.stride, action, times)
  const added = rows.length / frames.stride - count

  if (!editor.canAddPages(added)) return false

  if (action === 'delete' && count === frames.count) {
    editor.goToFirstAndClear()

    return true
  }

  editor.replacePages(first, count, rows, Math.min(first, frames.count - 1))

  return true
}
