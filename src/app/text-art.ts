import { edgeMask, type EdgeSpec } from '../draw/edge.ts'

export function styleGlyphs(
  mask: Uint8Array,
  width: number,
  height: number,
  edge: EdgeSpec,
  ink: number,
): Uint8Array {
  const { style, second } = edge
  const pixels = new Uint8Array(width * height)
  const ring =
    style === 'none' ? null : edgeMask(mask, width, height, edge.width)
  const fill = style === 'hollow' ? second : ink
  const line = style === 'hollow' ? ink : second

  for (let index = 0; index < pixels.length; index++) {
    if (mask[index]) pixels[index] = fill
    else if (ring?.[index]) pixels[index] = line
  }

  return pixels
}

export function scaleDots(
  pixels: Uint8Array,
  width: number,
  height: number,
  times: number,
): Uint8Array {
  if (times === 1) return pixels

  const scaledWidth = width * times
  const scaled = new Uint8Array(scaledWidth * height * times)

  for (let y = 0; y < height; y++) {
    const rowStart = y * times * scaledWidth

    for (let x = 0; x < width; x++) {
      const start = rowStart + x * times

      scaled.fill(pixels[y * width + x], start, start + times)
    }

    for (let repeat = 1; repeat < times; repeat++) {
      scaled.copyWithin(
        rowStart + repeat * scaledWidth,
        rowStart,
        rowStart + scaledWidth,
      )
    }
  }

  return scaled
}
