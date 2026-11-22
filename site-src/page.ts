import { SOUND_PRESETS } from '../src/audio/presets.ts'
import { en as appEn } from '../src/i18n/en.ts'
import { es as appEs } from '../src/i18n/es.ts'
import { fr as appFr } from '../src/i18n/fr.ts'
import { ja as appJa, type Messages } from '../src/i18n/ja.ts'
import { ru as appRu } from '../src/i18n/ru.ts'
import { iconPath } from '../src/ui/icons.ts'
import { en } from './copy/en.ts'
import { es } from './copy/es.ts'
import { fr } from './copy/fr.ts'
import { ja, type Copy } from './copy/ja.ts'
import { ru } from './copy/ru.ts'
import { phrases } from './phrase.ts'

export type Lang = 'ja' | 'en' | 'es' | 'fr' | 'ru'

export const LANGS: readonly { id: Lang; name: string; locale: string }[] = [
  { id: 'ja', name: '日本語', locale: 'ja_JP' },
  { id: 'en', name: 'English', locale: 'en_US' },
  { id: 'es', name: 'Español', locale: 'es_ES' },
  { id: 'fr', name: 'Français', locale: 'fr_FR' },
  { id: 'ru', name: 'Русский', locale: 'ru_RU' },
]

const COPY: Readonly<Record<Lang, Copy>> = { ja, en, es, fr, ru }
const APP: Readonly<Record<Lang, Messages>> = {
  ja: appJa,
  en: appEn,
  es: appEs,
  fr: appFr,
  ru: appRu,
}

const REPOSITORY = 'https://github.com/grigory321/flipbook-studio'
const APP_URL = 'https://dniy.pp.ua/flipbook/'
const HOME_URL = 'https://dniy.pp.ua/'

const TOOLS: readonly {
  id: string
  icon: string
  name: keyof Messages
  body: keyof Copy
}[] = [
  { id: 'pen', icon: 'pen', name: 'tool.pen', body: 'tools.pen' },
  { id: 'paint', icon: 'paint', name: 'tool.paint', body: 'tools.paint' },
  { id: 'eraser', icon: 'eraser', name: 'tool.eraser', body: 'tools.eraser' },
  { id: 'fill', icon: 'bucket', name: 'tool.fill', body: 'tools.fill' },
  { id: 'shape', icon: 'shape', name: 'tool.shape', body: 'tools.shape' },
  { id: 'select', icon: 'select', name: 'tool.select', body: 'tools.select' },
  { id: 'text', icon: 'text', name: 'tool.text', body: 'tools.text' },
  { id: 'image', icon: 'image', name: 'tool.image', body: 'tools.image' },
  { id: 'dot', icon: 'dot', name: 'tool.dot', body: 'tools.dot' },
]

const BRUSHES: readonly (keyof Messages)[] = [
  'pen.pencil',
  'pen.colorPencil',
  'pen.crayon',
  'pen.chalk',
  'pen.charcoal',
  'pen.pastel',
  'pen.watercolor',
  'pen.airbrush',
  'pen.marker',
  'pen.highlighter',
  'pen.nib',
  'pen.ribbon',
  'pen.neon',
  'pen.spray',
  'pen.stipple',
  'pen.splatter',
  'pen.dots',
  'pen.stars',
  'pen.hearts',
]

const FILM: readonly {
  id: string
  icon: string
  title: keyof Copy
  body: keyof Copy
}[] = [
  { id: 'onion', icon: 'onion', title: 'film.onion', body: 'film.onionBody' },
  {
    id: 'wobble',
    icon: 'wobble',
    title: 'film.wobble',
    body: 'film.wobbleBody',
  },
  { id: 'path', icon: 'path', title: 'film.path', body: 'film.pathBody' },
  { id: 'range', icon: 'loop', title: 'film.range', body: 'film.rangeBody' },
  {
    id: 'layers',
    icon: 'layers',
    title: 'film.layers',
    body: 'film.layersBody',
  },
  { id: 'speed', icon: 'rabbit', title: 'film.speed', body: 'film.speedBody' },
]

const FILM_DEMOS: Readonly<Record<string, string>> = {
  onion: '<span class="fd fd-onion"><i></i><i></i><i></i></span>',
  wobble:
    '<svg class="fd fd-wobble" viewBox="0 0 120 60"><path d="M10 42c14-30 30-30 40-8s26 22 34-2 20-20 26-6"/></svg>',
  path: '<svg class="fd fd-path" viewBox="0 0 120 60"><path class="fd-route" d="M10 48C30 4 60 4 70 30s30 26 40-10"/><circle class="fd-runner" r="6"/></svg>',
  range:
    '<span class="fd fd-range"><i>1</i><i>2</i><i>3</i><i>4</i><b></b></span>',
  layers: '<span class="fd fd-layers"><i></i><i></i><i></i></span>',
  speed:
    '<span class="fd fd-speed"><span><i></i></span><span><i></i></span></span>',
}

const KINDS: readonly {
  id: 'free' | 'dsi' | '3ds'
  name: keyof Messages
  detail: keyof Messages
  specs: keyof Copy
}[] = [
  {
    id: 'free',
    name: 'profile.free',
    detail: 'profile.free.detail',
    specs: 'notes.free',
  },
  {
    id: 'dsi',
    name: 'profile.dsi',
    detail: 'profile.dsi.detail',
    specs: 'notes.dsi',
  },
  {
    id: '3ds',
    name: 'profile.3ds',
    detail: 'profile.3ds.detail',
    specs: 'notes.3ds',
  },
]

