import type { Compositor, Region } from '../core/compositor.ts'
import type { Note } from '../core/note.ts'
import type { Mixer } from '../audio/mixer.ts'

const READ_AHEAD_PAGES = 32
const START_LEAD = 0.06
const SCHEDULE_AHEAD = 0.15
const LATE_LIMIT = 0.1

export interface PlayerView {
  present(region: Region | null, page: number): void
  onPage(page: number): void
  onEnded(page: number): void
}

export class Player {
  private readonly note: Note
  private readonly compositor: Compositor
  private readonly mixer: Mixer
  private readonly view: PlayerView

  private frameRequest = 0
  private origin = 0
  private startStep = 0
  private nextStep = 0
  private shownPage = -1
  private isRunning = false
  private isBuffering = false
  private usesAudioClock = false
  private loadedUntil = 0

  constructor(
    note: Note,
    compositor: Compositor,
    mixer: Mixer,
    view: PlayerView,
  ) {
    this.note = note
    this.compositor = compositor
    this.mixer = mixer
    this.view = view
  }

  get running(): boolean {
    return this.isRunning
  }

  private now(): number {
    const clock = this.usesAudioClock ? this.mixer.clock : null

    return clock ?? performance.now() / 1000
  }

  start(page: number): void {
    if (this.isRunning) return

    const count = this.note.frames.count

    this.isRunning = true
    this.usesAudioClock = this.mixer.clock !== null
    this.shownPage = -1
    this.compositor.invalidate()
    this.loadedUntil = page >= count - 1 ? 0 : page
    this.begin(this.loadedUntil)
    this.frameRequest = requestAnimationFrame(this.loop)
  }

  private begin(step: number): void {
    const page = step % this.note.frames.count

    this.origin = this.now() + START_LEAD
    this.startStep = step
    this.nextStep = step

    if (this.usesAudioClock) this.mixer.startBgm(this.note, page, this.origin)
  }

  stop(): void {
    this.isRunning = false
    cancelAnimationFrame(this.frameRequest)
    this.mixer.stopAll()
  }

  private readonly loop = (): void => {
    if (!this.isRunning) return

    if (!this.isBuffering) this.advance()

    this.frameRequest = requestAnimationFrame(this.loop)
  }

  private timeOf(step: number): number {
    return this.origin + (step - this.startStep) / this.note.fps
  }

  private schedule(now: number): void {
    const { frames, meta } = this.note

    if (!this.usesAudioClock) return

    while (this.timeOf(this.nextStep) <= now + SCHEDULE_AHEAD) {
      const step = this.nextStep
      const at = this.timeOf(step)

      if (step >= frames.count && !meta.loop) return

      const page = step % frames.count

      if (page === 0 && step > this.startStep) {
        this.mixer.startBgm(this.note, 0, at)
      }

      if (at >= now - LATE_LIMIT) {
        this.mixer.scheduleMarks(this.note, page, Math.max(at, now))
      }

      this.nextStep++
    }
  }

  private advance(): void {
    const { frames, meta } = this.note
    const now = this.now()
    const seen = now - (this.usesAudioClock ? this.mixer.latency : 0)
    const elapsed = Math.max(0, (seen - this.origin) * this.note.fps)
    const step = this.startStep + Math.floor(elapsed)

    this.schedule(now)

    if (step >= frames.count && !meta.loop) {
      const last = frames.count - 1

      this.show(last, step)
      this.stop()
      this.view.onEnded(last)

      return
    }

    const page = step % frames.count

    if (page !== this.shownPage) this.show(page, step)
  }

  private show(page: number, step: number): void {
    this.readAhead(page)

    try {
      this.view.present(this.compositor.composePage(page), page)
    } catch {
      void this.waitFor(page, step)

      return
    }

    this.shownPage = page
    this.view.onPage(page)
  }

  private readAhead(page: number): void {
    const count = this.note.frames.count

    if (page + READ_AHEAD_PAGES / 2 < this.loadedUntil) return
    if (this.loadedUntil >= count) return

    const start = Math.max(page, this.loadedUntil)

    this.loadedUntil = start + READ_AHEAD_PAGES
    void this.note.ensurePages(start, READ_AHEAD_PAGES)
  }

  private async waitFor(page: number, step: number): Promise<void> {
    this.isBuffering = true
    this.mixer.stopAll()
    await this.note.ensurePages(page, READ_AHEAD_PAGES)
    this.isBuffering = false

    if (this.isRunning) this.begin(step)
  }
}
