import { settings } from '../app/settings.ts'
import { t } from '../i18n/index.ts'
import type { Scene } from './app.ts'
import { h } from './dom.ts'
import { playSfx, unlockSfx } from './sfx.ts'

export interface TitleCallbacks {
  onStart: () => void
}

function flippingBook(): HTMLElement {
  return h(
    'div',
    { class: 'title-book', 'aria-hidden': 'true' },
    h('span', { class: 'title-sheet is-base' }),
    [0, 1, 2].map(index =>
      h('span', { class: 'title-sheet', style: `--index:${index}` }),
    ),
  )
}

export function titleScene(callbacks: TitleCallbacks): Scene {
  let hasStarted = false

  const start = (): void => {
    if (hasStarted) return

    hasStarted = true
    unlockSfx()
    playSfx('start')
    callbacks.onStart()
  }

  const name = t('app.name')
  const words = name.split(' ')
  const starts = words.map((_, index) =>
    words.slice(0, index).reduce((sum, word) => sum + word.length, 0),
  )

  const letters = words.map((word, wordIndex) =>
    h(
      'span',
      { class: 'title-word' },
      [...word].map((letter, index) =>
        h(
          'span',
          {
            class: 'title-letter',
            style: `--index:${starts[wordIndex] + index}`,
          },
          letter,
        ),
      ),
    ),
  )

  const startButton = h(
    'button',
    {
      class: 'title-start',
      type: 'button',
      'data-nav': true,
      'data-no-cursor': true,
      onClick: start,
    },
    t('title.start'),
  )

  const element = h(
    'div',
    { class: 'scene title', onPointerUp: start },
    h(
      'div',
      { class: 'title-center' },
      flippingBook(),
      h('h1', { class: 'title-logo', 'aria-label': name }, letters),
      h('p', { class: 'title-sub' }, t('app.subtitle')),
      startButton,
    ),
  )

  const onKey = (event: KeyboardEvent): void => {
    if (event.repeat) return

    start()
  }

  window.addEventListener('keydown', onKey)

  return {
    element,
    initialFocus: () => startButton,
    dispose: () => window.removeEventListener('keydown', onKey),
  }
}

export function shouldSkipTitle(): boolean {
  return settings.skipTitle.peek()
}