const FORMATS: readonly {
  tag: string
  body: keyof Copy
  tone: string
}[] = [
  { tag: '.ugb', body: 'share.ugb', tone: 'orange' },
  { tag: 'GIF', body: 'share.gif', tone: 'sun' },
  { tag: 'MP4', body: 'share.mp4', tone: 'peach' },
  { tag: 'APNG', body: 'share.apng', tone: 'light' },
  { tag: 'ZIP', body: 'share.png', tone: 'ink' },
  { tag: 'WAV', body: 'share.wav', tone: 'rust' },
  { tag: '.ppm', body: 'share.ppm', tone: 'sky' },
  { tag: '.kwz', body: 'share.kwz', tone: 'berry' },
]

const INPUT_ICONS: readonly string[] = [
  'M9 11V5.5a1.5 1.5 0 0 1 3 0V10M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6.5 7-3 0-4.5-1.3-6-3.5L3.6 14a1.5 1.5 0 0 1 2.4-1.8L9 15',
  'M4 20l1.2-4.6L15.6 5a2.1 2.1 0 0 1 3 0l.4.4a2.1 2.1 0 0 1 0 3L8.6 18.8zM13.5 7.1l3.4 3.4',
  'M12 3a6 6 0 0 1 6 6v6a6 6 0 0 1-12 0V9a6 6 0 0 1 6-6zM12 7v3',
  'M3 7h18v11H3zM7 11h.01M11 11h.01M15 11h.01M8 14.5h8',
  'M7 8h10a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6h-4A4 4 0 0 1 3 13v-1a4 4 0 0 1 4-4zM8 10.5v3M6.5 12h3M15.5 11h.01M17.5 13h.01',
]

const BLOB =
  'M52 34c18-16 52-14 72-4s40 6 44 26-8 34-30 40-40 10-62 4-40-14-42-32 4-22 18-34z'

const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000']

const DEMOS: Readonly<Record<string, string>> = {
  pen: `<svg class="demo demo-pen" viewBox="0 0 200 120"><path class="demo-stroke" pathLength="1" d="M18 86c14-34 30-58 48-58 20 0 14 52 36 52 24 0 22-60 46-60 14 0 24 18 34 36"/><circle class="demo-tip" r="6" cx="0" cy="0"/></svg>`,
  paint: `<svg class="demo demo-paint" viewBox="0 0 200 120"><defs><pattern id="demo-dots" width="10" height="10" patternUnits="userSpaceOnUse"><rect width="5" height="5"/><rect x="5" y="5" width="5" height="5"/></pattern></defs><path class="demo-pattern" d="M24 92c6-36 26-62 60-62 28 0 30 34 56 34 22 0 30-20 38-34v62z"/></svg>`,
  eraser: `<svg class="demo demo-eraser" viewBox="0 0 200 120"><path class="demo-erased" pathLength="1" d="M22 64c24-22 44-22 62 0s40 22 58 0 30-18 38-6"/><g class="demo-rubber"><rect x="-17" y="-15" width="34" height="30" rx="8"/><rect x="-17" y="4" width="34" height="11" rx="5"/></g></svg>`,
  fill: `<svg class="demo demo-fill" viewBox="0 0 200 120"><clipPath id="demo-blob"><path d="${BLOB}"/></clipPath><circle class="demo-flood" clip-path="url(#demo-blob)" cx="104" cy="62" r="96"/><path class="demo-outline" d="${BLOB}"/></svg>`,
  shape: `<span class="demo demo-shape"><span class="demo-morph"></span><span class="demo-morph demo-morph-2"></span></span>`,
  select: `<svg class="demo demo-select" viewBox="0 0 200 120"><path class="demo-star" d="M100 30l9 19 21 3-15 14 4 21-19-10-19 10 4-21-15-14 21-3z"/><rect class="demo-ants" x="62" y="20" width="76" height="80" rx="4"/></svg>`,
  text: `<span class="demo demo-text"><span class="demo-letter">あ</span><span class="demo-letter demo-hollow">A</span><span class="demo-tate">たてがき</span></span>`,
  image: `<span class="demo demo-image"><span class="demo-photo"></span><span class="demo-halftone"></span></span>`,
  dot: `<svg class="demo demo-dot" viewBox="0 0 70 60">${HEART.flatMap(
    (row, y) =>
      [...row].map((cell, x) =>
        cell === '1'
          ? `<rect class="demo-pixel" style="--n:${y * 7 + x}" x="${x * 10 + 1}" y="${y * 10 + 1}" width="8" height="8" rx="1.5"/>`
          : '',
      ),
  ).join('')}</svg>`,
}

const STEPS: readonly { title: keyof Copy; body: keyof Copy }[] = [
  { title: 'how.step1.title', body: 'how.step1.body' },
  { title: 'how.step2.title', body: 'how.step2.body' },
  { title: 'how.step3.title', body: 'how.step3.body' },
]

const FAQS: readonly { question: keyof Copy; answer: keyof Copy }[] = [
  { question: 'faq.q1', answer: 'faq.a1' },
  { question: 'faq.q2', answer: 'faq.a2' },
  { question: 'faq.q3', answer: 'faq.a3' },
  { question: 'faq.q4', answer: 'faq.a4' },
  { question: 'faq.q5', answer: 'faq.a5' },
]

const PAD_COLORS: readonly string[] = ['--berry', '--sun', '--leaf', '--sky']

const DEVICES: readonly (readonly [string, keyof Copy])[] = [
  ['phone', 'anywhere.phone'],
  ['tablet', 'anywhere.tablet'],
  ['desktop', 'anywhere.desktop'],
]

