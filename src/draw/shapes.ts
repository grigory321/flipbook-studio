import {
  type Outline,
  OUTLINE_KINDS,
  OUTLINES,
  type OutlineKind,
} from './outlines.ts'

export type MyShapeKind = `my.${string}`
export type ShapeKind = 'line' | 'rect' | 'oval' | OutlineKind | MyShapeKind

export function isMyShape(kind: string): kind is MyShapeKind {
  return kind.startsWith('my.')
}

const outlines = new Map<ShapeKind, Outline>(
  OUTLINE_KINDS.map(kind => [kind, OUTLINES[kind]]),
)

export function setCustomOutline(id: MyShapeKind, outline: Outline): void {
  outlines.set(id, outline)
}

function outlineOf(kind: ShapeKind): Outline | undefined {
  return outlines.get(kind)
}

export function shapeOutline(kind: ShapeKind): Outline {
  return outlineOf(kind) ?? []
}

export type Point = [number, number]

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'line',
  'rect',
  'oval',
  ...OUTLINE_KINDS,
]

const CONSTRAIN_RATIO = Math.fround(0.33)

function constrainShape(
  kind: ShapeKind,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Point {
  if (kind === 'oval') return [endX, endY]

  const deltaX = endX - startX
  const deltaY = endY - startY
  const squareX = deltaX * deltaX
  const squareY = deltaY * deltaY
  const signX = deltaX > 0 ? 1 : -1
  const signY = deltaY > 0 ? 1 : -1

  if (kind === 'line') {
    if (squareX > squareY) {
      if (Math.fround(squareY / squareX) < CONSTRAIN_RATIO) {
        return [endX, startY]
      }

      const distance = Math.abs(deltaY)

      return [startX + signX * distance, startY + signY * distance]
    }

    if (Math.fround(squareX / squareY) < CONSTRAIN_RATIO) {
      return [startX, endY]
    }

    const distance = Math.abs(deltaX)

    return [startX + signX * distance, startY + signY * distance]
  }

  const distance = Math.min(Math.abs(deltaX), Math.abs(deltaY))

  return [startX + signX * distance, startY + signY * distance]
}

function walk(ax: number, ay: number, bx: number, by: number, out: Point[]) {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay))

  for (let step = 1; step <= steps; step++) {
    out.push([
      Math.round(ax + ((bx - ax) * step) / steps),
      Math.round(ay + ((by - ay) * step) / steps),
    ])
  }
}

function rectPoints(ax: number, ay: number, bx: number, by: number): Point[] {
  if (ax === bx && ay === by) return [[bx, by]]

  const points: Point[] = [[ax, by]]

  walk(ax, by, ax, ay, points)
  walk(ax, ay, bx, ay, points)
  walk(bx, ay, bx, by, points)
  walk(bx, by, ax, by, points)

  return points
}

function ovalPoints(
  centerX: number,
  centerY: number,
  endX: number,
  endY: number,
): Point[] {
  const radiusX = Math.abs(endX - centerX)
  const radiusY = Math.abs(endY - centerY)
  const points: Point[] = []

  if (!radiusX || !radiusY) return points

  const doubleX = 2 * radiusX * radiusX
  const doubleY = 2 * radiusY * radiusY
  let error = radiusX * radiusX * radiusY
  let x = 0
  let y = radiusY
  let stopY = doubleX * radiusY
  let stopX = 0
  let state = 1

  while (state < 4) {
    points.push(
      [centerX + x, centerY + y],
      [centerX - x, centerY + y],
      [centerX - x, centerY - y],
      [centerX + x, centerY - y],
    )

    if (state === 1) {
      error -= doubleY * x
      x++
      stopX += doubleY

      if (error <= 0) {
        y--
        error += doubleX * y
        stopY -= doubleX
      }

      if (stopX > stopY) {
        error = radiusY * radiusY * radiusX
        x = radiusX
        y = 0
        stopX = doubleY * radiusX
        stopY = 0
        state = 2
      }
    } else {
      state = 3
      error -= doubleX * y
      y++
      stopY += doubleX

      if (error < 0) {
        x--
        error += doubleY * x
        stopX -= doubleY
      }

      if (stopX < stopY) state = 4
    }
  }

  return points
}

function circlePoints(
  centerX: number,
  centerY: number,
  endX: number,
  endY: number,
): Point[] {
  const radius = Math.max(Math.abs(centerX - endX), Math.abs(centerY - endY))

  if (radius < 1) return []

  const points: Point[] = [
    [centerX, centerY + radius],
    [centerX, centerY - radius],
  ]

  let x = 0
  let y = radius
  let error = 2 - 2 * radius

  for (;;) {
    if (error > -y) {
      y--
      error += 1 - 2 * y
    }

    if (error <= x) {
      x++
      error += 1 + 2 * x
    }

    if (y === 0) {
      points.push([centerX + radius, centerY], [centerX - radius, centerY])

      return points
    }

    points.push(
      [centerX + x, centerY + y],
      [centerX - x, centerY + y],
      [centerX - x, centerY - y],
      [centerX + x, centerY - y],
    )
  }
}

function outlinePoints(
  outline: readonly (readonly [number, number])[],
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Point[] {
  const width = endX - startX
  const height = endY - startY
  const placed = outline.map(([x, y]): Point => [
    Math.round(startX + x * width),
    Math.round(startY + y * height),
  ])
  const points: Point[] = [placed[0]]

  placed.forEach((point, index) => {
    const next = placed[(index + 1) % placed.length]

    walk(point[0], point[1], next[0], next[1], points)
  })

  return points
}

export function shapePoints(
  kind: ShapeKind,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  isConstrained: boolean,
): Point[] {
  const [x, y] = isConstrained
    ? constrainShape(kind, startX, startY, endX, endY)
    : [endX, endY]

  const outline = outlineOf(kind)

  if (outline) return outlinePoints(outline, startX, startY, x, y)

  if (kind === 'rect') return rectPoints(startX, startY, x, y)

  if (kind === 'oval') {
    return isConstrained
      ? circlePoints(startX, startY, x, y)
      : ovalPoints(startX, startY, x, y)
  }

  const points: Point[] = [[startX, startY]]

  walk(startX, startY, x, y, points)

  return points
}

export function fillOutline(
  points: readonly Point[],
  visit: (x: number, y: number) => void,
): void {
  const edges = new Map<number, { low: number; high: number }>()

  for (const [x, y] of points) {
    const edge = edges.get(y)

    if (!edge) edges.set(y, { low: x, high: x })
    else {
      edge.low = Math.min(edge.low, x)
      edge.high = Math.max(edge.high, x)
    }
  }

  for (const [y, edge] of edges) {
    for (let x = edge.low; x <= edge.high; x++) visit(x, y)
  }
}
