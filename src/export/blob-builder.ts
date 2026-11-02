const BATCH_BYTES = 1 << 20

export class BlobBuilder {
  private readonly parts: Blob[] = []
  private readonly buffer = new Uint8Array(BATCH_BYTES)
  private used = 0
  private total = 0

  get size(): number {
    return this.total
  }

  add(bytes: Uint8Array): void {
    this.write(bytes.length, target => target.set(bytes))
  }

  write(length: number, copy: (target: Uint8Array<ArrayBuffer>) => void): void {
    this.total += length

    if (length > BATCH_BYTES) {
      const own = new Uint8Array(length)

      this.flush()
      copy(own)
      this.parts.push(new Blob([own]))

      return
    }

    if (this.used + length > BATCH_BYTES) this.flush()

    copy(this.buffer.subarray(this.used, this.used + length))
    this.used += length
  }

  finish(): Blob[] {
    this.flush()

    return this.parts
  }

  private flush(): void {
    if (this.used === 0) return

    this.parts.push(new Blob([this.buffer.subarray(0, this.used)]))
    this.used = 0
  }
}