const PLUGIN_CODE = `export default {
  id: 'my.plugin',
  name: 'My plugin',
  version: '1.0.0',

  setup(api) {
    api.commands.register({
      id: 'my.count',
      name: 'Count pages',
      icon: 'pages',
      run(editor) {
        api.toast(\`\${editor.pageCount} pages\`)
      },
    })
  },
}`

function escape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function icon(name: string, className = ''): string {
  const data = iconPath(name)

  return `<svg class="icon${data.isFilled ? ' icon-fill' : ''}${className ? ` ${className}` : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${data.d}"/></svg>`
}

function rawIcon(d: string): string {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`
}

function wrapped(text: string, lang: Lang): string {
  return phrases(text, lang).map(escape).join('<wbr>')
}

function lines(text: string, lang: Lang): string {
  return text
    .split('|')
    .map(
      (line, index) =>
        `<span class="line" style="--line:${index}"><span class="line-inner">${wrapped(line, lang)}</span></span>`,
    )
    .join('')
}

function list(text: string): string[] {
  return text.split('|')
}

function plainText(text: string): string {
  return escape(text.replaceAll('|', ' '))
}

function displayLines(text: string): string {
  let index = 0

  const letters = (word: string): string =>
    [...word]
      .map(
        letter =>
          `<span class="char" style="--i:${index++}">${escape(letter)}</span>`,
      )
      .join('')

  return `<span class="display-lines" aria-hidden="true">${text
    .split('|')
    .map(
      (line, lineIndex) =>
        `<span class="line" style="--line:${lineIndex}">${line
          .split(' ')
          .map(word => `<span class="word">${letters(word)}</span>`)
          .join(' ')}</span>`,
    )
    .join('')}</span>`
}

function highlightCode(code: string): string {
  return escape(code)
    .replace(/'([^'\n]*)'/g, '<span class="code-string">\'$1\'</span>')
    .replace(/`([^`]*)`/g, '<span class="code-string">`$1`</span>')
    .replace(/\b(export|default|return)\b/g, '<span class="code-key">$1</span>')
    .replace(
      /\b(setup|register|run|toast)\b(?=\()/g,
      '<span class="code-call">$1</span>',
    )
}

function squiggle(x: number): number {
  return 15 + Math.sin(x / 11) * 6.5
}

function squigglePath(from = 6, to = 94): string {
  const points: string[] = []

  for (let x = from; x <= to; x += 4) {
    points.push(`${x.toFixed(1)} ${squiggle(x).toFixed(1)}`)
  }

  return `M${points.join('L')}`
}

function seeded(seed: number): () => number {
  let state = seed

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0

    return state / 0x100000000
  }
}

function scatter(
  count: number,
  spread: number,
  draw: (x: number, y: number, random: () => number) => string,
  seed: number,
): string {
  const random = seeded(seed)

  return Array.from({ length: count }, (_, index) => {
    const x = 6 + (88 * (index + random() * 0.8)) / count
    const y = squiggle(x) + (random() - 0.5) * spread

    return draw(x, y, random)
  }).join('')
}

function star(x: number, y: number, size: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = (Math.PI * index) / 5 - Math.PI / 2
    const radius = index % 2 === 0 ? size : size * 0.45

    return `${(x + Math.cos(angle) * radius).toFixed(1)},${(y + Math.sin(angle) * radius).toFixed(1)}`
  })

  return `<polygon points="${points.join(' ')}"/>`
}

function heart(x: number, y: number, size: number): string {
  return `<path d="M0 3.5c-5-3-7-6-6-8.5s4-3 6 0c2-3 5-2.5 6 0s-1 5.5-6 8.5z" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(size / 7).toFixed(2)})"/>`
}

