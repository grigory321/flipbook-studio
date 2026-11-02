import { COVERAGE_FULL, valueCoverage } from '../core/ink.ts'
import type { Surface } from '../core/surface.ts'

export const DEVICE_STACK_LIMIT = 0x1000

const STEP_FILL = 0
const STEP_UP = 1
const STEP_DOWN = 2
const STEP_NEXT = 3
const STACK_ENTRY = 4

function visibleKeys(planes: readonly Uint8Array[]): Int32Array {
  const keys = new Int32Array(planes[0].length)

  for (let index = 0; index < keys.length; index++) {
    for (let layer = 0; layer < planes.length; layer++) {
      const value = planes[layer][index]

      if (value) {
        keys[index] = (layer + 1) * 256 + value
        break
      }
    }
  }

  return keys
}

export function fillSoftEdges(surface: Surface): void {
  const { width, height, plane } = surface
  const fill = surface.paintValue
  const pale: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x
      const value = plane[index]
      const coverage = valueCoverage(value)

      if (coverage === 0 || coverage * 2 >= COVERAGE_FULL) continue
      if (value === fill) continue

      const isNextToFill =
        (x > 0 && plane[index - 1] === fill) ||
        (x + 1 < width && plane[index + 1] === fill) ||
        (y > 0 && plane[index - width] === fill) ||
        (y + 1 < height && plane[index + width] === fill)

      if (isNextToFill) pale.push(index)
    }
  }

  for (const index of pale) {
    plane[index] = fill
    surface.plotIndex(index)
  }
}

export function floodFill(
  surface: Surface,
  startX: number,
  startY: number,
  planes: readonly Uint8Array[],
  stackLimit = Infinity,
): void {
  const { width, height } = surface

  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return

  const keys = visibleKeys(planes)
  const target = keys[startY * width + startX]
  const blocked = new Uint8Array(width * height)

  for (let index = 0; index < blocked.length; index++) {
    blocked[index] = keys[index] === target ? 0 : 1
  }

  const stack: number[] = []
  let left = startX
  let right = startX
  let y = startY
  let step = STEP_FILL

  const dive = (nextStep: number): void => {
    stack.push(left, right, y, nextStep)
  }

  const canDive = (row: number): boolean =>
    row >= 0 &&
    row < height &&
    !blocked[row * width + left] &&
    stack.length / STACK_ENTRY + 1 < stackLimit

  for (;;) {
    if (step === STEP_FILL) {
      let low = left
      let high = left

      while (low > 0 && !blocked[y * width + low - 1]) low--
      while (high + 1 < width && !blocked[y * width + high + 1]) high++

      left = low
      right = high

      for (let x = low; x <= high; x++) {
        surface.paint(x, y)
        blocked[y * width + x] = 1
      }

      step = STEP_UP
    }

    if (step === STEP_UP) {
      step = STEP_DOWN

      if (canDive(y - 1)) {
        dive(STEP_DOWN)
        y--
        step = STEP_FILL
      }
    } else if (step === STEP_DOWN) {
      step = STEP_NEXT

      if (canDive(y + 1)) {
        dive(STEP_NEXT)
        y++
        step = STEP_FILL
      }
    } else {
      left++
      step = STEP_UP

      if (left > right) {
        if (stack.length === 0) return

        const top = stack.length - STACK_ENTRY

        left = stack[top]
        right = stack[top + 1]
        y = stack[top + 2]
        step = stack[top + 3]
        stack.length = top
      }
    }
  }
}
