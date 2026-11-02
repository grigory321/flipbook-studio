export type TracePoint = readonly [number, number]

const SIMPLIFY_TOLERANCE = 1.2
const MIN_EXTENT = 4
const ROUND = 1000

const AROUND: readonly TracePoint[] = [
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
]

export function traceContour(
  mask: Uint8Array,
  width: number,
  height: number,
): TracePoint[] {
  const start = mask.indexOf(1)

  if (start < 0) return []

  const isSet = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1

  const startX = start % width
  const startY = Math.floor(start / width)
  const path: TracePoint[] = [[startX, startY]]
  let x = startX
  let y = startY
  let heading = 0

  for (let guard = 0; guard < mask.length * 2; guard++) {
    let moved = false

    for (let turn = 0; turn < AROUND.length; turn++) {
      const index = (heading + turn) % AROUND.length
      const nextX = x + AROUND[index][0]
      const nextY = y + AROUND[index][1]

      if (!isSet(nextX, nextY)) continue

      x = nextX
      y = nextY
      heading = (index + 5) % AROUND.length
      moved = true

      break
    }

    if (!moved || (x === startX && y === startY)) break

    path.push([x, y])
  }

  return path
}

function distanceToLine(
  point: TracePoint,
  start: TracePoint,
  end: TracePoint,
): number {
  const deltaX = end[0] - start[0]
  const deltaY = end[1] - start[1]
  const length = Math.hypot(deltaX, deltaY)

  if (length === 0) return Math.hypot(point[0] - start[0], point[1] - start[1])

  return (
    Math.abs(
      deltaY * point[0] -
        deltaX * point[1] +
        end[0] * start[1] -
        end[1] * start[0],
    ) / length
  )
}

export function simplifyPath(
  points: readonly TracePoint[],
  tolerance = SIMPLIFY_TOLERANCE,
): TracePoint[] {
  if (points.length < 3) return [...points]

  const keep = new Uint8Array(points.length)
  const pending: [number, number][] = [[0, points.length - 1]]

  keep[0] = 1
  keep[points.length - 1] = 1

  for (let span = pending.pop(); span; span = pending.pop()) {
    const [first, last] = span
    let farthest = -1
    let distance = tolerance

    for (let index = first + 1; index < last; index++) {
      const away = distanceToLine(points[index], points[first], points[last])

      if (away > distance) {
        distance = away
        farthest = index
      }
    }

    if (farthest < 0) continue

    keep[farthest] = 1
    pending.push([first, farthest], [farthest, last])
  }

  return points.filter((_, index) => keep[index])
}

export function normalizeOutline(
  points: readonly TracePoint[],
): [number, number][] | null {
  if (points.length < 3) return null

  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left
  const height = Math.max(...ys) - top

  if (Math.max(width, height) < MIN_EXTENT) return null

  const scaleX = width || 1
  const scaleY = height || 1

  return points.map(([x, y]) => [
    Math.round(((x - left) / scaleX) * ROUND) / ROUND,
    Math.round(((y - top) / scaleY) * ROUND) / ROUND,
  ])
}
