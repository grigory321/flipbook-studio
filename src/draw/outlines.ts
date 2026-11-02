export type Outline = readonly (readonly [number, number])[]

const STEPS = 72
const TURN = Math.PI * 2

function fit(points: readonly (readonly [number, number])[]): Outline {
  const xs = points.map(point => point[0])
  const ys = points.map(point => point[1])
  const left = Math.min(...xs)
  const top = Math.min(...ys)
  const width = Math.max(...xs) - left || 1
  const height = Math.max(...ys) - top || 1

  return points.map(([x, y]) => [(x - left) / width, (y - top) / height])
}

function polar(radius: (angle: number) => number): Outline {
  const points: [number, number][] = []

  for (let step = 0; step < STEPS; step++) {
    const angle = (step / STEPS) * TURN - Math.PI / 2
    const size = radius(angle)

    points.push([Math.cos(angle) * size, Math.sin(angle) * size])
  }

  return fit(points)
}

function polygon(sides: number, rotation = -Math.PI / 2): Outline {
  const points: [number, number][] = []

  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * TURN + rotation

    points.push([Math.cos(angle), Math.sin(angle)])
  }

  return fit(points)
}

function star(tips: number, inner: number): Outline {
  const points: [number, number][] = []

  for (let index = 0; index < tips * 2; index++) {
    const angle = (index / (tips * 2)) * TURN - Math.PI / 2
    const size = index % 2 ? inner : 1

    points.push([Math.cos(angle) * size, Math.sin(angle) * size])
  }

  return fit(points)
}

function heart(): Outline {
  const points: [number, number][] = []

  for (let step = 0; step < STEPS; step++) {
    const angle = (step / STEPS) * TURN

    points.push([
      16 * Math.sin(angle) ** 3,
      -(
        13 * Math.cos(angle) -
        5 * Math.cos(2 * angle) -
        2 * Math.cos(3 * angle) -
        Math.cos(4 * angle)
      ),
    ])
  }

  return fit(points)
}

function arc(
  centerX: number,
  centerY: number,
  radius: number,
  from: number,
  to: number,
  steps = 10,
): [number, number][] {
  const points: [number, number][] = []

  for (let step = 0; step <= steps; step++) {
    const angle = from + ((to - from) * step) / steps

    points.push([
      centerX + Math.cos(angle) * radius,
      centerY + Math.sin(angle) * radius,
    ])
  }

  return points
}

function roundedBox(): Outline {
  const radius = 0.2
  const far = 1 - radius
  const half = Math.PI / 2

  return fit([
    ...arc(far, radius, radius, -half, 0),
    ...arc(far, far, radius, 0, half),
    ...arc(radius, far, radius, half, half * 2),
    ...arc(radius, radius, radius, half * 2, half * 3),
  ])
}

function bubble(): Outline {
  const points: [number, number][] = []
  const gapStart = 1.9
  const gapEnd = 2.45

  for (let step = 0; step <= STEPS; step++) {
    const angle = (step / STEPS) * TURN

    if (angle > gapStart && angle < gapEnd) continue

    points.push([0.5 + Math.cos(angle) * 0.5, 0.4 + Math.sin(angle) * 0.4])

    if (angle <= gapStart && angle + TURN / STEPS > gapStart) {
      points.push([0.12, 1])
    }
  }

  return fit(points)
}

function moon(): Outline {
  const outer = arc(0, 0, 1, Math.PI * 0.32, Math.PI * 1.68, 28)
  const inner = arc(0.72, 0, 0.82, Math.PI * 1.36, Math.PI * 0.64, 20)

  return fit([...outer, ...inner])
}

function drop(): Outline {
  const points: [number, number][] = [[0, -1.6]]

  points.push(...arc(0, 0, 1, -Math.PI * 0.3, Math.PI * 1.3, 40))

  return fit(points)
}

function astroid(): Outline {
  const points: [number, number][] = []

  for (let step = 0; step < STEPS; step++) {
    const angle = (step / STEPS) * TURN

    points.push([Math.cos(angle) ** 3, Math.sin(angle) ** 3])
  }

  return fit(points)
}

export const OUTLINE_KINDS = [
  'star',
  'heart',
  'triangle',
  'rightTriangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'roundRect',
  'arrow',
  'bubble',
  'cloud',
  'moon',
  'cross',
  'bolt',
  'drop',
  'sparkle',
  'flower',
] as const

export type OutlineKind = (typeof OUTLINE_KINDS)[number]

export const OUTLINES: Readonly<Record<OutlineKind, Outline>> = {
  star: star(5, 0.42),
  heart: heart(),
  triangle: fit([
    [0.5, 0],
    [1, 1],
    [0, 1],
  ]),
  rightTriangle: fit([
    [0, 0],
    [1, 1],
    [0, 1],
  ]),
  diamond: polygon(4),
  pentagon: polygon(5),
  hexagon: polygon(6, 0),
  octagon: polygon(8, Math.PI / 8),
  roundRect: roundedBox(),
  arrow: fit([
    [0, 0.32],
    [0.58, 0.32],
    [0.58, 0.06],
    [1, 0.5],
    [0.58, 0.94],
    [0.58, 0.68],
    [0, 0.68],
  ]),
  bubble: bubble(),
  cloud: polar(angle => 0.82 + 0.2 * Math.abs(Math.cos(angle * 3))),
  moon: moon(),
  cross: fit([
    [0.33, 0],
    [0.67, 0],
    [0.67, 0.33],
    [1, 0.33],
    [1, 0.67],
    [0.67, 0.67],
    [0.67, 1],
    [0.33, 1],
    [0.33, 0.67],
    [0, 0.67],
    [0, 0.33],
    [0.33, 0.33],
  ]),
  bolt: fit([
    [0.58, 0],
    [0.14, 0.56],
    [0.44, 0.56],
    [0.3, 1],
    [0.86, 0.38],
    [0.54, 0.38],
    [0.74, 0],
  ]),
  drop: drop(),
  sparkle: astroid(),
  flower: polar(angle => 0.72 + 0.28 * Math.cos(angle * 5)),
}
