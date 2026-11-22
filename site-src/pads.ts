import { SOUND_PRESETS } from '../src/audio/presets.ts'

const RATE = 22050
const VOLUME = 0.5

export function startPads(): void {
  const pads = [...document.querySelectorAll<HTMLButtonElement>('[data-sound]')]

  if (!pads.length) return

  const rows = [...document.querySelectorAll<HTMLElement>('.timeline-se')]
  let audio: AudioContext | null = null
  const buffers = new Map<string, AudioBuffer>()

  const bufferOf = (context: AudioContext, id: string): AudioBuffer | null => {
    const cached = buffers.get(id)

    if (cached) return cached

    const preset = SOUND_PRESETS.find(item => item.id === id)

    if (!preset) return null

    const length = Math.round(preset.seconds * RATE)
    const buffer = context.createBuffer(1, length, RATE)
    const data = buffer.getChannelData(0)

    for (let index = 0; index < length; index++) {
      data[index] = Math.max(-1, Math.min(1, preset.wave(index / RATE)))
    }

    buffers.set(id, buffer)

    return buffer
  }

  for (const pad of pads) {
    pad.addEventListener('click', () => {
      audio ??= new AudioContext()

      const context = audio
      const buffer = bufferOf(context, pad.dataset.sound ?? '')

      if (!buffer) return

      void context.resume()

      const source = context.createBufferSource()
      const gain = context.createGain()

      gain.gain.value = VOLUME
      source.buffer = buffer
      source.connect(gain).connect(context.destination)
      source.start()
      const row = rows[Number(pad.dataset.track)]

      pad.classList.add('is-playing')
      row?.classList.add('is-hit')
      source.addEventListener('ended', () => {
        pad.classList.remove('is-playing')
        row?.classList.remove('is-hit')
      })
    })
  }
}
