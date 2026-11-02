import { hash32 } from './bytes.ts'

export type Ref = number

export const EMPTY_REF: Ref = 0

const UNIFORM_FLAG = 0x80000000
const SLAB_SHIFT = 19
const SLAB_BYTES = 1 << SLAB_SHIFT
const ALIGN_SHIFT = 3
const LENGTH_BYTES = 2
const MAX_SLABS = 0x7ffe

const PINNED_CALLS = 4

const INDEX_SLOTS = 1 << 18
const INDEX_MASK = INDEX_SLOTS - 1

const MAX_ITEM_BYTES = 0xffff

export function uniformRef(value: number): Ref {
  return value === 0 ? EMPTY_REF : (UNIFORM_FLAG | value) >>> 0
}

export function isUniform(ref: Ref): boolean {
  return ref >= UNIFORM_FLAG
}

export function uniformValue(ref: Ref): number {
  return ref & 0xff
}

export interface SlabBackend {
  writeSlab(number: number, bytes: Uint8Array): Promise<void>
  readSlab(number: number): Promise<Uint8Array | null>
}

export interface StoreOptions {
  backend?: SlabBackend | null
  budget?: number
  slabCount?: number
  tail?: Uint8Array | null
}

export interface StoreSnapshot {
  slabCount: number
  tail: Uint8Array
}

export class Store {
  private readonly slabs: (Uint8Array | null)[] = []
  private readonly lastUsed: number[] = []
  private readonly saved: boolean[] = []
  private readonly index = new Uint32Array(INDEX_SLOTS * 2)
  private readonly backend: SlabBackend | null
  private readonly budget: number
  private pendingWrites: Promise<void> = Promise.resolve()
  private tail: Uint8Array
  private tailUsed = 0
  private clock = 0
  private loadedSlabs = 1
  private readonly recent: Set<number>[] = []
  private readonly loading = new Set<Set<number>>()
  private readonly named = new Map<string, Set<number>>()

  constructor(options: StoreOptions = {}) {
    this.backend = options.backend ?? null
    this.budget = options.budget ?? 256 * 1024 * 1024

    const sealed = options.slabCount ?? 0

    for (let number = 0; number < sealed; number++) {
      this.slabs.push(null)
      this.lastUsed.push(0)
      this.saved.push(true)
    }

    this.tail = new Uint8Array(SLAB_BYTES)
    this.slabs.push(this.tail)
    this.lastUsed.push(0)
    this.saved.push(false)

    if (options.tail) {
      this.tail.set(options.tail)
      this.tailUsed = options.tail.length
    }
  }

  get loadedBytes(): number {
    return this.loadedSlabs * SLAB_BYTES
  }

  get writtenBytes(): number {
    return (this.slabs.length - 1) * SLAB_BYTES + this.tailUsed
  }

  put(bytes: Uint8Array, length = bytes.length): Ref {
    if (length > MAX_ITEM_BYTES) throw new RangeError('データが大きすぎます')

    const hash = hash32(bytes, 0, length)
    const slot = (hash & INDEX_MASK) * 2

    if (this.index[slot] === hash) {
      const known = this.index[slot + 1]

      if (known !== 0 && this.matches(known, bytes, length)) return known
    }

    const ref = this.append(bytes, length)

    this.index[slot] = hash
    this.index[slot + 1] = ref

    return ref
  }

  private matches(ref: Ref, bytes: Uint8Array, length: number): boolean {
    const slab = this.slabs[slabOf(ref)]

    if (!slab) return false

    const position = positionOf(ref)

    if (readLength(slab, position) !== length) return false

    const start = position + LENGTH_BYTES

    for (let index = 0; index < length; index++) {
      if (slab[start + index] !== bytes[index]) return false
    }

    return true
  }

  private append(bytes: Uint8Array, length: number): Ref {
    const needed = LENGTH_BYTES + length

    if (this.tailUsed + needed > SLAB_BYTES) this.seal()

    const position = this.tailUsed
    const number = this.slabs.length - 1

    this.tail[position] = length & 0xff
    this.tail[position + 1] = length >>> 8
    this.tail.set(bytes.subarray(0, length), position + LENGTH_BYTES)
    this.tailUsed = alignUp(position + needed)

    return makeRef(number, position)
  }

  private seal(): void {
    const number = this.slabs.length - 1

    if (number >= MAX_SLABS) throw new RangeError('ノートの容量の上限です')

    this.saveSlab(number)
    this.tail = new Uint8Array(SLAB_BYTES)
    this.tailUsed = 0
    this.slabs.push(this.tail)
    this.lastUsed.push(this.clock)
    this.saved.push(false)
    this.loadedSlabs++
    this.trim()
  }