const BRUSH_ART: Readonly<Record<string, () => string>> = {
  'pen.pencil': () =>
    `<path class="b-line" filter="url(#rough)" d="${squigglePath()}" style="stroke:#5b5b5b;stroke-width:2"/>`,
  'pen.colorPencil': () =>
    `<path class="b-line" filter="url(#rough)" d="${squigglePath()}" style="stroke:#e8650d;stroke-width:3"/>`,
  'pen.crayon': () =>
    `<path class="b-line" filter="url(#rough)" d="${squigglePath()}" style="stroke:#f4497f;stroke-width:7;stroke-dasharray:3 1.5"/>`,
  'pen.chalk': () =>
    `<path class="b-line" filter="url(#rough)" d="${squigglePath()}" style="stroke:#9ab6c9;stroke-width:7;stroke-dasharray:6 1.2"/>`,
  'pen.charcoal': () =>
    `<path class="b-line" filter="url(#rough)" d="${squigglePath()}" style="stroke:#2a2522;stroke-width:8;opacity:.85"/>`,
  'pen.pastel': () =>
    `<path class="b-line" filter="url(#soft)" d="${squigglePath()}" style="stroke:#ff9fbf;stroke-width:9"/>`,
  'pen.watercolor': () =>
    `<path class="b-line" filter="url(#soft)" d="${squigglePath()}" style="stroke:#3fa9f5;stroke-width:11;opacity:.4"/><path class="b-line" d="${squigglePath(10, 88)}" style="stroke:#3fa9f5;stroke-width:4;opacity:.35"/>`,
  'pen.airbrush': () =>
    `<path class="b-line" filter="url(#mist)" d="${squigglePath()}" style="stroke:#58b368;stroke-width:12;opacity:.7"/>`,
  'pen.marker': () =>
    `<path class="b-line" d="${squigglePath()}" style="stroke:#2f7fe0;stroke-width:7;stroke-linecap:square"/>`,
  'pen.highlighter': () =>
    `<path class="b-line" d="${squigglePath()}" style="stroke:#ffd23f;stroke-width:13;stroke-linecap:butt;opacity:.75"/>`,
  'pen.nib': () =>
    `<path class="b-line" d="${squigglePath()}" style="stroke:#1b1a18;stroke-width:4.5"/><path class="b-line" d="${squigglePath(10, 90)}" style="stroke:#fffefb;stroke-width:1.6;opacity:.6"/>`,
  'pen.ribbon': () =>
    `<path class="b-line" d="${squigglePath()}" style="stroke:#f4497f;stroke-width:9;stroke-linecap:butt"/><path class="b-line" d="${squigglePath()}" style="stroke:#fff;stroke-width:2.4;stroke-linecap:butt"/>`,
  'pen.neon': () =>
    `<path class="b-line" filter="url(#mist)" d="${squigglePath()}" style="stroke:#3fe0ff;stroke-width:9;opacity:.8"/><path class="b-line" d="${squigglePath()}" style="stroke:#e9fdff;stroke-width:2.6"/>`,
  'pen.spray': () =>
    scatter(
      70,
      9,
      (x, y, random) =>
        `<circle cx="${(x + (random() - 0.5) * 3).toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.5 + random() * 0.6).toFixed(2)}" style="fill:#e8650d"/>`,
      3,
    ),
  'pen.stipple': () =>
    scatter(
      34,
      5,
      (x, y) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" style="fill:#4b2a12"/>`,
      5,
    ),
  'pen.splatter': () =>
    scatter(
      16,
      12,
      (x, y, random) =>
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.8 + random() * 2.6).toFixed(2)}" style="fill:#7a4fd6"/>`,
      9,
    ),
  'pen.dots': () =>
    `<path class="b-line" d="${squigglePath()}" style="stroke:#e8392f;stroke-width:5;stroke-dasharray:0.1 7"/>`,
  'pen.stars': () =>
    scatter(9, 4, (x, y) => star(x, y, 3.6), 11).replaceAll(
      '<polygon',
      '<polygon style="fill:#ffb800"',
    ),
  'pen.hearts': () =>
    scatter(8, 4, (x, y) => heart(x, y, 5), 13).replaceAll(
      '<path',
      '<path style="fill:#f4497f"',
    ),
}

