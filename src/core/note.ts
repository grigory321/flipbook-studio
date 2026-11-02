import { TileGrid, unpackCel } from './cel.ts'
import { FrameTable, inkOf, withInk } from './frames.ts'
import {
  DSI_PEN_BLUE,
  DSI_PEN_INVERSE,
  DSI_PEN_RED,
  N3DS_ADVANCED_PAIRS,
  N3DS_SHEET_PAIRS,
  PROFILES,
  type Profile,
  type ProfileId,
  type Rgb,
} from './profile.ts'
import { EMPTY_REF, isUniform, type Ref, Store } from './store.ts'

export type PaperStyle = 'plain' | 'ruled' | 'grid' | 'dots'

export interface LayerInfo {
  name: string
  visible: boolean
  locked: boolean
}

export type TrackKind = 'bgm' | 'sound'

export interface Sound {
  id: string
  name: string
  rate: number
  samples: Int16Array<ArrayBuffer>
}

export interface Track {
  kind: TrackKind
  name: string
  soundId: string | null
  gain: number
  muted: boolean
  offset: number
  length: number | null
  baseFps: number | null
}

export function playSeconds(track: Track, sound: Sound): number {
  const whole = sound.samples.length / sound.rate

  return track.length === null ? whole : Math.min(whole, track.length)
}

export function trackBase(track: Track, fps: number): number {
  return track.baseFps ?? fps
}

export function trackRate(track: Track, fps: number): number {
  return fps / trackBase(track, fps)
}

export function trackPages(track: Track, sound: Sound, fps: number): number {
  return playSeconds(track, sound) * trackBase(track, fps)
}

const BGM_TRACKS = 2
const SOUND_TRACKS = 4

export interface FlipnoteInfo {
  created: number
  modified: number
  appVersion: number
  rootId: string
  parentId: string
  currentId: string
  rootName: string
  parentName: string
  currentName: string
  rootFile: string
  parentFile: string
  currentFile: string
  locked: boolean
  flags: number
  layerFlags: number
  edits: number
}

export interface NoteMeta {
  id: string
  title: string
  profile: ProfileId
  width: number
  height: number
  speed: number
  bgmSpeed: number
  loop: boolean
  paperStyle: PaperStyle
  palette: Rgb[]
  layers: LayerInfo[]
  tracks: Track[]
  oneSheet: boolean
  flipnote: FlipnoteInfo | null
  plugins: Record<string, unknown>
  created: number
  modified: number
}

export interface NoteOptions {
  title: string
  profile: ProfileId
  width?: number
  height?: number
  paperStyle?: PaperStyle
  paper?: number
}

export function createId(): string {
  const time = Date.now().toString(36)
  const random = Math.floor(Math.random() * 0x7fffffff).toString(36)

  return `${time}${random}`
}

function makeTrack(kind: TrackKind, name: string): Track {
  return {
    kind,
    name,
    soundId: null,
    gain: 1,
    muted: false,
    offset: 0,
    length: null,
    baseFps: null,
  }
}

function defaultTracks(): Track[] {
  const tracks: Track[] = []

  for (let index = 0; index < BGM_TRACKS; index++) {
    tracks.push(makeTrack('bgm', `BGM${index + 1}`))
  }

  for (let index = 0; index < SOUND_TRACKS; index++) {
    tracks.push(makeTrack('sound', `SE${index + 1}`))
  }

  return tracks
}

function normalizeTracks(tracks: Track[]): Track[] {
  const bgm = tracks.filter(track => track.kind === 'bgm')
  const sounds = tracks.filter(track => track.kind === 'sound')
  const filled = defaultTracks()

  bgm.slice(0, BGM_TRACKS).forEach((track, index) => {
    filled[index] = { ...filled[index], ...track }
  })

  sounds.slice(0, SOUND_TRACKS).forEach((track, index) => {
    filled[BGM_TRACKS + index] = { ...filled[BGM_TRACKS + index], ...track }
  })

  return filled
}

export function bgmTracks(meta: NoteMeta): Track[] {
  return meta.tracks.filter(track => track.kind === 'bgm')
}

export function soundTracks(meta: NoteMeta): Track[] {
  return meta.tracks.filter(track => track.kind === 'sound')
}

export function defaultInks(profile: Profile, oneSheet: boolean): number {
  let inks = 0

  if (profile.id === 'dsi') {
    inks = withInk(inks, 0, 0, DSI_PEN_INVERSE)
    inks = withInk(inks, 1, 0, DSI_PEN_INVERSE)
  }

  if (profile.id === '3ds') {
    const pairs = oneSheet ? N3DS_SHEET_PAIRS : N3DS_ADVANCED_PAIRS

    pairs.forEach((pair, layer) => {
      inks = withInk(inks, layer, 0, pair[0])
      inks = withInk(inks, layer, 1, pair[1])
    })
  }

  return inks
}

