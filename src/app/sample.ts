import { packPlane } from '../core/cel.ts'
import { type Note, soundTracks } from '../core/note.ts'
import { renderPreset, SOUND_PRESETS } from '../audio/presets.ts'

const PAGES = 12
const BALL_RADIUS = 26
const GROUND_RATIO = 0.8
const ORANGE = 3
const INK = 1
const GROUND_STEP = 6

function drawDisc(
  plane: Uint8Array,
  width: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  value: number,
): void {
  const height = plane.length / width

  for (let y = -radiusY; y <= radiusY; y++) {
    for (let x = -radiusX; x <= radiusX; x++) {
      const distance =
        (x * x) / (radiusX * radiusX) + (y * y) / (radiusY * radiusY)
      const pixelX = centerX + x
      const pixelY = centerY + y

      if (distance > 1 || pixelY < 0 || pixelY >= height) continue

      plane[pixelY * width + pixelX] = value
    }
  }
}

export function fillSampleNote(note: Note): void {
  const { frames, grid, meta, store } = note
  const { width, height } = meta
  const scratch = new Uint32Array(grid.count)
  const plane = new Uint8Array(width * height)
  const groundY = Math.round(height * GROUND_RATIO)
  const background = new Uint8Array(width * height)

  for (let x = 0; x < width; x++) {
    background[groundY * width + x] = INK
    background[(groundY + 1) * width + x] = INK

    if (x % GROUND_STEP === 0) {
      background[(groundY + 8) * width + x] = INK
    }
  }

  frames.setCel(0, 1, packPlane(store, background, grid, scratch))

  const pop = renderPreset(SOUND_PRESETS[1], 'sample-bounce')

  note.sounds.set(pop.id, pop)
  soundTracks(meta)[0].soundId = pop.id

  for (let page = 0; page < PAGES; page++) {
    if (page > 0) {
      frames.insertBlank(page, frames.paper(0), frames.inks(0))
      frames.setCel(page, 1, frames.cel(0, 1))
    }

    const phase = page / PAGES
    const hop = Math.abs(Math.sin(phase * Math.PI * 2))
    const squash = hop < 0.2 ? 0.2 - hop : 0
    const centerX = Math.round(width * (0.15 + phase * 0.7))
    const radiusY = Math.round(BALL_RADIUS * (1 - squash * 2))
    const radiusX = Math.round(BALL_RADIUS * (1 + squash))
    const bottom = groundY - 1 - Math.round(hop * height * 0.5)

    plane.fill(0)
    drawDisc(plane, width, centerX, bottom - radiusY, radiusX, radiusY, ORANGE)
    drawDisc(plane, width, centerX + 8, bottom - radiusY - 6, 3, 4, INK)
    drawDisc(plane, width, centerX - 8, bottom - radiusY - 6, 3, 4, INK)

    frames.setCel(page, 0, packPlane(store, plane, grid, scratch))

    if (hop < 0.26) frames.setSounds(page, 1)
  }
}
