const TAPS = 16
const HALF_TAPS = TAPS / 2
const PHASES = 256

function sinc(value: number): number {
  if (Math.abs(value) < 1e-9) return 1

  return Math.sin(Math.PI * value) / (Math.PI * value)
}

function buildKernel(cutoff: number): Float32Array {
  const kernel = new Float32Array(PHASES * TAPS)

  for (let phase = 0; phase < PHASES; phase++) {
    let sum = 0

    for (let tap = 0; tap < TAPS; tap++) {
      const distance = tap - (HALF_TAPS - 1) - phase / PHASES
      const window = sinc(distance / HALF_TAPS)
      const value = cutoff * sinc(distance * cutoff) * window

      kernel[phase * TAPS + tap] = value
      sum += value
    }

    for (let tap = 0; tap < TAPS; tap++) kernel[phase * TAPS + tap] /= sum
  }

  return kernel
}

const CUT_FADE_SECONDS = 0.008

export function fadeEnd<T extends Int16Array | Float32Array>(
  samples: T,
  rate: number,
): T {
  const { length } = samples
  const fade = Math.min(length, Math.round(rate * CUT_FADE_SECONDS))

  for (let index = 0; index < fade; index++) {
    samples[length - 1 - index] *= index / fade
  }

  return samples
}

export function resample(
  source: Int16Array,
  fromRate: number,
  toRate: number,
): Int16Array<ArrayBuffer> {
  if (source.length === 0 || fromRate === toRate) return source.slice()

  const cutoff = Math.min(1, toRate / fromRate) * 0.94
  const kernel = buildKernel(cutoff)
  const length = Math.max(1, Math.round((source.length * toRate) / fromRate))
  const out = new Int16Array(length)
  const step = fromRate / toRate
  const last = source.length - 1

  for (let index = 0; index < length; index++) {
    const position = index * step
    const base = Math.floor(position)
    const phase = Math.min(PHASES - 1, Math.round((position - base) * PHASES))
    let value = 0

    for (let tap = 0; tap < TAPS; tap++) {
      const at = base + tap - (HALF_TAPS - 1)
      const sample = source[at < 0 ? 0 : at > last ? last : at]

      value += sample * kernel[phase * TAPS + tap]
    }

    out[index] = value > 32767 ? 32767 : value < -32768 ? -32768 : value
  }

  return out
}

export function applyGain(
  samples: Int16Array<ArrayBuffer>,
  gain: number,
): Int16Array<ArrayBuffer> {
  if (gain === 1) return samples

  const out = new Int16Array(samples.length)

  for (let index = 0; index < out.length; index++) {
    const value = samples[index] * gain

    out[index] = value > 32767 ? 32767 : value < -32768 ? -32768 : value
  }

  return out
}

export function floatToPcm(samples: Float32Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(samples.length)

  for (let index = 0; index < out.length; index++) {
    const value = Math.max(-1, Math.min(1, samples[index]))

    out[index] = Math.round(value * 32767)
  }

  return out
}

export function pcmToFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length)

  for (let index = 0; index < out.length; index++) {
    out[index] = samples[index] / 32768
  }

  return out
}
