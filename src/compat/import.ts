import { packPlane } from '../core/cel.ts'
import { FrameTable, withDepth, withInk } from '../core/frames.ts'
import {
  bgmTracks,
  createId,
  type FlipnoteInfo,
  Note,
  type Sound,
  soundTracks,
  type Track,
} from '../core/note.ts'
import { EMPTY_REF, Store } from '../core/store.ts'
import { Yielder } from '../core/yielder.ts'
import {
  KWZ_BORDER,
  KWZ_FLAG_ADVANCED,
  KWZ_FRAME_WIDTH,
  KWZ_RATE,
  KwzReader,
} from './kwz.ts'
import { PPM_RATE, PpmReader } from './ppm.ts'

export type ProgressCallback = (done: number, total: number) => void

export interface ImportOptions {
  store?: Store
  fallbackTitle?: string
  onProgress?: ProgressCallback
}

function isFlipnote(bytes: Uint8Array): 'ppm' | 'kwz' | null {
  const text = String.fromCharCode(...bytes.subarray(0, 4))

  if (text === 'PARA') return 'ppm'

  return text.startsWith('K') ? 'kwz' : null
}

export function importFlipnote(
  bytes: Uint8Array,
  options: ImportOptions = {},
): Promise<Note> {
  const kind = isFlipnote(bytes)

  if (kind === 'ppm') return importPpm(bytes, options)
  if (kind === 'kwz') return importKwz(bytes, options)

  throw new RangeError('うごメモの作品ではありません')
}

function addTrackSound(
  note: Note,
  track: Track,
  samples: Int16Array<ArrayBuffer> | null,
  rate: number,
): void {
  if (!samples?.length) return

  const sound: Sound = { id: createId(), name: track.name, rate, samples }

  note.sounds.set(sound.id, sound)
  track.soundId = sound.id
  track.baseFps =
    track.kind === 'bgm'
      ? (note.profile.speeds[note.meta.bgmSpeed] ?? note.fps)
      : note.fps
}

function titleOf(info: FlipnoteInfo, options: ImportOptions): string {
  return info.currentName || options.fallbackTitle || ''
}

async function importPpm(
  bytes: Uint8Array,
  options: ImportOptions,
): Promise<Note> {
  const reader = new PpmReader(bytes)
  const store = options.store ?? new Store()
  const note = Note.create(
    { title: titleOf(reader.info, options), profile: 'dsi' },
    store,
  )

  note.meta.speed = reader.speed - 1
  note.meta.bgmSpeed = reader.bgmSpeed - 1
  note.meta.loop = reader.loop
  note.meta.flipnote = reader.info

  const table = emptyTable(note)
  const scratch = new Uint32Array(note.grid.count)
  const yielder = new Yielder()
  let page = 0

  for (const frame of reader.frames()) {
    const paper = frame.paper === 1 ? 0 : 1
    let inks = 0

    inks = withInk(inks, 0, 0, frame.pens[0] || 1)
    inks = withInk(inks, 1, 0, frame.pens[1] || 1)

    table.insertBlank(page, paper, inks)
    table.setSounds(page, frame.sounds)

    for (let layer = 0; layer < 2; layer++) {
      const plane = frame.layers[layer]

      table.setCel(page, layer, packPlane(store, plane, note.grid, scratch))
    }

    page++
    options.onProgress?.(page, reader.frameCount)
    await yielder.breathe()
  }

  const audio = reader.audio()

  assignAudio(note, audio.bgm, audio.sounds, PPM_RATE)

  return adopt(note, table, reader.thumbnailPage)
}

async function importKwz(
  bytes: Uint8Array,
  options: ImportOptions,
): Promise<Note> {
  const reader = new KwzReader(bytes)
  const store = options.store ?? new Store()
  const note = Note.create(
    { title: titleOf(reader.info, options), profile: '3ds' },
    store,
  )

  note.meta.speed = Math.min(reader.speed, note.profile.speeds.length - 1)
  note.meta.bgmSpeed = Math.min(reader.bgmSpeed, note.profile.speeds.length - 1)
  note.meta.loop = reader.loop
  note.meta.flipnote = reader.info
  note.meta.oneSheet = (reader.info.flags & KWZ_FLAG_ADVANCED) === 0

  const { width, height } = note.meta
  const table = emptyTable(note)
  const scratch = new Uint32Array(note.grid.count)
  const crop = new Uint8Array(width * height)
  const yielder = new Yielder()
  const lastCels = [EMPTY_REF, EMPTY_REF, EMPTY_REF]
  let page = 0

  for (const frame of reader.frames()) {
    let depths = 0

    frame.depth.forEach((depth, layer) => {
      depths = withDepth(depths, layer, depth)
    })

    let inks = 0

    frame.colors.forEach((color, index) => {
      inks = withInk(inks, index >> 1, index & 1, color)
    })

    table.insertBlank(page, frame.paper, inks, depths)
    table.setSounds(page, frame.sounds)

    for (let layer = 0; layer < 3; layer++) {
      if (page === 0 || !frame.unchanged?.[layer]) {
        cropPlane(frame.layers[layer], crop, width, height)
        lastCels[layer] = packPlane(store, crop, note.grid, scratch)
      }

      table.setCel(page, layer, lastCels[layer])
    }

    page++
    options.onProgress?.(page, reader.frameCount)
    await yielder.breathe()
  }

  const audio = reader.audio()

  assignAudio(note, audio.bgm, audio.sounds, KWZ_RATE)

  return adopt(note, table, reader.thumbnailPage)
}

function cropPlane(
  source: Uint8Array,
  target: Uint8Array,
  width: number,
  height: number,
): void {
  for (let y = 0; y < height; y++) {
    const start = (y + KWZ_BORDER) * KWZ_FRAME_WIDTH + KWZ_BORDER

    target.set(source.subarray(start, start + width), y * width)
  }
}

function emptyTable(note: Note): FrameTable {
  return new FrameTable(note.meta.layers.length, 256)
}

function assignAudio(
  note: Note,
  bgm: Int16Array<ArrayBuffer> | null,
  sounds: (Int16Array<ArrayBuffer> | null)[],
  rate: number,
): void {
  const tracks = soundTracks(note.meta)

  addTrackSound(note, bgmTracks(note.meta)[0], bgm, rate)

  sounds.forEach((samples, slot) => {
    if (tracks[slot]) addTrackSound(note, tracks[slot], samples, rate)
  })
}

function adopt(note: Note, table: FrameTable, thumbnailPage: number): Note {
  note.frames.removeRows(0, note.frames.count)
  note.frames.insertRows(0, table.copyRows(0, table.count))
  note.meta.plugins.thumbnailPage = thumbnailPage

  return note
}
