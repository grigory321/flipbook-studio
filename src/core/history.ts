export interface HistoryStep {
  readonly page: number
  readonly undoPage?: number
  readonly bytes?: number
  undo(): void
  redo(): void
}

const STEP_LIMIT = 256

const BYTE_LIMIT = 32 * 1024 * 1024

const STEP_OVERHEAD = 256

function sizeOf(step: HistoryStep): number {
  return STEP_OVERHEAD + (step.bytes ?? 0)
}

export class History {
  private readonly done: HistoryStep[] = []
  private readonly undone: HistoryStep[] = []
  private heldBytes = 0

  get canUndo(): boolean {
    return this.done.length > 0
  }

  get canRedo(): boolean {
    return this.undone.length > 0
  }

  get byteLength(): number {
    return this.heldBytes
  }

  push(step: HistoryStep): void {
    for (const dropped of this.undone) this.heldBytes -= sizeOf(dropped)

    this.undone.length = 0
    this.done.push(step)
    this.heldBytes += sizeOf(step)

    while (
      this.done.length > 1 &&
      (this.done.length > STEP_LIMIT || this.heldBytes > BYTE_LIMIT)
    ) {
      const oldest = this.done.shift()

      if (oldest) this.heldBytes -= sizeOf(oldest)
    }
  }

  run(step: HistoryStep): void {
    step.redo()
    this.push(step)
  }

  undo(): HistoryStep | null {
    const step = this.done.pop()

    if (!step) return null

    step.undo()
    this.undone.push(step)

    return step
  }

  redo(): HistoryStep | null {
    const step = this.undone.pop()

    if (!step) return null

    step.redo()
    this.done.push(step)

    return step
  }

  clear(): void {
    this.done.length = 0
    this.undone.length = 0
    this.heldBytes = 0
  }
}
