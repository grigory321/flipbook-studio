import {
  bgmTracks,
  type Note,
  playSeconds,
  type Sound,
  soundTracks,
  type Track,
  trackBase,
  trackRate,
} from '../core/note.ts'
import { pcmToFloat } from './pcm.ts'

const MIN_RATE = 3000
const MAX_RATE = 96000
const CUT_FADE_SECONDS = 0.008
const RESUME_WAIT_MS = 200

export class Mixer {
  private context: AudioContext | null = null
  private readonly buffers = new WeakMap<Sound, AudioBuffer>()
  private bgmSources: AudioBufferSourceNode[] = []
  private readonly markSources = new Set<AudioBufferSourceNode>()
  private output: GainNode | null = null

  prepare(): AudioContext | null {
    const AudioContextClass = globalThis.AudioContext

    if (!AudioContextClass) return null

    if (!this.context) {
      this.context = new AudioContextClass({ latencyHint: 'interactive' })
      this.output = this.context.createGain()
      this.output.connect(this.context.destination)
    }

    if (this.context.state === 'suspended') void this.context.resume()

    return this.context
  }

  async ready(): Promise<void> {
    const context = this.prepare()

    if (!context || context.state === 'running') return

    await Promise.race([
      context.resume(),
      new Promise(resolve => setTimeout(resolve, RESUME_WAIT_MS)),
    ])
  }

  get clock(): number | null {
    return this.context?.state === 'running' ? this.context.currentTime : null
  }

  get latency(): number {
    const context = this.context

    return context ? context.outputLatency || context.baseLatency || 0 : 0
  }

  private bufferOf(context: AudioContext, sound: Sound): AudioBuffer | null {
    if (sound.rate < MIN_RATE || sound.rate > MAX_RATE) return null

    const known = this.buffers.get(sound)

    if (known) return known

    const length = Math.max(1, sound.samples.length)
    const buffer = context.createBuffer(1, length, sound.rate)

    buffer.getChannelData(0).set(pcmToFloat(sound.samples))
    this.buffers.set(sound, buffer)

    return buffer
  }

  private start(
    note: Note,
    track: Track,
    offset: number,
    when: number,
  ): AudioBufferSourceNode | null {
    const context = this.prepare()
    const sound = track.soundId ? note.sounds.get(track.soundId) : null

    if (!context || !this.output || !sound || track.muted) return null

    const buffer = this.bufferOf(context, sound)

    if (!buffer) return null

    const remaining = playSeconds(track, sound) - offset

    if (remaining <= 0) return null

    const rate = trackRate(track, note.fps)
    const source = context.createBufferSource()
    const gain = context.createGain()

    source.buffer = buffer
    source.playbackRate.value = rate
    gain.gain.value = track.gain
    source.connect(gain).connect(this.output)
    source.start(when, offset, remaining)

    if (track.length !== null) {
      const endsAt = when + remaining / rate

      gain.gain.setValueAtTime(track.gain, endsAt - CUT_FADE_SECONDS)
      gain.gain.linearRampToValueAtTime(0, endsAt)
    }

    return source
  }

  scheduleMarks(note: Note, page: number, when: number): void {
    const marks = note.frames.sounds(page)

    if (marks === 0) return

    soundTracks(note.meta).forEach((track, slot) => {
      if (!(marks & (1 << slot))) return

      const source = this.start(note, track, 0, when)

      if (!source) return

      this.markSources.add(source)
      source.onended = () => this.markSources.delete(source)
    })
  }

  playMarks(note: Note, page: number): void {
    const context = this.prepare()

    if (context) this.scheduleMarks(note, page, context.currentTime)
  }

  preview(note: Note, track: Track): void {
    const context = this.prepare()

    if (context) this.start(note, track, 0, context.currentTime)
  }

  startBgm(note: Note, page: number, when?: number): void {
    const context = this.prepare()

    if (!context) return

    const at = when ?? context.currentTime

    this.stopBgm(at)

    for (const track of bgmTracks(note.meta)) {
      const pages = page - track.offset
      const source =
        pages >= 0
          ? this.start(note, track, pages / trackBase(track, note.fps), at)
          : this.start(note, track, 0, at - pages / note.fps)

      if (source) this.bgmSources.push(source)
    }
  }

  stopBgm(when?: number): void {
    for (const source of this.bgmSources) {
      try {
        source.stop(when)
      } catch {}
    }

    this.bgmSources = []
  }

  stopAll(): void {
    this.stopBgm()

    for (const source of this.markSources) {
      try {
        source.stop()
      } catch {}
    }

    this.markSources.clear()
  }
}
