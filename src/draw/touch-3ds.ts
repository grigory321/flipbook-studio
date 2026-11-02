export interface TouchSample {
  x: number
  y: number
  isTouching: boolean
}

export interface TouchPoint {
  x: number
  y: number
  isStart: boolean
}

interface SettledSample extends TouchSample {
  release: number
}

const single = Math.fround

const BLEND_STILL = single(0.6)
const BLEND_MOVING = single(0.4)
const BLEND_RATE = single(0.01)
const MIN_GAP = single(1.7)
const RELEASE_BLEND = [0.2, 0.5, 0.7, 0.8].map(single)
const LOOKAHEAD = 5
const NEW_STROKE_MS = 100
const MOVED_RANGE = 3

export class TouchFilter {
  private readonly pending: TouchSample[] = []
  private last: TouchSample = { x: 0, y: 0, isTouching: false }
  private time = -Infinity
  private hold = 0
  private smoothX = 0
  private smoothY = 0
  private blend = 0
  private sentX = 0
  private sentY = 0

  private settle(raw: TouchSample[]): SettledSample[] {
    const received = raw.slice(Math.max(0, raw.length - 7))
    const hadPending = this.pending.length > 0

    for (const sample of received) {
      const next = { ...sample }

      if (!next.isTouching && hadPending) {
        const previous = this.pending[this.pending.length - 1]

        next.x = previous.x
        next.y = previous.y
      }

      this.pending.push(next)
    }

    const out: SettledSample[] = []
    const queue = this.pending
    let previousX = this.last.x
    let previousY = this.last.y

    while (queue.length >= LOOKAHEAD) {
      let { x, y } = queue[0]

      const returnsToX =
        queue[1].x === previousX ||
        queue[2].x === previousX ||
        queue[3].x === previousX ||
        queue[4].x === previousX

      if (x !== previousX && returnsToX) x = previousX

      if (y !== previousY && queue[1].y === previousY) y = previousY

      previousX = x
      previousY = y

      let release = 0

      if (queue[0].isTouching) {
        for (let ahead = 1; ahead < LOOKAHEAD; ahead++) {
          if (!queue[ahead].isTouching) {
            release = ahead
            break
          }
        }
      }

      out.push({ x, y, isTouching: queue[0].isTouching, release })
      queue.shift()
    }

    if (out.length) {
      const newest = out[out.length - 1]

      this.last = { x: newest.x, y: newest.y, isTouching: newest.isTouching }
    }

    return out
  }

  private smooth(
    settled: SettledSample[],
    isFirstFrame: boolean,
    now: number,
    repeatsQuirk: boolean,
  ): TouchPoint[] {
    let isFirst = isFirstFrame

    if (now - this.time > NEW_STROKE_MS) isFirst = true

    const touched = settled.filter(sample => sample.isTouching)
    const count = touched.length

    if (isFirst && count) {
      this.smoothX = single(touched[0].x)
      this.smoothY = single(touched[0].y)
      this.blend = single(0.5)
    } else if (this.hold) {
      this.hold--
    }

    const startX = this.smoothX
    const startY = this.smoothY
    const hasMoved = count > 1 && this.measureMovement(touched)

    if (count > 1) this.hold = 2

    if (!hasMoved && this.blend < BLEND_STILL) {
      this.blend = single(this.blend + BLEND_RATE)
    } else if (hasMoved && this.blend > BLEND_MOVING) {
      this.blend = single(this.blend - BLEND_RATE)
    }

    const points: TouchPoint[] = []

    for (let index = 0; index < count; index++) {
      const sample = touched[index]
      const isLast = index === count - 1
      let release = sample.release

      const isNearStart =
        Math.abs(single(this.smoothX - startX)) < 2 &&
        Math.abs(single(this.smoothY - startY)) < 2

      if (isNearStart && !isLast) release = 0

      if (release) this.blend = single(this.blend * RELEASE_BLEND[release - 1])

      const keep = this.blend
      const take = single(1 - keep)

      this.smoothX = single(
        single(this.smoothX * keep) + single(sample.x * take),
      )
      this.smoothY = single(
        single(this.smoothY * keep) + single(sample.y * take),
      )

      let mustSend = (isFirst && index === 0) || (release !== 0 && isLast)

      const isInside =
        this.smoothX > 2 &&
        this.smoothX < 312 &&
        this.smoothY > 2 &&
        this.smoothY < 232

      if (!isInside) {
        mustSend = true
        this.blend = 0
      }

      const gapX = single(this.smoothX - this.sentX)
      const gapY = single(this.smoothY - this.sentY)
      const gap = single(
        Math.sqrt(single(single(gapX * gapX) + single(gapY * gapY))),
      )

      if (!mustSend && gap < MIN_GAP) continue

      points.push({
        x: Math.trunc(this.smoothX),
        y: Math.trunc(this.smoothY),
        isStart: false,
      })

      this.sentX = this.smoothX
      this.sentY = this.smoothY
    }

    if (repeatsQuirk && !points.length && count & 1) {
      points.push({
        x: Math.trunc(this.sentX),
        y: Math.trunc(this.sentY),
        isStart: false,
      })
    }

    if (points.length) points[0].isStart = isFirst

    this.time = now

    return points
  }

  private measureMovement(samples: SettledSample[]): boolean {
    let lowX = samples[0].x
    let highX = samples[0].x
    let lowY = samples[0].y
    let highY = samples[0].y

    for (const sample of samples) {
      lowX = Math.min(lowX, sample.x)
      highX = Math.max(highX, sample.x)
      lowY = Math.min(lowY, sample.y)
      highY = Math.max(highY, sample.y)
    }

    return highX - lowX >= MOVED_RANGE || highY - lowY >= MOVED_RANGE
  }

  frame(raw: TouchSample[], now: number, repeatsQuirk: boolean): TouchPoint[] {
    const wasTouching = this.last.isTouching
    const settled = this.settle(raw)
    const isFirst = !wasTouching && this.last.isTouching

    if (!isFirst && !wasTouching && !this.hold) return []

    return this.smooth(settled, isFirst, now, repeatsQuirk)
  }

  flush(now: number, repeatsQuirk: boolean, step: number): TouchPoint[] {
    const points: TouchPoint[] = []
    const released: TouchSample[] = [0, 1, 2, 3].map(() => ({
      x: 0,
      y: 0,
      isTouching: false,
    }))

    for (let index = 0; index < 8; index++) {
      const isTouching = this.pending.some(sample => sample.isTouching)

      if (!isTouching && !this.last.isTouching && !this.hold) break

      points.push(...this.frame(released, now + index * step, repeatsQuirk))
    }

    return points
  }
}
