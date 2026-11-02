import type { Pattern } from '../core/patterns.ts'
import { type MyShapeKind, setCustomOutline } from '../draw/shapes.ts'
import {
  normalizeOutline,
  simplifyPath,
  type TracePoint,
  traceContour,
} from '../draw/trace.ts'
import { registries } from '../plugin/host.ts'
import { createId } from '../core/note.ts'
import type { Floating } from './floating.ts'
import { settings, type StoredPattern } from './settings.ts'

const PATTERN_LIMIT = 32

const patternRemovers = new Map<string, () => void>()

function toPattern(stored: StoredPattern): Pattern {
  return {
    id: stored.id,
    nameKey: 'pattern.mine',
    width: stored.width,
    height: stored.height,
    bits: Uint8Array.from(stored.bits),
  }
}

function registerPattern(stored: StoredPattern): void {
  patternRemovers.set(stored.id, registries.patterns.add(toPattern(stored)))
}

export function restoreMyLibrary(): void {
  for (const shape of settings.myShapes.peek()) {
    setCustomOutline(shape.id, shape.points)
  }

  settings.myPatterns.peek().forEach(registerPattern)
}

export function isMyPattern(id: string): boolean {
  return patternRemovers.has(id)
}

export function addMyShape(points: readonly TracePoint[]): MyShapeKind | null {
  const outline = normalizeOutline(simplifyPath(points))

  if (!outline) return null

  const id: MyShapeKind = `my.${createId()}`

  setCustomOutline(id, outline)
  settings.myShapes.value = [
    ...settings.myShapes.peek(),
    { id, points: outline },
  ]

  return id
}

export function removeMyShape(id: string): void {
  settings.myShapes.value = settings.myShapes
    .peek()
    .filter(shape => shape.id !== id)
}

export function addShapeFromFloating(floating: Floating): MyShapeKind | null {
  const baked = floating.bake()
  const mask = baked.pixels.map(value => (value ? 1 : 0))

  return addMyShape(traceContour(mask, baked.sourceWidth, baked.sourceHeight))
}

export function addMyPattern(
  bits: readonly number[],
  width: number,
  height: number,
): string {
  const stored = { id: `my.${createId()}`, width, height, bits: [...bits] }

  registerPattern(stored)
  settings.myPatterns.value = [...settings.myPatterns.peek(), stored]

  return stored.id
}

export function removeMyPattern(id: string): void {
  patternRemovers.get(id)?.()
  patternRemovers.delete(id)
  settings.myPatterns.value = settings.myPatterns
    .peek()
    .filter(pattern => pattern.id !== id)
}

export function addPatternFromFloating(floating: Floating): string | null {
  const baked = floating.bake()
  const width = Math.min(PATTERN_LIMIT, baked.sourceWidth)
  const height = Math.min(PATTERN_LIMIT, baked.sourceHeight)
  const bits: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      bits.push(baked.pixels[y * baked.sourceWidth + x] ? 1 : 0)
    }
  }

  return bits.includes(1) ? addMyPattern(bits, width, height) : null
}
