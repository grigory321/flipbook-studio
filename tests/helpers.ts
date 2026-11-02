import assert from 'node:assert/strict'
import { builtinTools, type ToolPoint } from '../src/app/tools.ts'
import type { SlabBackend } from '../src/core/store.ts'

export class MemoryBackend implements SlabBackend {
  readonly slabs = new Map<number, Uint8Array>()
  reads = 0

  async writeSlab(number: number, bytes: Uint8Array): Promise<void> {
    this.slabs.set(number, bytes.slice())
  }

  async readSlab(number: number): Promise<Uint8Array | null> {
    this.reads++

    return this.slabs.get(number) ?? null
  }
}

export function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0

    return state / 0x100000000
  }
}

export function point(x: number, y: number, time = 0): ToolPoint {
  return {
    x,
    y,
    pressure: 0.5,
    isConstrained: false,
    time,
    reach: 3,
    stem: 8,
  }
}

export function tool(id: string) {
  const found = builtinTools().find(item => item.id === id)

  assert.ok(found)

  return found
}

export function inkOf(plane: Uint8Array): number {
  return plane.reduce((sum, value) => sum + (value ? 1 : 0), 0)
}
