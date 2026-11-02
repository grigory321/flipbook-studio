import { ByteWriter } from '../core/bytes.ts'
import {
  bgmTracks,
  type Note,
  playSeconds,
  soundTracks,
  type Track,
  trackRate,
} from '../core/note.ts'
import { Yielder } from '../core/yielder.ts'
import { fadeEnd, floatToPcm, pcmToFloat, resample } from '../audio/pcm.ts'
import { BlobBuilder } from './blob-builder.ts'

const MIX_RATE = 44100
const MIX_BLOCK = MIX_RATE

interface Placed {
  start: number
  samples: Float32Array
  gain: number
}

function trackSamples(note: Note, track: Track): Float32Array | null {
  const sound = track.soundId ? note.sounds.get(track.soundId) : null

  if (!sound || track.muted) return null

  const rate = trackRate(track, note.fps)
  const samples = pcmToFloat(
    resample(sound.samples, sound.rate * rate, MIX_RATE),
  )
  const count = Math.round((playSeconds(track, sound) / rate) * MIX_RATE)

  return count < samples.length
    ? fadeEnd(samples.slice(0, count), MIX_RATE)
    : samples
}

function addRange(out: Float32Array, start: number, sound: Placed): void {
  const from = Math.max(start, sound.start)
  const to = Math.min(start + out.length, sound.start + sound.samples.length)

  for (let index = from; index < to; index++) {
    out[index - start] += sound.samples[index - sound.start] * sound.gain
  }
}

export class Mixdown {
  readonly rate = MIX_RATE
  readonly length: number
  private readonly bgm: Placed[] = []
  private readonly marks: Placed[] = []
  private readonly longest: number

  constructor(note: Note) {
    const { frames, meta } = note

    this.length = Math.ceil((frames.count / note.fps) * MIX_RATE)

    for (const track of bgmTracks(meta)) {
      const samples = trackSamples(note, track)
      const start = Math.round((track.offset / note.fps) * MIX_RATE)

      if (samples) this.bgm.push({ start, samples, gain: track.gain })
    }

    const sounds = soundTracks(meta)
    const soundData = sounds.map(track => trackSamples(note, track))
    let longest = 0

    for (let page = 0; page < frames.count; page++) {
      const marks = frames.sounds(page)

      if (marks === 0) continue

      const start = Math.round((page / note.fps) * MIX_RATE)

      soundData.forEach((samples, slot) => {
        if (!samples || !(marks & (1 << slot))) return

        this.marks.push({ start, samples, gain: sounds[slot].gain })
        longest = Math.max(longest, samples.length)
      })
    }

    this.longest = longest
  }

  render(start: number, out: Float32Array): void {
    out.fill(0)

    for (const sound of this.bgm) addRange(out, start, sound)

    const end = start + out.length

    for (
      let index = this.firstMarkFrom(start - this.longest);
      index < this.marks.length && this.marks[index].start < end;
      index++
    ) {
      addRange(out, start, this.marks[index])
    }
  }

  async *blocks(): AsyncGenerator<Float32Array<ArrayBuffer>> {
    const block = new Float32Array(MIX_BLOCK)
    const yielder = new Yielder()
    let peak = 1

    for (let start = 0; start < this.length; start += MIX_BLOCK) {
      const part = block.subarray(0, Math.min(MIX_BLOCK, this.length - start))

      this.render(start, part)

      for (const value of part) peak = Math.max(peak, Math.abs(value))

      await yielder.breathe()
    }

    for (let start = 0; start < this.length; start += MIX_BLOCK) {
      const part = block.subarray(0, Math.min(MIX_BLOCK, this.length - start))

      this.render(start, part)

      if (peak > 1) {
        for (let index = 0; index < part.length; index++) part[index] /= peak
      }

      yield part
      await yielder.breathe()
    }
  }

  private firstMarkFrom(sample: number): number {
    let low = 0
    let high = this.marks.length

    while (low < high) {
      const middle = (low + high) >>> 1

      if (this.marks[middle].start < sample) low = middle + 1
      else high = middle
    }

    return low
  }
}

export async function encodeWav(
  note: Note,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  const mix = new Mixdown(note)
  const data = new BlobBuilder()

  for await (const block of mix.blocks()) {
    const pcm = floatToPcm(block)

    data.write(pcm.byteLength, target => {
      target.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength))
    })
    onProgress?.(data.size / (mix.length * 2))
  }

  const bytes = mix.length * 2
  const header = new ByteWriter(44)

  header.bytes(new TextEncoder().encode('RIFF'))
  header.u32(36 + bytes)
  header.bytes(new TextEncoder().encode('WAVEfmt '))
  header.u32(16)
  header.u16(1)
  header.u16(1)
  header.u32(mix.rate)
  header.u32(mix.rate * 2)
  header.u16(2)
  header.u16(16)
  header.bytes(new TextEncoder().encode('data'))
  header.u32(bytes)

  return new Blob([header.finish(), ...data.finish()], { type: 'audio/wav' })
}
