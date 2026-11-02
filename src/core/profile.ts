import { oneOf } from './guards.ts'

export type Rgb = readonly [number, number, number]

export type ProfileId = 'free' | 'dsi' | '3ds'

export const isProfileId = oneOf<ProfileId>(['free', 'dsi', '3ds'])

export interface PaperSize {
  readonly id: string
  readonly width: number
  readonly height: number
}

export interface AudioLimits {
  readonly rate: number
  readonly bgmSeconds: number
  readonly soundSeconds: number
}

export interface Profile {
  readonly id: ProfileId
  readonly sizes: readonly PaperSize[]
  readonly maxPages: number
  readonly minLayers: number
  readonly maxLayers: number
  readonly defaultLayers: number
  readonly speeds: readonly number[]
  readonly defaultSpeed: number
  readonly colors: readonly Rgb[]
  readonly papers: readonly Rgb[]
  readonly inkSlots: 0 | 1 | 2
  readonly patternPhase: number
  readonly audio: AudioLimits | null
}

const DSI_COLORS: readonly Rgb[] = [
  [255, 255, 255],
  [14, 14, 14],
  [255, 42, 42],
  [10, 57, 255],
]

const N3DS_COLORS: readonly Rgb[] = [
  [255, 255, 255],
  [16, 16, 16],
  [255, 16, 16],
  [255, 231, 0],
  [0, 134, 49],
  [0, 56, 206],
]

const FREE_COLORS: readonly Rgb[] = [
  [59, 39, 28],
  [232, 62, 62],
  [255, 122, 26],
  [255, 200, 40],
  [68, 190, 106],
  [46, 196, 214],
  [52, 120, 232],
  [144, 96, 232],
  [255, 120, 170],
  [164, 112, 72],
  [150, 150, 150],
  [255, 255, 255],
]

export const DSI_AUDIO: AudioLimits = {
  rate: 8180,
  bgmSeconds: 59.9,
  soundSeconds: 1.99,
}

export const N3DS_AUDIO: AudioLimits = {
  rate: 16364,
  bgmSeconds: 60,
  soundSeconds: 2,
}

const FREE_PAPERS: readonly Rgb[] = [
  [255, 255, 255],
  [255, 248, 232],
  [226, 244, 255],
  [228, 248, 234],
  [255, 234, 240],
  [48, 44, 62],
]

export const PROFILES: Readonly<Record<ProfileId, Profile>> = {
  free: {
    id: 'free',
    sizes: [
      { id: 'standard', width: 512, height: 384 },
      { id: 'wide', width: 640, height: 360 },
      { id: 'tall', width: 360, height: 640 },
      { id: 'square', width: 480, height: 480 },
      { id: 'large', width: 1280, height: 720 },
    ],
    maxPages: 9999,
    minLayers: 1,
    maxLayers: 8,
    defaultLayers: 2,
    speeds: [0.5, 1, 2, 4, 6, 12, 20, 30],
    defaultSpeed: 5,
    colors: FREE_COLORS,
    papers: FREE_PAPERS,
    inkSlots: 0,
    patternPhase: 0,
    audio: null,
  },
  dsi: {
    id: 'dsi',
    sizes: [{ id: 'dsi', width: 256, height: 192 }],
    maxPages: 999,
    minLayers: 2,
    maxLayers: 2,
    defaultLayers: 2,
    speeds: [0.5, 1, 2, 4, 6, 12, 20, 30],
    defaultSpeed: 5,
    colors: DSI_COLORS,
    papers: DSI_COLORS.slice(0, 2),
    inkSlots: 1,
    patternPhase: 0,
    audio: DSI_AUDIO,
  },
  '3ds': {
    id: '3ds',
    sizes: [{ id: '3ds', width: 310, height: 230 }],
    maxPages: 999,
    minLayers: 3,
    maxLayers: 3,
    defaultLayers: 3,
    speeds: [0.2, 0.5, 1, 2, 4, 6, 8, 12, 20, 24, 30],
    defaultSpeed: 7,
    colors: N3DS_COLORS,
    papers: N3DS_COLORS,
    inkSlots: 2,
    patternPhase: 5,
    audio: N3DS_AUDIO,
  },
}

export const DSI_PEN_INVERSE = 1
export const DSI_PEN_RED = 2
export const DSI_PEN_BLUE = 3

export const N3DS_SHEET_PAIRS: readonly (readonly [number, number])[] = [
  [0, 1],
  [5, 2],
  [3, 4],
]

export const N3DS_ADVANCED_PAIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [2, 4],
  [3, 5],
]

export function rgbaWord(color: Rgb): number {
  return ((255 << 24) | (color[2] << 16) | (color[1] << 8) | color[0]) >>> 0
}

export function rgbCss(color: Rgb): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`
}
