import { loadPlane } from '../core/cel.ts'
import { Compositor, shrinkPixels } from '../core/compositor.ts'
import { depthOf, inkOf } from '../core/frames.ts'
import {
  bgmTracks,
  type FlipnoteInfo,
  type Note,
  playSeconds,
  soundTracks,
  trackRate,
  type Track,
} from '../core/note.ts'
import {
  type AudioLimits,
  DSI_AUDIO,
  N3DS_AUDIO,
  PROFILES,
  rgbaWord,
} from '../core/profile.ts'
import { Yielder } from '../core/yielder.ts'
import { applyGain, fadeEnd, resample } from '../audio/pcm.ts'
import {
  KWZ_BORDER,
  KWZ_FLAG_ADVANCED,
  KWZ_FRAME_HEIGHT,
  KWZ_FRAME_WIDTH,
  type KwzFrame,
  writeKwz,
} from './kwz.ts'
import {
  formatPpmFileName,
  makeKwzFileName,
  ppmLocalFileName,
  randomHex,
} from './naming.ts'
import {
  PPM_HEIGHT,
  PPM_MAX_BYTES,
  PPM_MAX_FRAME_BYTES,
  PPM_WIDTH,
  type PpmFrame,
  writePpm,
} from './ppm.ts'
import {
  encodePpmThumbnail,
  fitPixels,
  quantizeForKwz,
  quantizeForPpm,
} from './quantize.ts'
import { canSign } from './sign.ts'
import type { ProgressCallback } from './import.ts'

const LOAD_WINDOW = 32
const NAME_LIMIT = 10
const KWZ_THUMBNAIL_WIDTH = 80
const KWZ_THUMBNAIL_HEIGHT = 64
const PPM_THUMBNAIL_WIDTH = 64
const PPM_THUMBNAIL_HEIGHT = 48
const PPM_FILE_PATTERN = /^([0-9A-F]{6})_([0-9A-F]{13})_\d{3}$/
const DEFAULT_KWZ_FILE = 'cwmfjordvegbalksnthpyxquiz01'

export type ExportWarning =
  'unsigned' | 'droppedSound' | 'overSize' | 'memoryFull' | 'converted'

export interface FlipnoteFile {
  bytes: Uint8Array<ArrayBuffer>
  fileName: string
  warnings: ExportWarning[]
}

export interface ExportOptions {
  coverPage?: number
  onProgress?: ProgressCallback
  encodeJpeg: (
    rgba: Uint32Array<ArrayBuffer>,
    width: number,
    height: number,
  ) => Promise<Uint8Array>
}

