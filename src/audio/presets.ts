import type { Sound } from '../core/note.ts'
import { floatToPcm } from './pcm.ts'

const RATE = 22050

export interface SoundPreset {
  readonly id: string
  readonly nameKey?: string
  readonly name?: string
  readonly seconds: number
  readonly wave: (t: number) => number
}

function decay(t: number, speed: number): number {
  return Math.exp(-t * speed)
}

function sine(t: number, frequency: number): number {
  return Math.sin(2 * Math.PI * frequency * t)
}

function square(t: number, frequency: number): number {
  return sine(t, frequency) >= 0 ? 0.5 : -0.5
}

let noiseState = 1

function noise(): number {
  noiseState = (Math.imul(noiseState, 1664525) + 1013904223) >>> 0

  return noiseState / 0x80000000 - 1
}

export const SOUND_PRESETS: readonly SoundPreset[] = [
  {
    id: 'pop',
    nameKey: 'sound.pop',
    seconds: 0.18,
    wave: t => sine(t, 520 + 900 * decay(t, 40)) * decay(t, 18),
  },
  {
    id: 'bounce',
    nameKey: 'sound.bounce',
    seconds: 0.3,
    wave: t => sine(t, 180 + 520 * t * 3) * decay(t, 9),
  },
  {
    id: 'sparkle',
    nameKey: 'sound.sparkle',
    seconds: 0.5,
    wave: t =>
      (sine(t, 1568) + sine(t, 2093) * 0.6 + sine(t, 3136) * 0.3) *
      0.5 *
      decay(t, 7),
  },
  {
    id: 'coin',
    nameKey: 'sound.coin',
    seconds: 0.35,
    wave: t => square(t, t < 0.07 ? 988 : 1319) * decay(t, 7),
  },
  {
    id: 'jump',
    nameKey: 'sound.jump',
    seconds: 0.28,
    wave: t => square(t, 260 + 900 * t) * decay(t, 6),
  },
  {
    id: 'thud',
    nameKey: 'sound.thud',
    seconds: 0.3,
    wave: t => (sine(t, 90 - 120 * t) + noise() * 0.2) * decay(t, 14),
  },
  {
    id: 'whoosh',
    nameKey: 'sound.whoosh',
    seconds: 0.4,
    wave: t => noise() * Math.sin((Math.PI * t) / 0.4) * 0.5,
  },
  {
    id: 'ding',
    nameKey: 'sound.ding',
    seconds: 0.7,
    wave: t => (sine(t, 880) + sine(t, 1760) * 0.4) * 0.7 * decay(t, 5),
  },
]

export function renderPreset(preset: SoundPreset, id: string): Sound {
  const length = Math.round(preset.seconds * RATE)
  const samples = new Float32Array(length)

  noiseState = 1

  for (let index = 0; index < length; index++) {
    samples[index] = preset.wave(index / RATE)
  }

  return {
    id,
    name: preset.id,
    rate: RATE,
    samples: floatToPcm(samples),
  }
}
