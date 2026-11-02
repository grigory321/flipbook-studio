const SLICE_MS = 12

export class Yielder {
  private started = performance.now()

  async breathe(): Promise<void> {
    if (performance.now() - this.started < SLICE_MS) return

    await new Promise(resolve => setTimeout(resolve))

    this.started = performance.now()
  }
}
