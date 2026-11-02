import {
  isBoolean,
  isList,
  isListOf,
  isNumber,
  isRecord,
  isString,
  oneOf,
} from '../core/guards.ts'
import type {
  FlipnoteInfo,
  LayerInfo,
  NoteMeta,
  PaperStyle,
  Track,
} from '../core/note.ts'
import {
  isProfileId,
  type Profile,
  PROFILES,
  type Rgb,
} from '../core/profile.ts'

const isPaperStyle = oneOf<PaperStyle>(['plain', 'ruled', 'grid', 'dots'])

function fitsSheet(spec: Profile, width: number, height: number): boolean {
  const side = Math.max(
    ...spec.sizes.map(size => Math.max(size.width, size.height)),
  )
  const area = Math.max(...spec.sizes.map(size => size.width * size.height))

  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= side &&
    height <= side &&
    width * height <= area
  )
}

export function checkPages(meta: NoteMeta, pages: number): void {
  const { maxPages } = PROFILES[meta.profile]

  if (!Number.isInteger(pages) || pages < 1 || pages > maxPages) {
    throw new RangeError(`ページの数 ${pages} には対応していません`)
  }
}
const isTrackKind = oneOf<Track['kind']>(['bgm', 'sound'])

function isRgb(value: unknown): value is Rgb {
  return isListOf(value, isNumber) && value.length === 3
}

function isOptionalNumber(value: unknown): value is number | null {
  return value === null || value === undefined || isNumber(value)
}

function readLayer(value: unknown, index: number): LayerInfo {
  const layer = isRecord(value) ? value : {}

  return {
    name: isString(layer.name) ? layer.name : String.fromCharCode(65 + index),
    visible: layer.visible !== false,
    locked: layer.locked === true,
  }
}

function readTrack(value: unknown): Track | null {
  if (!isRecord(value) || !isTrackKind(value.kind)) return null

  const { kind, name, soundId, gain, muted, offset, length, baseFps } = value

  return {
    kind,
    name: isString(name) ? name : '',
    soundId: isString(soundId) ? soundId : null,
    gain: isNumber(gain) ? gain : 1,
    muted: muted === true,
    offset: isNumber(offset) ? offset : 0,
    length: isOptionalNumber(length) ? (length ?? null) : null,
    baseFps: isOptionalNumber(baseFps) ? (baseFps ?? null) : null,
  }
}

function readFlipnote(value: unknown): FlipnoteInfo | null {
  if (!isRecord(value)) return null

  const { created, modified, appVersion, locked, flags, layerFlags, edits } =
    value
  const { rootId, parentId, currentId, rootName, parentName } = value
  const { currentName, rootFile, parentFile, currentFile } = value

  if (
    isNumber(created) &&
    isNumber(modified) &&
    isNumber(appVersion) &&
    isString(rootId) &&
    isString(parentId) &&
    isString(currentId) &&
    isString(rootName) &&
    isString(parentName) &&
    isString(currentName) &&
    isString(rootFile) &&
    isString(parentFile) &&
    isString(currentFile) &&
    isBoolean(locked) &&
    isNumber(flags) &&
    isNumber(layerFlags) &&
    isNumber(edits)
  ) {
    return {
      created,
      modified,
      appVersion,
      rootId,
      parentId,
      currentId,
      rootName,
      parentName,
      currentName,
      rootFile,
      parentFile,
      currentFile,
      locked,
      flags,
      layerFlags,
      edits,
    }
  }

  return null
}

export function readMeta(value: unknown): NoteMeta {
  if (!isRecord(value)) throw new RangeError('ノートの情報が読めません')

  const { id, profile, width, height, layers } = value

  if (
    !isString(id) ||
    !isProfileId(profile) ||
    !isNumber(width) ||
    !isNumber(height) ||
    !isList(layers) ||
    layers.length === 0
  ) {
    throw new RangeError('ノートの情報が読めません')
  }

  const spec = PROFILES[profile]

  if (!fitsSheet(spec, width, height)) {
    throw new RangeError(`用紙の大きさ ${width}×${height} には対応していません`)
  }

  if (layers.length < spec.minLayers || layers.length > spec.maxLayers) {
    throw new RangeError(`レイヤーの数 ${layers.length} には対応していません`)
  }

  const speeds = spec.speeds.length
  const speedOf = (field: unknown): number =>
    isNumber(field) && field >= 0 && field < speeds ? field : spec.defaultSpeed
  const now = Date.now()

  return {
    id,
    title: isString(value.title) ? value.title : '',
    profile,
    width,
    height,
    speed: speedOf(value.speed),
    bgmSpeed: speedOf(value.bgmSpeed),
    loop: value.loop !== false,
    paperStyle: isPaperStyle(value.paperStyle) ? value.paperStyle : 'plain',
    palette: isListOf(value.palette, isRgb)
      ? value.palette
      : spec.colors.slice(),
    layers: layers.map(readLayer),
    tracks: isList(value.tracks)
      ? value.tracks.flatMap(track => readTrack(track) ?? [])
      : [],
    oneSheet: value.oneSheet === true,
    flipnote: readFlipnote(value.flipnote),
    plugins: isRecord(value.plugins) ? value.plugins : {},
    created: isNumber(value.created) ? value.created : now,
    modified: isNumber(value.modified) ? value.modified : now,
  }
}
