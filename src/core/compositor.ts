import { readTile, unpackCel } from './cel.ts'
import { depthOf } from './frames.ts'
import { blendOver, COVERAGE_FULL } from './ink.ts'
import { type Note, resolveInk } from './note.ts'
import { type Profile, rgbaWord } from './profile.ts'
import { EMPTY_REF, isUniform, uniformValue } from './store.ts'
import { TILE_PIXELS, TILE_SIZE } from './tile.ts'

export interface Region {
  left: number
  top: number
  right: number
  bottom: number
}

const LUT_SIZE = 256
const OPAQUE_REST = 1 / 512

export class Compositor {
  readonly width: number
  readonly height: number
  readonly pixels: Uint32Array<ArrayBuffer>

  private readonly note: Note
  private readonly luts: Uint32Array[] = []
  private readonly order: number[] = []
  private readonly tileBuffers: Uint8Array[] = []
  private readonly sources: Uint8Array[] = []
  private readonly sourceLuts: Uint32Array[] = []
  private readonly celTiles: Uint32Array[] = []
  private readonly shownTiles: Uint32Array[] = []
  private shownInks = -1
  private shownPaper = -1
  private shownDepths = -1
  private shownVisible = -1
  private hasShown = false

  constructor(note: Note, pixels?: Uint32Array<ArrayBuffer>) {
    const { width, height, count } = note.grid

    this.note = note
    this.width = width
    this.height = height
    this.pixels = pixels ?? new Uint32Array(width * height)

    for (let layer = 0; layer < note.profile.maxLayers; layer++) {
      this.luts.push(new Uint32Array(LUT_SIZE))
      this.tileBuffers.push(new Uint8Array(TILE_PIXELS))
      this.celTiles.push(new Uint32Array(count))
      this.shownTiles.push(new Uint32Array(count))
    }
  }

  invalidate(): void {
    this.hasShown = false
  }

  private prepare(page: number): void {
    const { frames, meta, profile } = this.note
    const inks = frames.inks(page)
    const paper = frames.paper(page)
    const depths = frames.depths(page)
    const layers = frames.layers

    for (let layer = 0; layer < layers; layer++) {
      fillLut(this.luts[layer], profile, meta.palette, inks, paper, layer)
    }

    this.order.length = 0

    for (let layer = 0; layer < layers; layer++) this.order.push(layer)

    if (profile.id === '3ds') {
      this.order.sort((a, b) => depthOf(depths, a) - depthOf(depths, b))
    }
  }

  private visibleMask(): number {
    let mask = 0

    this.note.meta.layers.forEach((layer, index) => {
      if (layer.visible) mask |= 1 << index
    })

    return mask
  }

  composeRegion(page: number, planes: Uint8Array[], region: Region): void {
    this.prepare(page)

    const { left, top, right, bottom } = region
    const { meta } = this.note
    let count = 0

    for (const layer of this.order) {
      if (!meta.layers[layer].visible) continue

      this.sources[count] = planes[layer]
      this.sourceLuts[count] = this.luts[layer]
      count++
    }

    const { pixels, sources, sourceLuts, width } = this

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const index = y * width + x

        pixels[index] = stackPixel(sources, sourceLuts, count, index)
      }
    }

    this.hasShown = false
  }

  composePage(page: number, planes?: Uint8Array[]): Region | null {
    const { frames, grid, store } = this.note
    const layers = frames.layers
    const inks = frames.inks(page)
    const paper = frames.paper(page)
    const depths = frames.depths(page)
    const visible = this.visibleMask()
    const canSkip =
      this.hasShown &&
      inks === this.shownInks &&
      paper === this.shownPaper &&
      depths === this.shownDepths &&
      visible === this.shownVisible

    this.prepare(page)

    for (let layer = 0; layer < layers; layer++) {
      unpackCel(store, frames.cel(page, layer), this.celTiles[layer])
    }

    const changed: Region = {
      left: this.width,
      top: this.height,
      right: -1,
      bottom: -1,
    }

    for (let tile = 0; tile < grid.count; tile++) {
      if (canSkip && this.isSameTile(tile, layers)) continue

      this.composeTile(tile, planes)
      growRegion(changed, tile, grid.columns, this.width, this.height)
    }

    for (let layer = 0; layer < layers; layer++) {
      this.shownTiles[layer].set(this.celTiles[layer])
    }

    this.shownInks = inks
    this.shownPaper = paper
    this.shownDepths = depths
    this.shownVisible = visible
    this.hasShown = true

    return changed.right < 0 ? null : changed
  }

  private isSameTile(tile: number, layers: number): boolean {
    for (let layer = 0; layer < layers; layer++) {
      if (this.celTiles[layer][tile] !== this.shownTiles[layer][tile]) {
        return false
      }
    }

    return true
  }

  private composeTile(tile: number, planes?: Uint8Array[]): void {
    const { grid, meta, store } = this.note
    const column = tile % grid.columns
    const row = (tile - column) / grid.columns
    const left = column * TILE_SIZE
    const top = row * TILE_SIZE
    const columns = Math.min(TILE_SIZE, this.width - left)
    const lines = Math.min(TILE_SIZE, this.height - top)
    let count = 0

    for (const layer of this.order) {
      const ref = this.celTiles[layer][tile]

      if (ref === EMPTY_REF || !meta.layers[layer].visible) continue

      const plane = planes?.[layer]

      if (plane) {
        this.sources[count] = plane
      } else {
        const buffer = this.tileBuffers[layer]

        if (isUniform(ref)) buffer.fill(uniformValue(ref))
        else readTile(store, ref, buffer)

        this.sources[count] = buffer
      }

      this.sourceLuts[count] = this.luts[layer]
      count++
    }

    const { pixels, sources, sourceLuts, width } = this

    for (let line = 0; line < lines; line++) {
      const target = (top + line) * width + left
      const source = planes ? target : line * TILE_SIZE

      if (count === 0) {
        pixels.fill(0, target, target + columns)

        continue
      }

      for (let x = 0; x < columns; x++) {
        pixels[target + x] = stackPixel(sources, sourceLuts, count, source + x)
      }
    }
  }
}

