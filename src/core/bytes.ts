const CRC_TABLE = buildCrcTable()

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index++) {
    let value = index

    for (let bit = 0; bit < 8; bit++) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    table[index] = value >>> 0
  }

  return table
}

export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = ~seed

  for (let index = 0; index < bytes.length; index++) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8)
  }

  return ~crc >>> 0
}

export function hash32(bytes: Uint8Array, start: number, end: number): number {
  let hash = 0x811c9dc5

  for (let index = start; index < end; index++) {
    hash = Math.imul(hash ^ bytes[index], 0x01000193)
  }

  return hash >>> 0
}

export class ByteWriter {
  private buffer: Uint8Array
  private view: DataView
  private position = 0

  constructor(capacity = 256) {
    this.buffer = new Uint8Array(capacity)
    this.view = new DataView(this.buffer.buffer)
  }

  get length(): number {
    return this.position
  }

  private reserve(extra: number): void {
    const needed = this.position + extra

    if (needed <= this.buffer.length) return

    const grown = new Uint8Array(Math.max(needed, this.buffer.length * 2))

    grown.set(this.buffer.subarray(0, this.position))
    this.buffer = grown
    this.view = new DataView(grown.buffer)
  }

  u8(value: number): void {
    this.reserve(1)
    this.buffer[this.position++] = value
  }

  u16(value: number): void {
    this.reserve(2)
    this.view.setUint16(this.position, value, true)
    this.position += 2
  }

  u32(value: number): void {
    this.reserve(4)
    this.view.setUint32(this.position, value >>> 0, true)
    this.position += 4
  }

  bytes(value: Uint8Array): void {
    this.reserve(value.length)
    this.buffer.set(value, this.position)
    this.position += value.length
  }

  varint(value: number): void {
    let rest = value

    while (rest >= 0x80) {
      this.u8((rest % 0x80) | 0x80)
      rest = Math.floor(rest / 0x80)
    }

    this.u8(rest)
  }

  zigzag(value: number): void {
    this.varint(value < 0 ? -2 * value - 1 : 2 * value)
  }

  text(value: string): void {
    const encoded = new TextEncoder().encode(value)

    this.varint(encoded.length)
    this.bytes(encoded)
  }

  finish(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.position)
  }
}

export class ByteReader<B extends ArrayBufferLike = ArrayBufferLike> {
  private readonly view: DataView
  private position = 0

  private readonly source: Uint8Array<B>

  constructor(source: Uint8Array<B>) {
    this.source = source
    this.view = new DataView(
      source.buffer,
      source.byteOffset,
      source.byteLength,
    )
  }

  get offset(): number {
    return this.position
  }

  get remaining(): number {
    return this.source.length - this.position
  }

  private need(count: number): void {
    if (count > this.remaining)
      throw new RangeError('データが途中で切れています')
  }

  u8(): number {
    this.need(1)

    return this.source[this.position++]
  }

  u16(): number {
    this.need(2)

    const value = this.view.getUint16(this.position, true)

    this.position += 2

    return value
  }

  u32(): number {
    this.need(4)

    const value = this.view.getUint32(this.position, true)

    this.position += 4

    return value
  }

  bytes(count: number): Uint8Array<B> {
    this.need(count)

    const value = this.source.subarray(this.position, this.position + count)

    this.position += count

    return value
  }

  varint(): number {
    let value = 0
    let scale = 1

    for (;;) {
      const byte = this.u8()

      value += (byte & 0x7f) * scale

      if (byte < 0x80) return value

      scale *= 0x80
    }
  }

  zigzag(): number {
    const value = this.varint()

    return value % 2 ? -(value + 1) / 2 : value / 2
  }

  text(): string {
    return new TextDecoder().decode(this.bytes(this.varint()))
  }
}