export class Note {
  readonly meta: NoteMeta
  readonly frames: FrameTable
  readonly store: Store
  readonly grid: TileGrid
  readonly profile: Profile
  readonly sounds = new Map<string, Sound>()

  private readonly celScratch: Uint32Array

  constructor(meta: NoteMeta, frames: FrameTable, store: Store) {
    meta.tracks = normalizeTracks(meta.tracks)
    this.meta = meta

    for (const track of bgmTracks(meta)) {
      if (track.soundId && track.baseFps === null) {
        track.baseFps = PROFILES[meta.profile].speeds[meta.bgmSpeed] ?? null
      }
    }

    this.frames = frames
    this.store = store
    this.grid = new TileGrid(meta.width, meta.height)
    this.profile = PROFILES[meta.profile]
    this.celScratch = new Uint32Array(this.grid.count)
  }

  static create(options: NoteOptions, store = new Store()): Note {
    const profile = PROFILES[options.profile]
    const size = profile.sizes[0]
    const width = options.width ?? size.width
    const height = options.height ?? size.height
    const oneSheet = profile.id === '3ds'
    const now = Date.now()
    const layers: LayerInfo[] = []

    for (let index = 0; index < profile.defaultLayers; index++) {
      layers.push({
        name: String.fromCharCode(65 + index),
        visible: true,
        locked: false,
      })
    }

    const meta: NoteMeta = {
      id: createId(),
      title: options.title,
      profile: profile.id,
      width,
      height,
      speed: profile.defaultSpeed,
      bgmSpeed: profile.defaultSpeed,
      loop: true,
      paperStyle: options.paperStyle ?? 'plain',
      palette: profile.colors.slice(),
      layers,
      tracks: defaultTracks(),
      oneSheet,
      flipnote: null,
      plugins: {},
      created: now,
      modified: now,
    }

    const frames = new FrameTable(layers.length)

    frames.insertBlank(0, options.paper ?? 0, defaultInks(profile, oneSheet))

    return new Note(meta, frames, store)
  }

  get fps(): number {
    return this.profile.speeds[this.meta.speed] ?? 12
  }

  colorAt(page: number, layer: number, slot: number): Rgb | null {
    const code = inkOf(this.frames.inks(page), layer, slot)

    return resolveInk(this.profile, this.frames.paper(page), code)
  }

  celRefs(page: number): Ref[] {
    const refs: Ref[] = []

    for (let layer = 0; layer < this.frames.layers; layer++) {
      refs.push(this.frames.cel(page, layer))
    }

    return refs
  }

  private celsOf(first: number, count: number): Set<Ref> {
    const end = Math.min(this.frames.count, first + count)
    const cels = new Set<Ref>()

    for (let page = Math.max(0, first); page < end; page++) {
      for (const cel of this.celRefs(page)) {
        if (cel !== EMPTY_REF) cels.add(cel)
      }
    }

    return cels
  }

  private addTiles(cels: Iterable<Ref>, into: Set<Ref>): Set<Ref> {
    for (const cel of cels) {
      if (!this.store.isLoaded(cel)) continue

      unpackCel(this.store, cel, this.celScratch)

      for (const tile of this.celScratch) {
        if (tile !== EMPTY_REF && !isUniform(tile)) into.add(tile)
      }
    }

    return into
  }

  async ensurePages(first: number, count: number): Promise<void> {
    const cels = this.celsOf(first, count)

    await this.store.ensure(cels)
    await this.store.ensure(this.addTiles(cels, new Set(cels)))
  }

  pagesLoaded(first: number, count: number): boolean {
    const cels = this.celsOf(first, count)

    for (const cel of cels) if (!this.store.isLoaded(cel)) return false

    for (const tile of this.addTiles(cels, new Set())) {
      if (!this.store.isLoaded(tile)) return false
    }

    return true
  }

  pinPages(key: string, first: number, count: number): void {
    const cels = this.celsOf(first, count)

    this.store.pin(key, this.addTiles(cels, new Set(cels)))
  }

  usedSounds(): Sound[] {
    const used: Sound[] = []

    for (const track of this.meta.tracks) {
      const sound = track.soundId ? this.sounds.get(track.soundId) : undefined

      if (sound && !used.includes(sound)) used.push(sound)
    }

    return used
  }

  dropUnusedSounds(): number {
    const used = this.usedSounds()
    let dropped = 0

    for (const [id, sound] of this.sounds) {
      if (used.includes(sound)) continue

      this.sounds.delete(id)
      dropped++
    }

    return dropped
  }
}

export function resolveInk(
  profile: Profile,
  paper: number,
  code: number,
): Rgb | null {
  if (profile.id === 'dsi') return dsiInk(paper, code)

  return profile.colors[code] ?? null
}

export function dsiInk(paper: number, code: number): Rgb {
  const { colors } = PROFILES.dsi

  if (code === DSI_PEN_RED || code === DSI_PEN_BLUE) return colors[code]

  return colors[paper === 0 ? 1 : 0]
}
