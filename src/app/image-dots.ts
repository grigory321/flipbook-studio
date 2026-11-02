import type { Rgb } from '../core/profile.ts'

export type DotMode = 'tone' | 'line' | 'color'

export interface DotOptions {
  mode: DotMode
  level: number
  dithers: boolean
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const BAYER_SIZE = 4
const DITHER_AMOUNT = 0.6
const SOLID_ALPHA = 128

function luminance(rgba: Uint8ClampedArray, index: number): number {
  return rgba[index] * 0.299 + rgba[index + 1] * 0.587 + rgba[index + 2] * 0.114
}

function toTone(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: DotOptions,
  ink: number,
  out: Uint8Array,
): void {
  const threshold = options.level * 2.55
  const amount = options.dithers ? 255 * DITHER_AMOUNT : 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x

      if (rgba[index * 4 + 3] < SOLID_ALPHA) continue

      const cell = BAYER[(y % BAYER_SIZE) * BAYER_SIZE + (x % BAYER_SIZE)]
      const offset = (cell / BAYER.length - 0.5) * amount

      if (luminance(rgba, index * 4) + offset < threshold) out[index] = ink
    }
  }
}

function toLine(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: DotOptions,
  ink: number,
  out: Uint8Array,
): void {
  const bright = new Float32Array(width * height)

  for (let index = 0; index < bright.length; index++) {
    bright[index] = luminance(rgba, index * 4)
  }

  const limit = 255 * (1 - options.level / 100) + 8

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const at = y * width + x
      const up = at - width
      const down = at + width
      const slopeX =
        bright[up + 1] +
        bright[at + 1] * 2 +
        bright[down + 1] -
        bright[up - 1] -
        bright[at - 1] * 2 -
        bright[down - 1]
      const slopeY =
        bright[down - 1] +
        bright[down] * 2 +
        bright[down + 1] -
        bright[up - 1] -
        bright[up] * 2 -
        bright[up + 1]

      if (Math.hypot(slopeX, slopeY) / 4 > limit) out[at] = ink
    }
  }
}

function nearestColor(
  palette: readonly Rgb[],
  red: number,
  green: number,
  blue: number,
): number {
  let best = 0
  let bestDistance = Infinity

  palette.forEach(([r, g, b], index) => {
    const distance = (r - red) ** 2 + (g - green) ** 2 + (b - blue) ** 2

    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })

  return best
}

function toColor(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: DotOptions,
  palette: readonly Rgb[],
  out: Uint8Array,
): void {
  const channels = Float32Array.from(rgba)
  const spread = options.dithers ? 1 : 0
  const push = (x: number, y: number, errors: number[], part: number): void => {
    if (x < 0 || y >= height || x >= width) return

    const index = (y * width + x) * 4

    errors.forEach((error, channel) => {
      channels[index + channel] += (error * part * spread) / 16
    })
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4

      if (rgba[index + 3] < SOLID_ALPHA) continue

      const red = channels[index]
      const green = channels[index + 1]
      const blue = channels[index + 2]
      const found = nearestColor(palette, red, green, blue)
      const [r, g, b] = palette[found]
      const errors = [red - r, green - g, blue - b]

      out[y * width + x] = found + 1
      push(x + 1, y, errors, 7)
      push(x - 1, y + 1, errors, 3)
      push(x, y + 1, errors, 5)
      push(x + 1, y + 1, errors, 1)
    }
  }
}

export function toDots(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: DotOptions,
  ink: number,
  palette: readonly Rgb[],
): Uint8Array {
  const out = new Uint8Array(width * height)

  if (options.mode === 'line') toLine(rgba, width, height, options, ink, out)
  else if (options.mode === 'color') {
    toColor(rgba, width, height, options, palette, out)
  } else toTone(rgba, width, height, options, ink, out)

  return out
}
