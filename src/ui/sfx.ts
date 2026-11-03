import { settings } from '../app/settings.ts'

export type SfxName = 'move' | 'back' | 'page' | 'error' | 'start' | 'tap'

export type ScribbleKind = 'pen' | 'eraser'

const OUTPUT_LOWPASS_HZ = 5000
const NOISE_SECONDS = 2
const SCRIBBLE_SMOOTHING = 0.03
const SCRIBBLE_RELEASE = 0.08
const VOLUME_SCALE = 10
const LOUDNESS = 2.5

interface Note {
  frequency: number
  at?: number
  decay: number
  volume: number
  bend?: number
}

const SOUNDS: Readonly<Record<Exclude<SfxName, 'page'>, readonly Note[]>> = {
  tap: [{ frequency: 520, decay: 0.05, volume: 0.05, bend: 0.8 }],
  move: [{ frequency: 740, decay: 0.035, volume: 0.022 }],
  back: [
    { frequency: 494, decay: 0.08, volume: 0.06, bend: 0.85 },
    { frequency: 392, at: 0.05, decay: 0.1, volume: 0.05, bend: 0.9 },
  ],
  error: [
    { frequency: 233, decay: 0.09, volume: 0.09, bend: 0.92 },
    { frequency: 196, at: 0.09, decay: 0.13, volume: 0.09, bend: 0.92 },
  ],
  start: [
    { frequency: 523, decay: 0.14, volume: 0.07 },
    { frequency: 659, at: 0.09, decay: 0.14, volume: 0.07 },
    { frequency: 784, at: 0.18, decay: 0.14, volume: 0.07 },
    { frequency: 1047, at: 0.27, decay: 0.32, volume: 0.07 },
  ],
}

interface ScribbleVoice {
  source: AudioBufferSourceNode
  gain: GainNode
  filter: BiquadFilterNode
}

const SCRIBBLE_TONE: Readonly<
  Record<ScribbleKind, { center: number; q: number; level: number }>
> = {
  pen: { center: 2100, q: 0.6, level: 0.05 },
  eraser: { center: 750, q: 0.9, level: 0.08 },
}

export class SoundBoard {
  private readonly context: BaseAudioContext
  private readonly output: GainNode
  private readonly noise: AudioBuffer
  private scribble: ScribbleVoice | null = null

  constructor(context: BaseAudioContext) {
    this.context = context
    this.output = context.createGain()
    this.noise = makeNoise(context)

    const lowpass = context.createBiquadFilter()

    lowpass.type = 'lowpass'
    lowpass.frequency.value = OUTPUT_LOWPASS_HZ
    lowpass.Q.value = 0.5
    this.output.connect(lowpass).connect(context.destination)
  }

  setVolume(volume: number): void {
    this.output.gain.value = volume * LOUDNESS
  }

  private playNote(note: Note, start: number): void {
    const { context } = this
    const time = start + (note.at ?? 0)
    const end = time + note.decay * 4
    const gain = context.createGain()

    gain.gain.setValueAtTime(0.0001, time)
    gain.gain.exponentialRampToValueAtTime(note.volume, time + 0.004)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    gain.connect(this.output)

    for (const [ratio, level] of [
      [1, 1],
      [4, 0.1],
    ]) {
      const oscillator = context.createOscillator()
      const partial = context.createGain()
      const frequency = note.frequency * ratio

      oscillator.frequency.setValueAtTime(frequency, time)

      if (note.bend) {
        oscillator.frequency.exponentialRampToValueAtTime(
          frequency * note.bend,
          time + note.decay,
        )
      }

      partial.gain.value = level
      oscillator.connect(partial).connect(gain)
      oscillator.start(time)
      oscillator.stop(end)
    }
  }

  private playPage(start: number): void {
    const { context } = this
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()
    const end = start + 0.22

    source.buffer = this.noise
    filter.type = 'bandpass'
    filter.Q.value = 0.7
    filter.frequency.setValueAtTime(2200, start)
    filter.frequency.exponentialRampToValueAtTime(800, end)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.035)
    gain.gain.exponentialRampToValueAtTime(0.0001, end)
    source.connect(filter).connect(gain).connect(this.output)
    source.start(start, Math.random())
    source.stop(end)

    this.playNote(
      { frequency: 150, decay: 0.05, volume: 0.04, bend: 0.8 },
      start + 0.12,
    )
  }

  play(name: SfxName): void {
    const now = this.context.currentTime

    if (name === 'page') {
      this.playPage(now)

      return
    }

    for (const note of SOUNDS[name]) this.playNote(note, now)
  }

  startScribble(kind: ScribbleKind): void {
    this.stopScribble()

    const { context } = this
    const tone = SCRIBBLE_TONE[kind]
    const source = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const gain = context.createGain()

    source.buffer = this.noise
    source.loop = true
    filter.type = 'bandpass'
    filter.frequency.value = tone.center
    filter.Q.value = tone.q
    gain.gain.value = 0
    source.connect(filter).connect(gain).connect(this.output)
    source.start(0, Math.random())

    this.scribble = { source, gain, filter }
    this.scribbleLevel = tone.level
    this.scribbleCenter = tone.center
  }

  private scribbleLevel = 0
  private scribbleCenter = 0

  updateScribble(speed: number): void {
    const voice = this.scribble

    if (!voice) return

    const now = this.context.currentTime
    const amount = Math.min(1, speed)
    const level = this.scribbleLevel * Math.sqrt(amount)
    const center = this.scribbleCenter * (0.8 + amount * 0.4)

    voice.gain.gain.setTargetAtTime(level, now, SCRIBBLE_SMOOTHING)
    voice.filter.frequency.setTargetAtTime(center, now, SCRIBBLE_SMOOTHING)
  }

  stopScribble(): void {
    const voice = this.scribble

    if (!voice) return

    const now = this.context.currentTime

    voice.gain.gain.setTargetAtTime(0, now, SCRIBBLE_RELEASE / 3)
    voice.source.stop(now + SCRIBBLE_RELEASE * 2)
    this.scribble = null
  }
}

function makeNoise(context: BaseAudioContext): AudioBuffer {
  const length = Math.round(context.sampleRate * NOISE_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let smooth = 0

  for (let index = 0; index < length; index++) {
    smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4
    data[index] = smooth
  }

  return buffer
}

let board: SoundBoard | null = null
let context: AudioContext | null = null

function currentVolume(): number {
  return settings.sfxVolume.peek() / VOLUME_SCALE
}

export function unlockSfx(): void {
  if (!context && globalThis.AudioContext) {
    context = new AudioContext({ latencyHint: 'interactive' })
    board = new SoundBoard(context)
  }

  if (context?.state === 'suspended') void context.resume()
}

function readyBoard(): SoundBoard | null {
  if (!board || context?.state !== 'running') return null

  board.setVolume(currentVolume())

  return board
}

export function playSfx(name: SfxName): void {
  if (settings.sfx.peek()) readyBoard()?.play(name)
}

export function startScribble(kind: ScribbleKind): void {
  if (settings.drawSounds.peek()) readyBoard()?.startScribble(kind)
}

export function updateScribble(speed: number): void {
  board?.updateScribble(speed)
}

export function stopScribble(): void {
  board?.stopScribble()
}
