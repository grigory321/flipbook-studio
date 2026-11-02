import { PROFILES, N3DS_ADVANCED_PAIRS, type Rgb } from '../core/profile.ts'

const DSI_COLORS = PROFILES.dsi.colors
const N3DS_COLORS = PROFILES['3ds'].colors

export function nearestColor(
  red: number,
  green: number,
  blue: number,
  colors: readonly Rgb[],
): number {
  let best = 0
  let bestError = Infinity

  for (let index = 0; index < colors.length; index++) {
    const color = colors[index]
    const r = red - color[0]
    const g = green - color[1]
    const b = blue - color[2]
    const error = r * r * 2 + g * g * 4 + b * b

    if (error < bestError) {
      bestError = error
      best = index
    }
  }

  return best
}

export interface PpmPlanes {
  layers: [Uint8Array, Uint8Array]
  pens: [number, number]
}

export function quantizeForPpm(
  rgba: Uint32Array,
  paperIsWhite: boolean,
): PpmPlanes {
  const inverse = DSI_COLORS[paperIsWhite ? 1 : 0]
  const candidates: readonly Rgb[] = [inverse, DSI_COLORS[2], DSI_COLORS[3]]
  const counts = [0, 0, 0]
  const nearest = new Int8Array(rgba.length).fill(-1)

  for (let index = 0; index < rgba.length; index++) {
    const word = rgba[index]

    if (word >>> 24 < 128) continue

    const color = nearestColor(
      word & 0xff,
      (word >>> 8) & 0xff,
      (word >>> 16) & 0xff,
      candidates,
    )

    nearest[index] = color
    counts[color]++
  }

  const ranked = [0, 1, 2].sort((a, b) => counts[b] - counts[a])
  const first = ranked[0]
  const second = ranked[1]
  const layers: [Uint8Array, Uint8Array] = [
    new Uint8Array(rgba.length),
    new Uint8Array(rgba.length),
  ]

  for (let index = 0; index < rgba.length; index++) {
    const color = nearest[index]

    if (color < 0) continue

    layers[color === second ? 1 : 0][index] = 1
  }

  return { layers, pens: [first + 1, second + 1] }
}

export interface KwzPlanes {
  layers: [Uint8Array, Uint8Array, Uint8Array]
  colors: [number, number, number, number, number, number]
}

export function quantizeForKwz(rgba: Uint32Array): KwzPlanes {
  const layerOf = new Int8Array(N3DS_COLORS.length)
  const slotOf = new Int8Array(N3DS_COLORS.length)

  N3DS_ADVANCED_PAIRS.forEach((pair, layer) => {
    pair.forEach((color, slot) => {
      layerOf[color] = layer
      slotOf[color] = slot
    })
  })

  const layers: [Uint8Array, Uint8Array, Uint8Array] = [
    new Uint8Array(rgba.length),
    new Uint8Array(rgba.length),
    new Uint8Array(rgba.length),
  ]

  for (let index = 0; index < rgba.length; index++) {
    const word = rgba[index]

    if (word >>> 24 < 128) continue

    const color = nearestColor(
      word & 0xff,
      (word >>> 8) & 0xff,
      (word >>> 16) & 0xff,
      N3DS_COLORS,
    )

    layers[layerOf[color]][index] = slotOf[color] + 1
  }

  const pairs = N3DS_ADVANCED_PAIRS

  return {
    layers,
    colors: [
      pairs[0][0],
      pairs[0][1],
      pairs[1][0],
      pairs[1][1],
      pairs[2][0],
      pairs[2][1],
    ],
  }
}

export function fitPixels(
  source: Uint32Array,
  sourceWidth: number,
  sourceHeight: number,
  target: Uint32Array,
  targetWidth: number,
  targetHeight: number,
): void {
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight)
  const width = Math.max(1, Math.round(sourceWidth * scale))
  const height = Math.max(1, Math.round(sourceHeight * scale))
  const left = (targetWidth - width) >> 1
  const top = (targetHeight - height) >> 1

  target.fill(0)

  for (let y = 0; y < height; y++) {
    const sourceRow = Math.floor((y * sourceHeight) / height)

    for (let x = 0; x < width; x++) {
      const sourceColumn = Math.floor((x * sourceWidth) / width)

      target[(top + y) * targetWidth + left + x] =
        source[sourceRow * sourceWidth + sourceColumn]
    }
  }
}

const PPM_THUMBNAIL_COLORS: readonly Rgb[] = [
  [255, 255, 255],
  [82, 82, 82],
  [255, 255, 255],
  [156, 156, 156],
  [255, 72, 68],
  [200, 81, 79],
  [255, 173, 172],
  [0, 255, 0],
  [72, 64, 255],
  [81, 79, 184],
  [173, 171, 255],
  [0, 255, 0],
  [182, 87, 183],
]

export function encodePpmThumbnail(rgba: Uint32Array): Uint8Array {
  const out = new Uint8Array(1536)
  let position = 0

  const colorAt = (x: number, y: number): number => {
    const word = rgba[y * 64 + x]

    return nearestColor(
      word & 0xff,
      (word >>> 8) & 0xff,
      (word >>> 16) & 0xff,
      PPM_THUMBNAIL_COLORS,
    )
  }

  for (let tileY = 0; tileY < 48; tileY += 8) {
    for (let tileX = 0; tileX < 64; tileX += 8) {
      for (let line = 0; line < 8; line++) {
        for (let x = 0; x < 8; x += 2) {
          const low = colorAt(tileX + x, tileY + line)
          const high = colorAt(tileX + x + 1, tileY + line)

          out[position++] = (low & 0xf) | ((high & 0xf) << 4)
        }
      }
    }
  }

  return out
}
