export const COVERAGE_FULL = 16

export const KNOCKOUT_VALUE = 255

const INK_BITS = 4
const INK_MASK = 15

export function valueInk(value: number): number {
  return value & INK_MASK
}

export function valueCoverage(value: number): number {
  return value === 0 ? 0 : value >> INK_BITS || COVERAGE_FULL
}

export function coveredValue(ink: number, coverage: number): number {
  if (coverage <= 0) return 0

  return coverage >= COVERAGE_FULL ? ink : (coverage << INK_BITS) | ink
}

export function blendOver(top: number, bottom: number): number {
  const topAlpha = top >>> 24

  if (topAlpha === 255 || bottom >>> 24 === 0) return top
  if (topAlpha === 0) return bottom

  const topWeight = topAlpha * 255
  const bottomWeight = (bottom >>> 24) * (255 - topAlpha)
  const total = topWeight + bottomWeight
  const scale = 1 / total
  const red =
    ((top & 255) * topWeight + (bottom & 255) * bottomWeight) * scale + 0.5
  const green =
    (((top >>> 8) & 255) * topWeight + ((bottom >>> 8) & 255) * bottomWeight) *
      scale +
    0.5
  const blue =
    (((top >>> 16) & 255) * topWeight +
      ((bottom >>> 16) & 255) * bottomWeight) *
      scale +
    0.5
  const alpha = total / 255 + 0.5

  return ((alpha << 24) | (blue << 16) | (green << 8) | red) >>> 0
}
