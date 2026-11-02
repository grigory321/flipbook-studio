export type MaskPoint = readonly [number, number]

export function fullMask(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height).fill(1)
}

export function rectMask(
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)
  const left = Math.max(0, Math.min(x0, x1))
  const right = Math.min(width - 1, Math.max(x0, x1))
  const top = Math.max(0, Math.min(y0, y1))
  const bottom = Math.min(height - 1, Math.max(y0, y1))

  for (let y = top; y <= bottom; y++) {
    mask.fill(1, y * width + left, y * width + right + 1)
  }

  return mask
}

export function polygonMask(
  path: readonly MaskPoint[],
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(width * height)

  fillPolygon(path, (x0, x1, y) => {
    if (y < 0 || y >= height) return

    const left = Math.max(0, x0)
    const right = Math.min(width - 1, x1)

    if (right >= left) mask.fill(1, y * width + left, y * width + right + 1)
  })

  return mask
}

export function fillPolygon(
  path: readonly MaskPoint[],
  span: (x0: number, x1: number, y: number) => void,
): void {
  if (path.length < 3) return

  const ys = path.map(point => point[1])
  const top = Math.floor(Math.min(...ys))
  const bottom = Math.ceil(Math.max(...ys))
  const crossings: number[] = []

  for (let y = top; y <= bottom; y++) {
    const line = y + 0.5

    crossings.length = 0

    for (let index = 0, last = path.length - 1; index < path.length; index++) {
      const [ax, ay] = path[index]
      const [bx, by] = path[last]

      if (ay > line !== by > line) {
        crossings.push(ax + ((line - ay) * (bx - ax)) / (by - ay))
      }

      last = index
    }

    crossings.sort((a, b) => a - b)

    for (let pair = 0; pair + 1 < crossings.length; pair += 2) {
      span(
        Math.ceil(crossings[pair] - 0.5),
        Math.floor(crossings[pair + 1] - 0.5),
        y,
      )
    }
  }
}

export function connectedMask(
  planes: readonly Uint8Array[],
  width: number,
  height: number,
  x: number,
  y: number,
): Uint8Array | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null

  const isInk = (index: number): boolean =>
    planes.some(plane => plane[index] !== 0)

  const start = y * width + x

  if (!isInk(start)) return null

  const mask = new Uint8Array(width * height)
  const stack = new Int32Array(width * height)
  let size = 1

  stack[0] = start
  mask[start] = 1

  while (size > 0) {
    const index = stack[--size]
    const row = Math.floor(index / width)
    const column = index - row * width

    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const nextX = column + offsetX
        const nextY = row + offsetY

        if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
          continue
        }

        const next = nextY * width + nextX

        if (mask[next] || !isInk(next)) continue

        mask[next] = 1
        stack[size++] = next
      }
    }
  }

  return mask
}
