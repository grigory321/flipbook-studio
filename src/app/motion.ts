export type MotionPoint = readonly [number, number]

export type MotionEase = 'none' | 'in' | 'out' | 'both'

export interface MotionPath {
  xs: Float32Array
  ys: Float32Array
  lengths: Float32Array
  turns: Float32Array
}

const SMOOTH_PASSES = 24
const HEADING_REACH = 6

function resample(points: readonly MotionPoint[]): [number, number][] {
  const result: [number, number][] = [[points[0][0], points[0][1]]]
  let [lastX, lastY] = points[0]
  let carry = 0

  for (let index = 1; index < points.length; index++) {
    const [x, y] = points[index]
    const distance = Math.hypot(x - lastX, y - lastY)

    if (distance === 0) continue

    let walked = 1 - carry

    while (walked <= distance) {
      const ratio = walked / distance

      result.push([lastX + (x - lastX) * ratio, lastY + (y - lastY) * ratio])
      walked += 1
    }

    carry = distance - (walked - 1)
    lastX = x
    lastY = y
  }

  const [endX, endY] = points[points.length - 1]

  result.push([endX, endY])

  return result
}

function smooth(points: [number, number][]): void {
  for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
    let previousX = points[0][0]
    let previousY = points[0][1]

    for (let index = 1; index + 1 < points.length; index++) {
      const [x, y] = points[index]
      const [nextX, nextY] = points[index + 1]

      points[index] = [
        (previousX + x * 2 + nextX) / 4,
        (previousY + y * 2 + nextY) / 4,
      ]
      previousX = x
      previousY = y
    }
  }
}

export function makeMotionPath(points: readonly MotionPoint[]): MotionPath {
  const even = resample(points)

  smooth(even)

  const path = resample(even)
  const count = path.length
  const xs = new Float32Array(count)
  const ys = new Float32Array(count)
  const lengths = new Float32Array(count)
  const turns = new Float32Array(count)

  path.forEach(([x, y], index) => {
    xs[index] = x
    ys[index] = y

    if (index > 0) {
      lengths[index] =
        lengths[index - 1] + Math.hypot(x - xs[index - 1], y - ys[index - 1])
    }
  })

  const headingAt = (index: number): number => {
    const before = Math.max(0, index - HEADING_REACH)
    const after = Math.min(count - 1, index + HEADING_REACH)

    return Math.atan2(ys[after] - ys[before], xs[after] - xs[before])
  }

  const first = headingAt(0)
  let unwrapped = first

  for (let index = 0; index < count; index++) {
    const heading = headingAt(index)
    const step = Math.atan2(
      Math.sin(heading - unwrapped),
      Math.cos(heading - unwrapped),
    )

    unwrapped += step
    turns[index] = unwrapped - first
  }

  return { xs, ys, lengths, turns }
}

export function motionAt(
  path: MotionPath,
  ratio: number,
): [number, number, number] {
  const { xs, ys, lengths, turns } = path
  const last = xs.length - 1
  const target = lengths[last] * Math.max(0, Math.min(1, ratio))
  let low = 0
  let high = last

  while (high - low > 1) {
    const middle = (low + high) >> 1

    if (lengths[middle] <= target) low = middle
    else high = middle
  }

  const span = lengths[high] - lengths[low]
  const blend = span > 0 ? (target - lengths[low]) / span : 0
  const mix = (values: Float32Array): number =>
    values[low] + (values[high] - values[low]) * blend

  return [mix(xs) - xs[0], mix(ys) - ys[0], mix(turns)]
}

export function easeAt(ease: MotionEase, ratio: number): number {
  if (ease === 'in') return ratio * ratio
  if (ease === 'out') return 1 - (1 - ratio) * (1 - ratio)
  if (ease === 'both') return ratio * ratio * (3 - 2 * ratio)

  return ratio
}
