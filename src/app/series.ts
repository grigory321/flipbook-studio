import { loadPlane } from '../core/cel.ts'
import { EMPTY_REF } from '../core/store.ts'
import { WarpField } from '../draw/warp.ts'
import type { Editor } from './editor.ts'
import type { Floating } from './floating.ts'
import { easeAt, type MotionEase, motionAt, type MotionPath } from './motion.ts'

export type WobbleKind = 'line' | 'whole'

export interface WobbleOptions {
  count: number
  strength: number
  kind: WobbleKind
}

const WOBBLE_SHAPES: Readonly<
  Record<WobbleKind, readonly (readonly [number, number])[]>
> = {
  line: [
    [8, 0.75],
    [7, 1.05],
    [6, 1.4],
  ],
  whole: [
    [40, 1.6],
    [34, 2.2],
    [28, 3],
  ],
}

const SEED_STEP = 0x9e3779b9

export async function insertWobble(
  editor: Editor,
  options: WobbleOptions,
): Promise<boolean> {
  const { note } = editor
  const { frames, grid, meta, store } = note
  const page = editor.page.peek()

  if (!editor.canAddPages(options.count)) return false

  editor.dropFloating()

  const { stride, layers } = frames
  const source = frames.copyRows(page, 1)
  const rows = new Uint32Array(options.count * stride)
  const plain = new Uint8Array(meta.width * meta.height)
  const moved = new Uint8Array(meta.width * meta.height)
  const scratch = new Uint32Array(grid.count)
  const field = new WarpField(meta.width, meta.height)
  const [wavelength, amplitude] = WOBBLE_SHAPES[options.kind][options.strength]

  for (let index = 0; index < options.count; index++) {
    const row = rows.subarray(index * stride, (index + 1) * stride)

    row.set(source)
    frames.clearRowSounds(row)
    field.fillNoise(
      Math.imul(page + 1, 31) + Math.imul(index + 1, SEED_STEP),
      wavelength,
      amplitude,
    )

    for (let layer = 0; layer < layers; layer++) {
      if (source[layer] === EMPTY_REF) continue

      loadPlane(store, source[layer], plain, grid, scratch)
      field.apply(plain, moved)
      row[layer] = editor.packPlane(source[layer], moved)
    }
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
}

export function placeOnPath(
  floating: Floating,
  start: readonly [number, number],
  options: MotionOptions,
  step: number,
): void {
  const ratio = easeAt(options.ease, step / options.count)
  const [offsetX, offsetY, turn] = motionAt(options.path, ratio)

  floating.place(
    start[0] + offsetX,
    start[1] + offsetY,
    1 + (options.finalScale - 1) * ratio,
    options.follows ? turn : 0,
  )
}

export async function buildMotion(
  editor: Editor,
  options: MotionOptions,
): Promise<boolean> {
  const lifted = editor.floating.peek()

  if (!lifted) return false

  const floating = lifted.bake()
  const { note } = editor
  const { frames, grid, meta, store } = note
  const { stride, layers } = frames
  const page = editor.page.peek()
  const available = frames.count - page - 1
  const reused =
    options.mode === 'overlay' ? Math.min(available, options.count) : 0

  if (!editor.canAddPages(options.count - reused)) return false

  await note.ensurePages(page + 1, reused)

  const start = floating.center
  const targets = editor.selectionPlanes()
  const targetLayers = editor.selectionLayers()
  const holes = targets.map(plane => plane.slice())
  const holeCels = targetLayers.map((layer, order) =>
    editor.packPlane(frames.cel(page, layer), holes[order]),
  )
  const scratch = new Uint32Array(grid.count)
  const rows = new Uint32Array(options.count * stride)
  const base = frames.copyRows(page, 1)
  const pixels = meta.width * meta.height
  const working = targets.map(() => new Uint8Array(pixels))

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

    placeOnPath(floating, start, options, step)
    floating.stamp(working, meta.width, meta.height)

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
  const count = last - first + 1
  const source = frames.copyRows(first, count)
  const rows = arrangeRows(source, frames.stride, action, times)
  const added = rows.length / frames.stride - count

  if (!editor.canAddPages(added)) return false

  if (action === 'delete' && count === frames.count) {
    editor.goToFirstAndClear()

    return true
  }

  editor.dropFloating()
  editor.replacePages(first, count, rows, Math.min(first, frames.count - 1))

  return true
}