function blankInfo(): FlipnoteInfo {
  return {
    created: 0,
    modified: 0,
    appVersion: 0,
    rootId: '',
    parentId: '',
    currentId: '',
    rootName: '',
    parentName: '',
    currentName: '',
    rootFile: '',
    parentFile: '',
    currentFile: '',
    locked: false,
    flags: 0,
    layerFlags: 0,
    edits: 0,
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function ppmInfo(note: Note): FlipnoteInfo {
  const info = { ...(note.meta.flipnote ?? blankInfo()) }
  const now = nowSeconds()

  if (!info.created) info.created = now

  info.modified = now
  info.edits = (info.edits + 1) % 1000

  const match = PPM_FILE_PATTERN.exec(info.currentFile)
  const mac = match?.[1] ?? randomHex(6)
  const random = match?.[2] ?? randomHex(13)

  info.currentFile = formatPpmFileName(mac, random, info.edits)
  info.rootFile ||= info.currentFile
  info.parentFile ||= info.currentFile
  info.currentId ||= `0${randomHex(6)}0${randomHex(8)}`
  info.rootId ||= info.currentId
  info.parentId ||= info.currentId

  return info
}

function makeKwzAuthor(): string {
  const region = '0'
  const parts = [
    '00',
    randomHex(6),
    randomHex(3),
    '0',
    randomHex(4),
    region,
    randomHex(1),
    '00',
  ]

  return parts.join('')
}

function kwzInfo(note: Note): FlipnoteInfo {
  const info = { ...(note.meta.flipnote ?? blankInfo()) }
  const now = nowSeconds()

  if (!info.created) info.created = now

  info.modified = now

  if (info.currentId.length !== 20) info.currentId = makeKwzAuthor()

  info.currentFile = makeKwzFileName(info.currentId, info.created, now)

  if (info.rootFile.length !== DEFAULT_KWZ_FILE.length) {
    info.rootFile = info.currentFile
  }

  if (info.parentFile.length !== DEFAULT_KWZ_FILE.length) {
    info.parentFile = info.rootFile
  }

  if (info.rootId.length !== 20) info.rootId = info.currentId
  if (info.parentId.length !== 20) info.parentId = info.rootId

  if (note.meta.profile === '3ds') {
    info.flags = note.meta.oneSheet
      ? info.flags & ~KWZ_FLAG_ADVANCED
      : info.flags | KWZ_FLAG_ADVANCED
  }

  return info
}

function nearestSpeed(fps: number, speeds: readonly number[]): number {
  let best = 0

  speeds.forEach((value, index) => {
    if (Math.abs(value - fps) < Math.abs(speeds[best] - fps)) best = index
  })

  return best
}

interface FlipnoteAudio {
  bgm: Int16Array<ArrayBuffer> | null
  sounds: (Int16Array<ArrayBuffer> | null)[]
}

function prepareAudio(
  note: Note,
  limits: AudioLimits,
  slots: number,
  isNative: boolean,
): FlipnoteAudio {
  const recordedFps = note.profile.speeds[note.meta.bgmSpeed]

  const rateOf = (track: Track): number =>
    isNative && track.kind === 'bgm' && track.baseFps === recordedFps
      ? 1
      : trackRate(track, note.fps)

  const convert = (
    track: Track,
    seconds: number,
  ): Int16Array<ArrayBuffer> | null => {
    const sound = track.soundId ? note.sounds.get(track.soundId) : null

    if (!sound || track.muted) return null

    const rate = rateOf(track)
    const pcm = resample(sound.samples, sound.rate * rate, limits.rate)
    const heard = playSeconds(track, sound) / rate
    const count = Math.floor(limits.rate * Math.min(seconds, heard))
    const cut =
      count < pcm.length ? fadeEnd(pcm.slice(0, count), limits.rate) : pcm

    return applyGain(cut, track.gain)
  }

  const sounds: (Int16Array<ArrayBuffer> | null)[] = []
  const tracks = soundTracks(note.meta)

  for (let slot = 0; slot < slots; slot++) {
    sounds.push(
      tracks[slot] ? convert(tracks[slot], limits.soundSeconds) : null,
    )
  }

  return { bgm: mixBgm(note, limits, convert), sounds }
}

function mixBgm(
  note: Note,
  limits: AudioLimits,
  convert: (track: Track, seconds: number) => Int16Array<ArrayBuffer> | null,
): Int16Array<ArrayBuffer> | null {
  const parts = bgmTracks(note.meta).flatMap(track => {
    const skipped = Math.max(0, -track.offset / note.fps)
    const pcm = convert(track, limits.bgmSeconds + skipped)
    const start = Math.round((track.offset / note.fps) * limits.rate)

    return pcm ? [{ pcm, start }] : []
  })

  if (parts.length === 0) return null

  const length = Math.min(
    Math.floor(limits.rate * limits.bgmSeconds),
    Math.max(...parts.map(part => part.start + part.pcm.length)),
  )

  if (length <= 0) return null

  const mixed = new Int32Array(length)

  for (const { pcm, start } of parts) {
    const end = Math.min(length, start + pcm.length)

    for (let index = Math.max(0, start); index < end; index++) {
      mixed[index] += pcm[index - start]
    }
  }

  return Int16Array.from(mixed, value =>
    Math.max(-32768, Math.min(32767, value)),
  )
}

async function coverPixels(
  note: Note,
  page: number,
  width: number,
  height: number,
): Promise<Uint32Array<ArrayBuffer>> {
  await note.ensurePages(page, 1)

  const compositor = new Compositor(note)
  const paper = note.frames.paper(page)
  const color = note.profile.papers[paper] ?? note.profile.papers[0]
  const out = new Uint32Array(width * height)

  compositor.composePage(page)
  shrinkPixels(
    compositor.pixels,
    note.meta.width,
    note.meta.height,
    rgbaWord(color),
    out,
    width,
    height,
  )

  return out
}

class PlaneLoader {
  private readonly note: Note
  private readonly scratch: Uint32Array

  constructor(note: Note) {
    this.note = note
    this.scratch = new Uint32Array(note.grid.count)
  }

  async prepare(page: number): Promise<void> {
    if (page % LOAD_WINDOW === 0) {
      await this.note.ensurePages(page, LOAD_WINDOW)
    }
  }

  load(page: number, layer: number, plane: Uint8Array): void {
    const { frames, grid, store } = this.note

    loadPlane(store, frames.cel(page, layer), plane, grid, this.scratch)
  }
}

async function* nativePpmFrames(
  note: Note,
  count: number,
  onProgress?: ProgressCallback,
): AsyncGenerator<PpmFrame> {
  const loader = new PlaneLoader(note)
  const pixels = PPM_WIDTH * PPM_HEIGHT
  const layers: [Uint8Array, Uint8Array] = [
    new Uint8Array(pixels),
    new Uint8Array(pixels),
  ]
  const yielder = new Yielder()

  for (let page = 0; page < count; page++) {
    await loader.prepare(page)
    loader.load(page, 0, layers[0])
    loader.load(page, 1, layers[1])

    const inks = note.frames.inks(page)

    yield {
      layers,
      paper: note.frames.paper(page) === 0 ? 1 : 0,
      pens: [inkOf(inks, 0, 0) || 1, inkOf(inks, 1, 0) || 1],
      sounds: note.frames.sounds(page) & 7,
    }

    onProgress?.(page + 1, count)
    await yielder.breathe()
  }
}

async function* convertedPpmFrames(
  note: Note,
  count: number,
  onProgress?: ProgressCallback,
): AsyncGenerator<PpmFrame> {
  const compositor = new Compositor(note)
  const fitted = new Uint32Array(PPM_WIDTH * PPM_HEIGHT)
  const yielder = new Yielder()

  for (let page = 0; page < count; page++) {
    await note.ensurePages(page, 1)
    compositor.composePage(page)
    fitPixels(
      compositor.pixels,
      note.meta.width,
      note.meta.height,
      fitted,
      PPM_WIDTH,
      PPM_HEIGHT,
    )

    const paperColor = note.profile.papers[note.frames.paper(page)]
    const isDark = paperColor && paperColor[0] + paperColor[1] < 200
    const planes = quantizeForPpm(fitted, !isDark)

    yield {
      layers: planes.layers,
      paper: isDark ? 0 : 1,
      pens: planes.pens,
      sounds: note.frames.sounds(page) & 7,
    }

    onProgress?.(page + 1, count)
    await yielder.breathe()
  }
}

export async function exportPpm(
  note: Note,
  options: Omit<ExportOptions, 'encodeJpeg'>,
): Promise<FlipnoteFile> {
  const limits = DSI_AUDIO
  const info = ppmInfo(note)
  const coverPage = options.coverPage ?? 0
  const isNative = note.meta.profile === 'dsi'
  const warnings: ExportWarning[] = []
  const pages = Math.min(note.frames.count, PROFILES.dsi.maxPages)

  if (!canSign()) warnings.push('unsigned')
  if (!isNative) warnings.push('converted')

  if (hasSoundBeyond(note, 3)) {
    warnings.push('droppedSound')
  }

  const cover = await coverPixels(
    note,
    coverPage,
    PPM_THUMBNAIL_WIDTH,
    PPM_THUMBNAIL_HEIGHT,
  )

  const audio = prepareAudio(note, limits, 3, isNative)
  const speed = isNative
    ? note.meta.speed + 1
    : nearestSpeed(note.fps, PROFILES.dsi.speeds) + 1

  const bytes = await writePpm({
    frames: isNative
      ? nativePpmFrames(note, pages, options.onProgress)
      : convertedPpmFrames(note, pages, options.onProgress),
    frameCount: pages,
    speed,
    bgmSpeed: isNative ? note.meta.bgmSpeed + 1 : speed,
    loop: note.meta.loop,
    name: note.meta.title.slice(0, NAME_LIMIT),
    thumbnail: encodePpmThumbnail(cover),
    thumbnailPage: coverPage,
    bgm: audio.bgm,
    sounds: audio.sounds,
    info,
  })

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const frameBytes = view.getUint32(4, true) - 8 - view.getUint16(0x6a0, true)

  if (bytes.length > PPM_MAX_BYTES) warnings.push('overSize')
  else if (frameBytes >= PPM_MAX_FRAME_BYTES) warnings.push('memoryFull')

  note.meta.flipnote = info

  return {
    bytes,
    fileName: `${ppmLocalFileName(info.currentFile)}.ppm`,
    warnings,
  }
}

function hasSoundBeyond(note: Note, slots: number): boolean {
  const mask = ~((1 << slots) - 1)

  for (let page = 0; page < note.frames.count; page++) {
    if (note.frames.sounds(page) & mask) return true
  }

  return false
}

function padForKwz(source: Uint8Array, width: number, target: Uint8Array) {
  const height = source.length / width

  target.fill(0)

  for (let y = 0; y < height; y++) {
    const start = y * width

    target.set(
      source.subarray(start, start + width),
      (y + KWZ_BORDER) * KWZ_FRAME_WIDTH + KWZ_BORDER,
    )
  }
}

async function* nativeKwzFrames(
  note: Note,
  count: number,
  onProgress?: ProgressCallback,
): AsyncGenerator<KwzFrame> {
  const { width, height } = note.meta
  const loader = new PlaneLoader(note)
  const pixels = KWZ_FRAME_WIDTH * KWZ_FRAME_HEIGHT
  const plane = new Uint8Array(width * height)
  const layers: KwzFrame['layers'] = [
    new Uint8Array(pixels),
    new Uint8Array(pixels),
    new Uint8Array(pixels),
  ]
  const yielder = new Yielder()

  for (let page = 0; page < count; page++) {
    await loader.prepare(page)

    for (let layer = 0; layer < 3; layer++) {
      loader.load(page, layer, plane)
      padForKwz(plane, width, layers[layer])
    }

    const inks = note.frames.inks(page)
    const depths = note.frames.depths(page)

    yield {
      layers,
      paper: note.frames.paper(page),
      colors: [
        inkOf(inks, 0, 0),
        inkOf(inks, 0, 1),
        inkOf(inks, 1, 0),
        inkOf(inks, 1, 1),
        inkOf(inks, 2, 0),
        inkOf(inks, 2, 1),
      ],
      depth: [depthOf(depths, 0), depthOf(depths, 1), depthOf(depths, 2)],
      sounds: note.frames.sounds(page) & 0xf,
    }

    onProgress?.(page + 1, count)
    await yielder.breathe()
  }
}

async function* convertedKwzFrames(
  note: Note,
  count: number,
  onProgress?: ProgressCallback,
): AsyncGenerator<KwzFrame> {
  const compositor = new Compositor(note)
  const canvas = PROFILES['3ds'].sizes[0]
  const fitted = new Uint32Array(canvas.width * canvas.height)
  const pixels = KWZ_FRAME_WIDTH * KWZ_FRAME_HEIGHT
  const layers: KwzFrame['layers'] = [
    new Uint8Array(pixels),
    new Uint8Array(pixels),
    new Uint8Array(pixels),
  ]
  const yielder = new Yielder()

  for (let page = 0; page < count; page++) {
    await note.ensurePages(page, 1)
    compositor.composePage(page)
    fitPixels(
      compositor.pixels,
      note.meta.width,
      note.meta.height,
      fitted,
      canvas.width,
      canvas.height,
    )

    const planes = quantizeForKwz(fitted)

    planes.layers.forEach((plane, layer) => {
      padForKwz(plane, canvas.width, layers[layer])
    })

    yield {
      layers,
      paper: 0,
      colors: planes.colors,
      depth: [0, 1, 2],
      sounds: note.frames.sounds(page) & 0xf,
    }

    onProgress?.(page + 1, count)
    await yielder.breathe()
  }
}

export async function exportKwz(
  note: Note,
  options: ExportOptions,
): Promise<FlipnoteFile> {
  const limits = N3DS_AUDIO
  const info = kwzInfo(note)
  const coverPage = options.coverPage ?? 0
  const isNative = note.meta.profile === '3ds'
  const warnings: ExportWarning[] = []
  const pages = Math.min(note.frames.count, PROFILES['3ds'].maxPages)

  if (!canSign()) warnings.push('unsigned')
  if (!isNative) warnings.push('converted')

  if (hasSoundBeyond(note, 4)) {
    warnings.push('droppedSound')
  }

  const cover = await coverPixels(
    note,
    coverPage,
    KWZ_THUMBNAIL_WIDTH,
    KWZ_THUMBNAIL_HEIGHT,
  )

  const thumbnail = await options.encodeJpeg(
    cover,
    KWZ_THUMBNAIL_WIDTH,
    KWZ_THUMBNAIL_HEIGHT,
  )

  const audio = prepareAudio(note, limits, 4, isNative)
  const speed = isNative
    ? note.meta.speed
    : nearestSpeed(note.fps, PROFILES['3ds'].speeds)

  const bytes = await writeKwz({
    frames: isNative
      ? nativeKwzFrames(note, pages, options.onProgress)
      : convertedKwzFrames(note, pages, options.onProgress),
    frameCount: pages,
    speed,
    bgmSpeed: isNative ? note.meta.bgmSpeed : speed,
    loop: note.meta.loop,
    name: note.meta.title.slice(0, NAME_LIMIT),
    thumbnail,
    thumbnailPage: coverPage,
    bgm: audio.bgm,
    sounds: audio.sounds,
    info,
  })

  note.meta.flipnote = info

  return { bytes, fileName: `${info.currentFile}.kwz`, warnings }
}
