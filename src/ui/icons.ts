const ICONS: Readonly<Record<string, string>> = {
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  play: '*M8 5.5v13a1 1 0 0 0 1.5.9l10.6-6.5a1 1 0 0 0 0-1.8L9.5 4.6A1 1 0 0 0 8 5.5z',
  pause: '*M6.5 5h4v14h-4zM13.5 5h4v14h-4z',
  first: 'M6 5v14M19 6l-9 6 9 6z',
  last: 'M18 5v14M5 6l9 6-9 6z',
  prev: 'M18 6l-11 6 11 6z',
  next: 'M6 6l11 6-11 6z',
  undo: 'M9 7L4 12l5 5M4 12h10a5 5 0 0 1 5 5v1',
  redo: 'M15 7l5 5-5 5M20 12H10a5 5 0 0 0-5 5v1',
  pen: 'M4 20l1-5L16 4a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3L9 19zM14 6l4 4',
  paint:
    'M4 20c3 0 4-1 4-3a3 3 0 0 1 3-3l9-9-2-2-9 9a3 3 0 0 0-3 3c0 2-1 3-2 5z',
  eraser: 'M8 20h12M5 15l9-10a2 2 0 0 1 3 0l3 3a2 2 0 0 1 0 3l-8 9H9z',
  shape: 'M4 4h9v9H4zM16 20.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
  line: 'M5 19L19 5',
  rect: 'M5 6h14v12H5z',
  oval: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z',
  select:
    'M5 8V5h3M12 5h.01M16 5h3v3M19 12v.01M19 16v3h-3M12 19h.01M8 19H5v-3M5 12v.01',
  lasso: 'M12 4c5 0 9 3 9 7s-4 6-9 6-9-2-9-6 4-7 9-7zM8 17c-1 2-1 3 0 4',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  picker:
    'M4 20l1-1 3-1 8-8-3-3-8 8-1 3zM13 7l2-2a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3l-2 2',
  bucket: 'M5 11l7-7 8 8-7 7a2 2 0 0 1-3 0l-5-5a2 2 0 0 1 0-3zM8 8h10',
  layers: 'M12 4l9 5-9 5-9-5zM3 14l9 5 9-5',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff:
    'M4 4l16 16M10 5.2A11 11 0 0 1 12 5c6 0 10 7 10 7a18 18 0 0 1-3 3.6M6.6 6.7A17 17 0 0 0 2 12s4 7 10 7a10 10 0 0 0 4.4-1',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2',
  music:
    'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  paste: 'M8 3h8v3H8zM6 5H4v16h16V5h-2',
  pages: 'M8 8h12v12H8zM4 16V4h12',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  gear: 'M19.6 13.3L22.1 14.6L21.0 17.3L18.3 16.5L16.5 18.3L17.3 21.0L14.6 22.1L13.3 19.6L10.7 19.6L9.4 22.1L6.7 21.0L7.5 18.3L5.7 16.5L3.0 17.3L1.9 14.6L4.4 13.3L4.4 10.7L1.9 9.4L3.0 6.7L5.7 7.5L7.5 5.7L6.7 3.0L9.4 1.9L10.7 4.4L13.3 4.4L14.6 1.9L17.3 3.0L16.5 5.7L18.3 7.5L21.0 6.7L22.1 9.4L19.6 10.7zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v7h14v-7',
  folder: 'M3 6h6l2 2h10v11H3z',
  loop: 'M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1',
  onion: 'M4 8h12v12H4zM8 8V4h12v12h-4',
  turtle:
    'M3 15a7.5 6.5 0 0 1 15 0zM18 13.5h1.5a2.5 2.5 0 0 0 0-5H18a2 2 0 0 0-2 2.2M6.5 15v3.5M14.5 15v3.5',
  rabbit:
    'M9.5 11V4.5a1.75 1.75 0 0 1 3.5 0V11M13 11l1.6-5.4a1.75 1.75 0 0 1 3.4.9L16.4 12M5 20a7 7 0 1 1 14 0zM10 16h.01M14 16h.01',
  check: 'M5 13l4 4 10-11',
  close: 'M6 6l12 12M18 6L6 18',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  saving: 'M20 12a8 8 0 1 1-8-8',
  alert: 'M12 6v7M12 18h.01',
  flipH: 'M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z',
  flipV: 'M3 12h18M7 8l5-5 5 5zM7 16l5 5 5-5z',
  rotate: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  note: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M3 7h3M3 12h3M3 17h3',
  console: 'M3 7h18v10H3zM7 10v4M5 12h4M16 11h.01M18 13h.01',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01',
  video: 'M4 6h12v12H4zM16 10l5-3v10l-5-3',
  globe:
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M8 14h8',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6',
  mute: 'M4 9v6h4l5 4V5L8 9zM16 9l5 6M21 9l-5 6',
  plugin: 'M8 3v4M16 3v4M6 7h12v5a6 6 0 0 1-12 0zM12 18v3',
  download: 'M12 4v11M8 11l4 4 4-4M5 19h14',
  upload: 'M12 15V5M8 9l4-4 4 4M4 15v5h16v-5',
  paper: 'M6 3h9l4 4v14H6zM15 3v4h4',
  pattern: 'M5 5h14v14H5zM9 5v14M15 5v14M5 9h14M5 15h14',
  dot: '*M4 4h5v5H4zM9.5 9.5h5v5h-5zM15 4h5v5h-5zM4 15h5v5H4zM15 15h5v5h-5z',
  star: '*M12 3l2.8 5.8 6.2.9-4.5 4.4 1.1 6.3L12 17.5l-5.6 3 1.1-6.4L3 9.7l6.2-.9z',
  gamepad:
    'M6 9h12a4 4 0 0 1 4 4v3a2 2 0 0 1-3.6 1.2L16 15H8l-2.4 2.2A2 2 0 0 1 2 16v-3a4 4 0 0 1 4-4zM8 11v2M7 12h2M16 12h.01',
  size: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
  move: 'M12 3v18M3 12h18M12 3L9 6M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  wand: 'M4 20L15 9M14 4v3M20 8h-3M18.5 4.5l-2 2M18 13v2M9 5H7M13 8l3 3',
  warp: 'M3 7c3-3 6 3 9 0s6-3 9 0M3 12c3-3 6 3 9 0s6-3 9 0M3 17c3-3 6 3 9 0s6-3 9 0',
  swell:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5',
  pinch:
    'M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 2v4M12 18v4M2 12h4M18 12h4M4.5 4.5L8 8M16 16l3.5 3.5M4.5 19.5L8 16M16 8l3.5-3.5',
  path: 'M5 19c5 0 3-7 7-7s3-6 7-7M5 16.5v5M2.5 19h5M16 3l3 2-2 3',
  stamp: 'M9 12V8a3 3 0 1 1 6 0v4l1 3H8zM5 15h14v3H5zM5 21h14',
  corners: 'M6 5l13 2 1 13-14-3zM6 5h.01M19 7h.01M20 20h.01M6 17h.01',
  wobble:
    'M4 7c2-2 4 2 6 0s4-2 6 0 2 1 4 0M4 12c2-2 4 2 6 0s4-2 6 0 2 1 4 0M8 17h8',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5',
  film: 'M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4',
  sidebar: 'M4 5h16v14H4zM15 5v14',
  hand: 'M8 13V6a1.5 1.5 0 0 1 3 0v5M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v8c0 4-2 7-6 7-3 0-4-1-5.5-3L3.2 14a1.5 1.5 0 0 1 2.3-2L8 14.5',
  home: 'M4 11l8-7 8 7M6 10v10h4v-6h4v6h4V10',
}

export interface IconData {
  d: string
  isFilled: boolean
}

export function iconPath(name: string): IconData {
  const value = ICONS[name] ?? ICONS.help

  return value[0] === '*'
    ? { d: value.slice(1), isFilled: true }
    : { d: value, isFilled: false }
}
