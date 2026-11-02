type Runner = () => void

let activeEffect: EffectNode | null = null

const queue = new Set<EffectNode>()
let isScheduled = false

function flush(): void {
  isScheduled = false

  const pending = [...queue]

  queue.clear()

  for (const node of pending) node.run()
}

function schedule(node: EffectNode): void {
  queue.add(node)

  if (isScheduled) return

  isScheduled = true
  queueMicrotask(flush)
}

class EffectNode {
  private readonly body: () => void | Runner
  private readonly sources = new Set<Set<EffectNode>>()
  private cleanup: void | Runner = undefined
  private isDisposed = false

  constructor(body: () => void | Runner) {
    this.body = body
  }

  track(subscribers: Set<EffectNode>): void {
    subscribers.add(this)
    this.sources.add(subscribers)
  }

  private release(): void {
    for (const subscribers of this.sources) subscribers.delete(this)

    this.sources.clear()

    if (this.cleanup) this.cleanup()

    this.cleanup = undefined
  }

  run(): void {
    if (this.isDisposed) return

    this.release()

    const previous = activeEffect

    activeEffect = this

    try {
      this.cleanup = this.body()
    } finally {
      activeEffect = previous
    }
  }

  dispose(): void {
    this.isDisposed = true
    this.release()
  }
}

export class Signal<T> {
  private current: T
  private readonly subscribers = new Set<EffectNode>()

  constructor(initial: T) {
    this.current = initial
  }

  get value(): T {
    activeEffect?.track(this.subscribers)

    return this.current
  }

  set value(next: T) {
    if (Object.is(next, this.current)) return

    this.current = next

    for (const node of this.subscribers) schedule(node)
  }

  peek(): T {
    return this.current
  }

  static bump(signal: Signal<number>): void {
    signal.value = signal.peek() + 1
  }
}

export function effect(body: () => void | Runner): Runner {
  const node = new EffectNode(body)

  node.run()

  return () => node.dispose()
}