function stackPixel(
  sources: Uint8Array[],
  luts: Uint32Array[],
  count: number,
  index: number,
): number {
  let red = 0
  let green = 0
  let blue = 0
  let clear = 1

  for (let rank = 0; rank < count; rank++) {
    const value = sources[rank][index]

    if (!value) continue

    const word = luts[rank][value]
    const alpha = word >>> 24

    if (alpha === 0) continue
    if (alpha === 255 && clear === 1) return word

    const weight = (alpha / 255) * clear

    red += (word & 255) * weight
    green += ((word >>> 8) & 255) * weight
    blue += ((word >>> 16) & 255) * weight
    clear -= weight

    if (clear < OPAQUE_REST) {
      clear = 0
      break
    }
  }

  if (clear === 1) return 0

  const cover = 1 - clear

  return (
    (((cover * 255 + 0.5) << 24) |
      ((blue / cover + 0.5) << 16) |
      ((green / cover + 0.5) << 8) |
      (red / cover + 0.5)) >>>
    0
  )
}

function fillLut(
  lut: Uint32Array,
  profile: Profile,
  palette: readonly (readonly [number, number, number])[],
  inks: number,
  paper: number,
  layer: number,
): void {
  lut.fill(0)

  if (profile.inkSlots === 0) {
    for (let index = 0; index < palette.length; index++) {
      const word = rgbaWord(palette[index])

      lut[index + 1] = word

      for (let level = 1; level < COVERAGE_FULL; level++) {
        const alpha = Math.round((level * 255) / COVERAGE_FULL)

        lut[(level << 4) | (index + 1)] =
          ((word & 0xffffff) | (alpha << 24)) >>> 0
      }
    }

    return
  }

  for (let slot = 0; slot < profile.inkSlots; slot++) {
    const code = (inks >>> (layer * 8 + slot * 4)) & 0xf
    const color = resolveInk(profile, paper, code)

    lut[slot + 1] = color ? rgbaWord(color) : 0
  }
}

function growRegion(
  region: Region,
  tile: number,
  columns: number,
  width: number,
  height: number,
): void {
  const column = tile % columns
  const row = (tile - column) / columns
  const left = column * TILE_SIZE
  const top = row * TILE_SIZE
  const right = Math.min(width, left + TILE_SIZE) - 1
  const bottom = Math.min(height, top + TILE_SIZE) - 1

  if (left < region.left) region.left = left
  if (top < region.top) region.top = top
  if (right > region.right) region.right = right
  if (bottom > region.bottom) region.bottom = bottom
}

export function shrinkPixels(
  source: Uint32Array,
  sourceWidth: number,
  sourceHeight: number,
  paper: number,
  target: Uint32Array,
  targetWidth: number,
  targetHeight: number,
): void {
  const count = targetWidth * targetHeight
  const red = new Uint32Array(count)
  const green = new Uint32Array(count)
  const blue = new Uint32Array(count)
  const weight = new Uint32Array(count)

  for (let y = 0; y < sourceHeight; y++) {
    const row = Math.floor((y * targetHeight) / sourceHeight)

    for (let x = 0; x < sourceWidth; x++) {
      const column = Math.floor((x * targetWidth) / sourceWidth)
      const index = row * targetWidth + column
      const word = blendOver(source[y * sourceWidth + x], paper)

      red[index] += word & 0xff
      green[index] += (word >>> 8) & 0xff
      blue[index] += (word >>> 16) & 0xff
      weight[index]++
    }
  }

  for (let index = 0; index < count; index++) {
    const share = weight[index] || 1

    target[index] =
      ((255 << 24) |
        (Math.round(blue[index] / share) << 16) |
        (Math.round(green[index] / share) << 8) |
        Math.round(red[index] / share)) >>>
      0
  }
}