function waveform(wave: (t: number) => number): string {
  const steps = 120
  const window = 0.014
  const samples = Array.from({ length: steps + 1 }, (_, index) =>
    wave((index / steps) * window),
  )
  const top = Math.max(...samples.map(Math.abs), 0.001)

  return samples
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${((index / steps) * 60).toFixed(1)} ${(14 - (value / top) * 11).toFixed(1)}`,
    )
    .join('')
}

export function renderPage(lang: Lang): string {
  const c = (key: keyof Copy): string => escape(COPY[lang][key])
  const raw = (key: keyof Copy): string => COPY[lang][key]
  const t = (key: keyof Copy): string => wrapped(COPY[lang][key], lang)
  const w = (text: string): string => wrapped(text, lang)
  const a = (key: keyof Messages): string => escape(APP[lang][key])
  const appText = new Map<string, string>(Object.entries(APP[lang]))
  const root = lang === 'ja' ? '' : '../'
  const app = APP_URL
  const hrefOf = (id: Lang): string =>
    id === lang ? './' : id === 'ja' ? root : `${root}${id}/`
  const current = LANGS.find(item => item.id === lang) ?? LANGS[0]

  const languageMenu = `
    <details class="lang" data-lang-menu>
      <summary class="lang-button" aria-label="${c('nav.language')}">
        ${rawIcon('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-2.5 2.5-3.6 5.6-3.6 9s1.1 6.5 3.6 9M12 3c2.5 2.5 3.6 5.6 3.6 9s-1.1 6.5-3.6 9')}
        <span class="lang-code">${lang.toUpperCase()}</span>
      </summary>
      <ul class="lang-list">
        ${LANGS.map(
          item =>
            `<li><a href="${hrefOf(item.id)}" hreflang="${item.id}" lang="${item.id}" data-lang-link="${item.id}"${item.id === lang ? ' aria-current="true"' : ''}>${escape(item.name)}${item.id === lang ? icon('check') : ''}</a></li>`,
        ).join('')}
      </ul>
    </details>`

  const steps = STEPS.map(
    (step, index) => `
        <li class="how-step" data-step="${index}">
          <span class="how-num">0${index + 1}</span>
          <h3 class="how-step-title">${t(step.title)}</h3>
          <p class="how-step-body">${t(step.body)}</p>
        </li>`,
  ).join('')

  const railTools: readonly [string, keyof Messages][] = [
    ['pen', 'tool.pen'],
    ['paint', 'tool.paint'],
    ['eraser', 'tool.eraser'],
    ['bucket', 'tool.fill'],
    ['shape', 'tool.shape'],
    ['select', 'tool.select'],
  ]

  const studio = `
    <div class="studio" data-studio role="img" aria-label="${c('how.stage')}">
      <div class="studio-top">
        <span class="studio-key">${icon('back')}</span>
        <span class="studio-name">${a('home.sampleTitle')}</span>
        <span class="studio-saved">${icon('check')}</span>
        <span class="studio-gap"></span>
        <span class="studio-key studio-wide">${icon('undo')}</span>
        <span class="studio-key studio-wide">${icon('redo')}</span>
        <span class="studio-export">${icon('share')}<span>${a('export.short')}</span></span>
      </div>
      <div class="studio-main">
        <div class="studio-rail">
          ${railTools
            .map(
              ([name, label], index) =>
                `<span class="studio-tool${index === 0 ? ' is-on' : ''}" data-tool="${name}">${icon(name)}<span>${a(label)}</span></span>`,
            )
            .join('')}
        </div>
        <div class="studio-desk">
          <div class="studio-sheet notebook">
            <span class="notebook-tape"></span>
            <div class="flip" data-studio-flip></div>
            <span class="studio-pen" data-studio-pen>${icon('pen')}</span>
          </div>
        </div>
      </div>
      <div class="studio-bar">
        <span class="studio-play" data-studio-play>${icon('play')}${icon('pause')}</span>
        <span class="lcd"><b data-studio-page>001</b><i>/</i><span data-studio-count>001</span></span>
        <span class="studio-onion" data-studio-onion>${icon('onion')}</span>
        <span class="studio-gap"></span>
        <span class="studio-add" data-studio-add>${icon('plus')}<span>${a('page.add')}</span></span>
      </div>
      <div class="studio-film"><div class="studio-frames" data-studio-frames></div></div>
    </div>`

  const swatches: readonly [string, keyof Copy][] = [
    ['#1b1a18', 'try.black'],
    ['#e8392f', 'try.red'],
    ['#2f7fe0', 'try.blue'],
  ]

  const toy = `
    <div class="toy" data-toy data-play-label="${c('try.play')}" data-stop-label="${c('try.stop')}">
      <div class="toy-book notebook">
        <span class="notebook-tape"></span>
        <div class="flip toy-flip" data-toy-flip role="img" aria-label="${c('try.canvas')}"></div>
      </div>
      <div class="toy-bar">
        <div class="toy-inks" role="group" aria-label="${c('try.color')}">
          ${swatches
            .map(
              ([color, label], index) =>
                `<button class="swatch${index === 0 ? ' is-on' : ''}" type="button" data-ink="${color}" style="--ink-color:${color}" aria-label="${c(label)}" aria-pressed="${index === 0}"></button>`,
            )
            .join('')}
          <button class="toy-tool" type="button" data-eraser aria-label="${a('tool.eraser')}" aria-pressed="false">${icon('eraser')}</button>
        </div>
        <div class="toy-pages" role="group" aria-label="${c('try.pages')}">
          ${[1, 2, 3, 4]
            .map(
              page =>
                `<button class="toy-page${page === 1 ? ' is-on' : ''}" type="button" data-page="${page - 1}" aria-label="${escape(raw('try.page').replace('{n}', String(page)))}" aria-pressed="${page === 1}"><span>${page}</span></button>`,
            )
            .join('')}
        </div>
        <button class="toy-tool" type="button" data-clear aria-label="${c('try.clear')}">${icon('trash')}</button>
        <button class="btn btn-sun toy-play" type="button" data-play>${icon('play')}${icon('pause')}<span data-play-text>${t('try.play')}</span></button>
      </div>
    </div>`

  const tools = TOOLS.map(
    tool => `
      <li class="tool-card tool-${tool.id}" data-reveal>
        <div class="tool-demo" aria-hidden="true">${DEMOS[tool.id] ?? ''}</div>
        <div class="tool-copy">
          <h3 class="tool-name">${icon(tool.icon)}<span>${a(tool.name)}</span></h3>
          <p class="tool-body">${t(tool.body)}</p>
        </div>
      </li>`,
  ).join('')

  const brushes = BRUSHES.map(
    key =>
      `<li class="brush"><svg class="brush-art" viewBox="0 0 100 30" aria-hidden="true">${BRUSH_ART[key]?.() ?? ''}</svg><span>${a(key)}</span></li>`,
  ).join('')

  const film = FILM.map(
    item => `
      <li class="film-item" data-reveal>
        <div class="film-demo" aria-hidden="true">${FILM_DEMOS[item.id] ?? ''}</div>
        <span class="film-icon">${icon(item.icon)}</span>
        <h3 class="film-item-title">${t(item.title)}</h3>
        <p class="film-item-body">${t(item.body)}</p>
      </li>`,
  ).join('')

  const pads = SOUND_PRESETS.map(
    (preset, index) =>
      `<li><button class="pad" type="button" data-sound="${preset.id}" data-track="${Math.floor(index / 2) % PAD_COLORS.length}" style="--pad:var(${PAD_COLORS[Math.floor(index / 2) % PAD_COLORS.length]})"><svg class="pad-wave" viewBox="0 0 60 28" aria-hidden="true"><path d="${waveform(preset.wave)}"/></svg><span class="pad-name">${escape(appText.get(preset.nameKey ?? '') ?? preset.name ?? preset.id)}</span></button></li>`,
  ).join('')

  const timelineRows = [
    { label: c('sound.bgm'), kind: 'bgm', blocks: [[0, 62]] },
    { label: c('sound.bgm'), kind: 'bgm', blocks: [[38, 100]] },
    {
      label: c('sound.se'),
      kind: 'se',
      blocks: [
        [8, 14],
        [52, 58],
      ],
    },
    {
      label: c('sound.se'),
      kind: 'se',
      blocks: [
        [22, 26],
        [70, 75],
      ],
    },
    {
      label: c('sound.se'),
      kind: 'se',
      blocks: [
        [34, 40],
        [86, 92],
      ],
    },
    { label: c('sound.se'), kind: 'se', blocks: [[60, 64]] },
  ]

  const timeline = `
    <div class="timeline" aria-hidden="true">
      <div class="timeline-ruler">${Array.from({ length: 12 }, (_, index) => `<span>${index + 1}</span>`).join('')}</div>
      ${timelineRows
        .map(
          (row, index) => `
          <div class="timeline-row timeline-${row.kind}">
            <span class="timeline-label">${icon(row.kind === 'bgm' ? 'music' : 'volume')}<span>${row.label}${row.kind === 'se' ? ` ${index - 1}` : ` ${index + 1}`}</span></span>
            <span class="timeline-lane">${row.blocks
              .map(
                ([from, to]) =>
                  `<span class="timeline-block" style="--from:${from};--to:${to}"></span>`,
              )
              .join('')}</span>
          </div>`,
        )
        .join('')}
      <span class="timeline-head"></span>
    </div>`

  const specLabels = list(raw('notes.labels'))

  const covers = KINDS.map(
    (kind, index) => `
      <li class="kind" data-kind="${kind.id}" data-reveal style="--index:${index}">
        <div class="cover">
          <span class="cover-spine"></span>
          <span class="cover-name"><span class="cover-title">${a(kind.name)}</span></span>
          <span class="cover-panel">
            <span class="cover-picture"><canvas class="cover-art" data-cover-art="${kind.id}" aria-hidden="true"></canvas></span>
            <span class="cover-detail">${a(kind.detail)}</span>
          </span>
        </div>
        <dl class="kind-specs">${list(raw(kind.specs))
          .map(
            (spec, row) =>
              `<div><dt>${w(specLabels[row] ?? '')}</dt><dd>${w(spec)}</dd></div>`,
          )
          .join('')}</dl>
      </li>`,
  ).join('')

  const stickers = FORMATS.map(
    (format, index) => `
      <li class="sticker sticker-${format.tone}" style="--index:${index}" data-reveal>
        <b class="sticker-tag">${escape(format.tag)}</b>
        <span class="sticker-body">${t(format.body)}</span>
      </li>`,
  ).join('')

  const inputs = list(raw('anywhere.inputs'))
    .map(
      (label, index) =>
        `<li class="input">${rawIcon(INPUT_ICONS[index] ?? '')}<span>${escape(label)}</span></li>`,
    )
    .join('')

  const miniTools = (count: number, withLabels: boolean): string =>
    railTools
      .slice(0, count)
      .map(
        ([name, label], index) =>
          `<span class="mini-tool${index === 0 ? ' is-on' : ''}">${icon(name)}${withLabels ? `<span>${a(label)}</span>` : ''}</span>`,
      )
      .join('')

  const miniPaper =
    '<span class="mini-paper"><span class="mini-sheet" data-device-art></span></span>'
  const miniFilm = '<span class="mini-film"></span>'
  const miniBar = `<span class="mini-bar"><span class="mini-dot"></span><span class="mini-title">${a('home.sampleTitle')}</span><span class="mini-export">${icon('share')}</span></span>`
  const miniPlay = `<span class="mini-play"><span class="mini-key">${icon('play')}</span><span class="mini-lcd">012</span></span>`

  const deviceScreens: Readonly<Record<string, string>> = {
    phone: `${miniBar}${miniPaper}${miniPlay}${miniFilm}<span class="mini-tools">${miniTools(6, false)}</span>`,
    tablet: `${miniBar}<span class="mini-tabs">${miniTools(6, false)}</span>${miniPaper}<span class="mini-tabs mini-tabs-right"><span class="mini-tool">${icon('pen')}</span><span class="mini-tool">${icon('layers')}</span></span>${miniPlay}${miniFilm}`,
    desktop: `${miniBar}<span class="mini-rail">${miniTools(6, true)}</span>${miniPaper}${miniPlay}${miniFilm}`,
  }

  const devices = DEVICES.map(
    ([id, label]) => `
      <figure class="device device-${id}" data-reveal>
        <div class="device-screen">${deviceScreens[id] ?? ''}</div>
        <figcaption>${t(label)}</figcaption>
      </figure>`,
  ).join('')

  const points = list(raw('privacy.points'))
    .map(point => `<li>${icon('check')}<span>${w(point)}</span></li>`)
    .join('')

  const faqs = FAQS.map(
    (faq, index) => `
      <details class="faq-item" data-reveal${index === 0 ? ' open' : ''}>
        <summary><span>${t(faq.question)}</span><span class="faq-mark" aria-hidden="true"></span></summary>
        <p>${t(faq.answer)}</p>
      </details>`,
  ).join('')

  const corner = `
        <div class="corner" data-corner-book aria-hidden="true">
          <span class="corner-label">${t('corner.yours')}</span>
          <div class="corner-book notebook">
            <span class="notebook-tape"></span>
            <div class="flip"></div>
          </div>
        </div>`

  const redirect =
    lang === 'ja'
      ? `<script>try{if(!localStorage.getItem('flipbook.site.lang')){var l=(navigator.languages||[navigator.language]).map(function(x){return String(x).slice(0,2).toLowerCase()}).find(function(x){return ['ja','en','es','fr','ru'].indexOf(x)>=0});if(l&&l!=='ja')location.replace(l+'/'+location.hash)}}catch(e){}</script>`
      : ''

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#ff8a1e" />
    <title>${c('meta.title')}</title>
    <meta name="description" content="${c('meta.description')}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${c('meta.title')}" />
    <meta property="og:description" content="${c('meta.description')}" />
    <meta property="og:locale" content="${current.locale}" />
    <meta name="twitter:card" content="summary" />
    ${LANGS.map(item => `<link rel="alternate" hreflang="${item.id}" href="${hrefOf(item.id) || './'}" />`).join('\n    ')}
    <link rel="icon" href="data:," />
    <script>document.documentElement.classList.add('js');setTimeout(function(){var d=document.documentElement;if(!d.classList.contains('is-live'))d.classList.remove('js')},4000)</script>
    ${redirect}
    <link rel="preload" href="${root}fonts/zen-maru-900.woff2" as="font" type="font/woff2" crossorigin />
    <link rel="stylesheet" href="${root}site.css" />
    <script type="module" src="${root}site.js"></script>
  </head>
  <body>
    <svg class="filters" aria-hidden="true" focusable="false">
      <filter id="boil-0"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
      <filter id="boil-1"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
      <filter id="boil-2"><feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="13"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter>
      <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="4"/><feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>
      <filter id="soft"><feGaussianBlur stdDeviation="0.9"/></filter>
      <filter id="mist" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="2.2"/></filter>
    </svg>
    <a class="skip" href="#main">${t('nav.skip')}</a>
    <header class="bar" data-bar>
      <a class="bar-brand" href="#top" aria-label="${c('brand.name')}">
        <span class="bar-name">${t('brand.name')}</span>
        ${raw('brand.sub') ? `<span class="bar-sub">${t('brand.sub')}</span>` : ''}
      </a>
      <nav class="bar-nav" aria-label="${c('brand.name')}">
        <a href="#how">${t('nav.how')}</a>
        <a href="#features">${t('nav.features')}</a>
        <a href="#notes">${t('nav.notes')}</a>
        <a href="#faq">${t('nav.faq')}</a>
      </nav>
      <div class="bar-end">
        ${languageMenu}
        <a class="btn btn-sun btn-small" href="${app}">${t('nav.open')}</a>
      </div>
    </header>
    <main id="main">
      <section class="hero" id="top" aria-labelledby="hero-title">
        <div class="desk" aria-hidden="true"></div>
        <canvas class="trail" data-trail aria-hidden="true"></canvas>
        <div class="hero-inner wrap">
          <div class="hero-copy">
            <h1 class="display hero-title" id="hero-title" aria-label="${plainText(raw('hero.title'))}">${displayLines(raw('hero.title'))}</h1>
            <p class="hero-lead" data-intro style="--d:4">${t('hero.lead')}</p>
            <div class="actions" data-intro style="--d:5">
              <a class="btn btn-sun btn-big" href="${app}">${icon('pen')}<span>${t('hero.cta')}</span></a>
              <a class="btn btn-white" href="#how"><span>${t('hero.secondary')}</span>${icon('down')}</a>
            </div>
            <p class="hero-note" data-intro style="--d:6">${t('hero.note')}</p>
          </div>
          <figure class="hero-stage" data-intro style="--d:3">
            <div class="hero-book notebook" data-kind="free">
              <span class="notebook-tape"></span>
              <div class="flip" data-hero-flip role="img" aria-label="${c('hero.book')}"></div>
              <span class="corner-grip" data-corner aria-hidden="true"></span>
              <span class="hero-cover" aria-hidden="true">
                <span class="hero-cover-face">
                  <span class="hero-cover-plate">
                    <span class="hero-cover-title">${c('brand.name')}</span>
                    <span class="hero-cover-sub">${a('app.subtitle')}</span>
                  </span>
                  <span class="hero-cover-panel"><span>No.</span><span>Date</span></span>
                </span>
                <span class="hero-cover-back"></span>
              </span>
            </div>
            <figcaption class="hero-hint">${icon('hand')}<span>${t('hero.hint')}</span></figcaption>
          </figure>
        </div>
      </section>

      <section class="statement" aria-label="${c('statement.label')}">
        <div class="wrap">
          <p class="statement-text" data-ink>${t('statement.text')}</p>
        </div>
        ${corner}
      </section>

      <section class="how" id="how" aria-labelledby="how-title">
        <div class="how-track" data-how>
          <div class="how-sticky">
            <div class="wrap how-grid">
              <div class="how-copy">
                <div class="how-head">
                  <h2 class="title" id="how-title">${lines(raw('how.title'), lang)}</h2>
                </div>
                <ol class="how-steps">${steps}</ol>
              </div>
              <div class="how-stage">${studio}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="try sheet" id="try" aria-labelledby="try-title">
        <div class="wrap try-grid">
          <div class="try-copy">
            <h2 class="title" id="try-title">${lines(raw('try.title'), lang)}</h2>
            <p class="lead">${t('try.body')}</p>
            <p class="try-more">${t('try.more')}</p>
            <a class="btn btn-sun try-cta" href="${app}">${icon('pen')}<span>${t('hero.cta')}</span></a>
          </div>
          ${toy}
        </div>
      </section>

      <section class="tools" id="features" aria-labelledby="tools-title">
        <div class="wrap">
          <div class="section-head section-split">
            <div>
              <h2 class="title" id="tools-title">${lines(raw('tools.title'), lang)}</h2>
            </div>
            <p class="lead">${t('tools.lead')}</p>
          </div>
          <ul class="tool-grid">
            ${tools}
            <li class="brushes" data-reveal>
              <h3 class="brushes-title">${icon('wand')}<span>${t('tools.brushes')}</span></h3>
              <ul class="brush-list">${brushes}</ul>
            </li>
          </ul>
        </div>
        ${corner}
      </section>

      <section class="film" id="animate" aria-labelledby="film-title">
        <div class="wrap section-head section-split">
          <div>
            <h2 class="title" id="film-title">${lines(raw('film.title'), lang)}</h2>
          </div>
          <p class="lead">${t('film.lead')}</p>
        </div>
        <div class="film-strip" data-film aria-hidden="true"><div class="film-track" data-film-track></div></div>
        <ul class="wrap film-list">${film}</ul>
      </section>

      <section class="sound sheet" id="sound" aria-labelledby="sound-title">
        <div class="wrap sound-grid">
          <div class="sound-copy">
            <h2 class="title" id="sound-title">${lines(raw('sound.title'), lang)}</h2>
            <p class="lead">${t('sound.lead')}</p>
          </div>
          <div class="sound-stage">
            ${timeline}
            <div class="pads-wrap">
              <p class="pads-hint">${icon('volume')}<span>${t('sound.tap')}</span></p>
              <ul class="pads">${pads}</ul>
            </div>
          </div>
        </div>
        ${corner}
      </section>

      <section class="notes" id="notes" aria-labelledby="notes-title">
        <div class="wrap">
          <div class="section-head">
            <h2 class="title" id="notes-title">${lines(raw('notes.title'), lang)}</h2>
          </div>
          <ul class="kinds">${covers}</ul>
        </div>
        <div class="wrap share-grid" id="share">
          <div class="share-copy">
            <h2 class="title" id="share-title">${lines(raw('share.title'), lang)}</h2>
            <p class="lead">${t('share.lead')}</p>
          </div>
          <ul class="stickers">${stickers}</ul>
        </div>
        ${corner}
      </section>

      <section class="anywhere" id="anywhere" aria-labelledby="anywhere-title">
        <div class="wrap">
          <div class="section-head section-split">
            <div>
              <h2 class="title" id="anywhere-title">${lines(raw('anywhere.title'), lang)}</h2>
            </div>
            <p class="lead">${t('anywhere.lead')}</p>
          </div>
          <div class="devices">${devices}</div>
          <ul class="inputs" data-reveal>${inputs}</ul>
        </div>
      </section>

      <section class="open sheet" id="open" aria-labelledby="open-title">
        <div class="wrap open-grid">
          <div class="open-copy">
            <h2 class="title" id="open-title">${lines(raw('open.title'), lang)}</h2>
            <p class="lead">${t('open.lead')}</p>
            <div class="actions">
              <a class="btn btn-white" href="${REPOSITORY}" rel="noopener">${icon('plugin')}<span>${t('open.github')}</span></a>
              <a class="text-link" href="${REPOSITORY}/issues" rel="noopener"><span>${t('open.issues')}</span>${icon('forward')}</a>
            </div>
          </div>
          <figure class="code notebook" data-reveal>
            <span class="notebook-tape"></span>
            <figcaption class="code-name">plugin.js</figcaption>
            <pre><code>${highlightCode(PLUGIN_CODE)}</code></pre>
          </figure>
        </div>
      </section>

      <section class="faq sheet" id="faq" aria-labelledby="faq-title">
        <div class="wrap faq-grid">
          <div class="faq-side">
            <h2 class="title" id="faq-title">${t('faq.title')}</h2>
            <div class="privacy" data-reveal>
              <h3 class="privacy-title">${lines(raw('privacy.title'), lang)}</h3>
              <p>${t('privacy.lead')}</p>
              <ul class="privacy-points">${points}</ul>
            </div>
          </div>
          <div class="faq-list">${faqs}</div>
        </div>
        ${corner}
      </section>

      <section class="cta" id="start" data-cta>
        <div class="desk" aria-hidden="true"></div>
        <div class="wrap cta-inner">
          <div class="cta-newt" data-newt></div>
          <div class="cta-book" data-cta-book hidden>
            <div class="notebook"><span class="notebook-tape"></span><div class="flip"></div></div>
          </div>
          <h2 class="display cta-title cta-default" aria-label="${plainText(raw('cta.title'))}">${displayLines(raw('cta.title'))}</h2>
          <h2 class="display cta-title cta-yours" aria-label="${plainText(raw('cta.titleYours'))}">${displayLines(raw('cta.titleYours'))}</h2>
          <a class="btn btn-sun btn-big cta-default" href="${app}">${icon('pen')}<span>${t('cta.button')}</span></a>
          <a class="btn btn-sun btn-big cta-yours" href="${app}">${icon('pen')}<span>${t('cta.buttonYours')}</span></a>
          <p class="cta-note">${t('cta.note')}</p>
        </div>
      </section>
    </main>


    <footer class="foot">
      <div class="wrap foot-grid">
        <div class="foot-brand">
          <p class="foot-name">${t('brand.name')}</p>
          <p class="foot-tagline">${t('footer.tagline')}</p>
        </div>
        <ul class="foot-links">
          <li><a href="${HOME_URL}">${t('footer.home')}</a></li>
          <li><a href="${app}">${t('footer.app')}</a></li>
          <li><a href="${REPOSITORY}" rel="noopener">GitHub</a></li>
          <li><a href="${REPOSITORY}/issues" rel="noopener">${t('footer.issues')}</a></li>
        </ul>
        <ul class="foot-langs">
          ${LANGS.map(item => `<li><a href="${hrefOf(item.id)}" hreflang="${item.id}" lang="${item.id}" data-lang-link="${item.id}"${item.id === lang ? ' aria-current="true"' : ''}>${escape(item.name)}</a></li>`).join('')}
        </ul>
      </div>
      <div class="wrap foot-legal">
        <p>${t('footer.disclaimer')}</p>
        <p class="foot-end"><span>Unlicense</span><a href="#top">${t('footer.top')}${icon('up')}</a></p>
      </div>
    </footer>
  </body>
</html>
`
}
