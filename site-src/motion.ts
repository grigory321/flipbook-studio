import { phrases } from './phrase.ts'

export const isCalm = matchMedia('(prefers-reduced-motion: reduce)').matches

export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

export function whenVisible(
  element: Element,
  onChange: (isVisible: boolean) => void,
  margin = '120px 0px',
): void {
  new IntersectionObserver(
    entries => {
      for (const entry of entries) onChange(entry.isIntersecting)
    },
    { rootMargin: margin },
  ).observe(element)
}

export function onResize(element: Element, callback: () => void): void {
  new ResizeObserver(callback).observe(element)
}

type Scroller = () => void

const scrollers = new Set<Scroller>()
let isQueued = false

function runScrollers(): void {
  isQueued = false

  for (const scroller of scrollers) scroller()
}

export function onScroll(scroller: Scroller): void {
  scrollers.add(scroller)
  scroller()
}

function queueScroll(): void {
  if (isQueued) return

  isQueued = true
  requestAnimationFrame(runScrollers)
}

addEventListener('scroll', queueScroll, { passive: true })
addEventListener('resize', queueScroll)

export function progressThrough(element: Element): number {
  const box = element.getBoundingClientRect()
  const travel = box.height - innerHeight

  return travel > 0 ? clamp(-box.top / travel) : box.top < 0 ? 1 : 0
}

export function progressAcross(element: Element): number {
  const box = element.getBoundingClientRect()

  return clamp((innerHeight - box.top) / (innerHeight + box.height))
}

function reveal(): void {
  const targets = document.querySelectorAll('[data-reveal], .title, .cta-title')

  if (isCalm) {
    for (const target of targets) target.classList.add('is-in')

    return
  }

  const observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue

        entry.target.classList.add('is-in')
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '0px 0px -4% 0px' },
  )

  for (const list of document.querySelectorAll(
    '.tool-grid, .film-list, .kinds, .stickers, .faq-list, .devices',
  )) {
    ;[...list.children].forEach((child, index) => {
      if (child instanceof HTMLElement && child.matches('[data-reveal]')) {
        child.style.setProperty('--index', String(index % 4))
      }
    })
  }

  for (const target of targets) observer.observe(target)
}

function inkStatement(): void {
  const text = document.querySelector<HTMLElement>('[data-ink]')

  if (!text) return

  const source = text.textContent ?? ''
  const language = document.documentElement.lang
  const pieces =
    language === 'ja'
      ? phrases(source, language)
      : typeof Intl.Segmenter === 'function'
        ? [
            ...new Intl.Segmenter(language, { granularity: 'word' }).segment(
              source,
            ),
          ].map(part => part.segment)
        : source.split(/(\s+)/)
  const words: HTMLSpanElement[] = []
  const spans: { word: HTMLSpanElement; start: number; end: number }[] = []
  const keys =
    language === 'ja' ? ['パラパラまんが', 'うごくノート'] : ['Flipbook Studio']
  let position = 0

  text.replaceChildren()

  for (const piece of pieces) {
    const start = position

    position += piece.length

    if (/^\s+$/.test(piece)) {
      text.append(piece)
      continue
    }

    const span = document.createElement('span')

    span.className = 'ink-word'
    span.textContent = piece
    words.push(span)
    spans.push({ word: span, start, end: position })
    text.append(span)

    if (language === 'ja') text.append(document.createElement('wbr'))
  }

  for (const key of keys) {
    for (
      let from = source.indexOf(key);
      from >= 0;
      from = source.indexOf(key, from + key.length)
    ) {
      const to = from + key.length

      for (const span of spans) {
        if (span.start < to && span.end > from)
          span.word.classList.add('is-key')
      }
    }
  }

  if (isCalm) {
    for (const word of words) word.classList.add('is-inked')

    return
  }

  let shown = -1

  onScroll(() => {
    const box = text.getBoundingClientRect()
    const progress = clamp(
      (innerHeight * 0.85 - box.top) / (innerHeight * 0.35 + box.height / 2),
    )
    const count = Math.round(progress * words.length)

    if (count === shown) return

    shown = count
    words.forEach((word, index) =>
      word.classList.toggle('is-inked', index < count),
    )
  })
}

function headerState(): void {
  const bar = document.querySelector<HTMLElement>('[data-bar]')

  if (!bar) return

  const links = [...bar.querySelectorAll<HTMLAnchorElement>('.bar-nav a')]
  const sections = links
    .map(link => document.querySelector(link.hash))
    .filter(section => section instanceof HTMLElement)
  let last = scrollY

  onScroll(() => {
    const y = scrollY
    const isDown = y > last + 4
    const isUp = y < last - 4

    bar.classList.toggle('is-scrolled', y > 24)

    if (isDown && y > innerHeight * 0.8) bar.classList.add('is-tucked')
    if (isUp || y < innerHeight * 0.5) bar.classList.remove('is-tucked')

    last = y

    let current = -1

    sections.forEach((section, index) => {
      if (section.getBoundingClientRect().top < innerHeight * 0.4)
        current = index
    })

    links.forEach((link, index) =>
      link.classList.toggle('is-current', index === current),
    )
  })

  bar.addEventListener('focusin', () => bar.classList.remove('is-tucked'))
}

function languageMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>('[data-lang-menu]')

  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    '[data-lang-link]',
  )) {
    link.addEventListener('click', () => {
      try {
        localStorage.setItem(
          'flipbook.site.lang',
          link.dataset.langLink ?? 'ja',
        )
      } catch {
        return
      }
    })
  }

  if (!menu) return

  document.addEventListener('pointerdown', event => {
    if (
      menu.open &&
      event.target instanceof Node &&
      !menu.contains(event.target)
    ) {
      menu.open = false
    }
  })

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false
      menu.querySelector('summary')?.focus()
    }
  })
}

export function startMotion(): void {
  document.documentElement.classList.add('js')
  reveal()
  inkStatement()
  headerState()
  languageMenu()

  const ready = (): void => document.documentElement.classList.add('is-ready')

  Promise.race([
    document.fonts.ready,
    new Promise(resolve => setTimeout(resolve, 900)),
  ]).then(() => requestAnimationFrame(ready))
}