  private saveSlab(number: number): void {
    const backend = this.backend
    const slab = this.slabs[number]

    if (!backend || !slab) return

    this.pendingWrites = this.pendingWrites
      .then(() => backend.writeSlab(number, slab))
      .then(() => {
        this.saved[number] = true
        this.trim()
      })
  }

  private trim(): void {
    while (this.loadedBytes > this.budget) {
      const victim = this.findEvictable()

      if (victim < 0) return

      this.slabs[victim] = null
      this.loadedSlabs--
    }
  }

  private findEvictable(): number {
    let victim = -1
    let oldest = Infinity
    const last = this.slabs.length - 1

    for (let number = 0; number < last; number++) {
      const unused =
        this.slabs[number] && this.saved[number] && !this.isPinned(number)

      if (unused && this.lastUsed[number] < oldest) {
        oldest = this.lastUsed[number]
        victim = number
      }
    }

    return victim
  }

  private isPinned(number: number): boolean {
    for (const numbers of this.recent) if (numbers.has(number)) return true
    for (const numbers of this.loading) if (numbers.has(number)) return true

    for (const numbers of this.named.values()) {
      if (numbers.has(number)) return true
    }

    return false
  }

  pin(key: string, refs: Iterable<Ref>): void {
    this.named.set(key, slabsOf(refs))
    this.trim()
  }

  unpin(key: string): void {
    if (this.named.delete(key)) this.trim()
  }

  isLoaded(ref: Ref): boolean {
    if (ref === EMPTY_REF || isUniform(ref)) return true

    return this.slabs[slabOf(ref)] !== null
  }

  slabFor(ref: Ref): Uint8Array {
    const number = slabOf(ref)
    const slab = this.slabs[number]

    if (!slab) throw new Error(`スラブ ${number} が読み込まれていません`)

    this.lastUsed[number] = ++this.clock

    return slab
  }

  startOf(ref: Ref): number {
    return positionOf(ref) + LENGTH_BYTES
  }

  lengthOf(ref: Ref): number {
    return readLength(this.slabFor(ref), positionOf(ref))
  }

  read(ref: Ref): Uint8Array {
    const slab = this.slabFor(ref)
    const start = this.startOf(ref)

    return slab.subarray(start, start + this.lengthOf(ref))
  }

  async ensure(refs: Iterable<Ref>): Promise<void> {
    const numbers = slabsOf(refs)

    this.loading.add(numbers)

    try {
      for (const number of numbers) await this.loadSlab(number)
    } finally {
      this.loading.delete(numbers)
      this.recent.push(numbers)

      if (this.recent.length > PINNED_CALLS) this.recent.shift()
    }
  }

  private async loadSlab(number: number): Promise<void> {
    if (this.slabs[number]) {
      this.lastUsed[number] = ++this.clock

      return
    }

    const bytes = await this.backend?.readSlab(number)

    if (!bytes) throw new Error(`スラブ ${number} を読み込めません`)

    if (this.slabs[number]) return

    const slab = new Uint8Array(SLAB_BYTES)

    slab.set(bytes)
    this.slabs[number] = slab
    this.lastUsed[number] = ++this.clock
    this.loadedSlabs++
    this.trim()
  }

  async settled(): Promise<void> {
    await this.pendingWrites
  }

  snapshot(): StoreSnapshot {
    return {
      slabCount: this.slabs.length - 1,
      tail: this.tail.slice(0, this.tailUsed),
    }
  }
}

function slabsOf(refs: Iterable<Ref>): Set<number> {
  const numbers = new Set<number>()

  for (const ref of refs) {
    if (ref !== EMPTY_REF && !isUniform(ref)) numbers.add(slabOf(ref))
  }

  return numbers
}

function makeRef(slab: number, position: number): Ref {
  return (((slab + 1) << 16) | (position >>> ALIGN_SHIFT)) >>> 0
}

function slabOf(ref: Ref): number {
  return (ref >>> 16) - 1
}

function positionOf(ref: Ref): number {
  return (ref & 0xffff) << ALIGN_SHIFT
}

function readLength(slab: Uint8Array, position: number): number {
  return slab[position] | (slab[position + 1] << 8)
}

function alignUp(position: number): number {
  const mask = (1 << ALIGN_SHIFT) - 1

  return (position + mask) & ~mask
}
