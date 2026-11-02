import type { Editor } from '../../app/editor.ts'
import {
  makeMotionPath,
  type MotionEase,
  type MotionPoint,
} from '../../app/motion.ts'
import {
  applyRange,
  buildMotion,
  insertWobble,
  type MotionMode,
  type MotionOptions,
  placeOnPath,
  type RangeAction,
  type WobbleKind,
} from '../../app/series.ts'
import { t, type MessageKey } from '../../i18n/index.ts'
import { fill, h, key, Scope } from '../dom.ts'
import { openDialog, toast } from '../overlay.ts'
import { playSfx } from '../sfx.ts'
import { FloatPainter } from './float-paint.ts'
import { sliderRow, toggleRow } from '../controls.ts'

const PREVIEW_MS = 1000 / 10
const SCALE_PERCENT = 100
const ADD_PAGES_MAX = 60
const ADD_PAGES_DEFAULT = 10

function chipRow<T extends string | number>(
  label: string,
  choices: readonly (readonly [T, string])[],
  current: T,
  onPick: (value: T) => void,
): HTMLElement {
  const row = h('div', { class: 'chip-row' })
  let selected = current

  const render = (): void => {
    fill(
      row,
      choices.map(([value, text]) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(value === selected),
            onClick: () => {
              selected = value
              render()
              onPick(value)
            },
          },
          text,
        ),
      ),
    )
  }

  render()

  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    row,
  )
}

export function openAddPagesDialog(
  editor: Editor,
  onAdd: (count: number) => void,
): void {
  const room = Math.min(
    ADD_PAGES_MAX,
    editor.note.profile.maxPages - editor.pageCount,
  )

  if (room < 1) {
    toast(t('page.full'), { isError: true })

    return
  }

  let count = Math.min(ADD_PAGES_DEFAULT, room)

  const total = h('p', { class: 'dialog-text' })
  const showTotal = (): void => {
    total.textContent = t('page.addManyTotal', { n: editor.pageCount + count })
  }

  showTotal()

  const dialog = openDialog({
    title: t('page.addMany'),
    icon: 'plus',
    body: [
      h('p', { class: 'dialog-text' }, t('page.addManyDetail')),
      sliderRow(t('page.addManyCount'), count, { min: 1, max: room }, value => {
        count = value
        showTotal()
      }),
      total,
    ],
    footer: key({
      icon: 'check',
      label: t('page.add'),
      variant: 'primary',
      onPress: () => {
        dialog.close()
        onAdd(count)
      },
    }),
  })
}

const EASES: readonly (readonly [MotionEase, MessageKey])[] = [
  ['none', 'path.easeNone'],
  ['in', 'path.easeIn'],
  ['out', 'path.easeOut'],
  ['both', 'path.easeBoth'],
]

export function openPathDialog(
  editor: Editor,
  points: readonly MotionPoint[],
  picture: HTMLCanvasElement,
  onDone: () => void,
): void {
  const floating = editor.floating.peek()

  if (!floating) return

  const { meta } = editor.note
  const scope = new Scope()
  const sprite = floating.bake()
  const start = sprite.center
  const painter = new FloatPainter(editor)
  const options: MotionOptions = {
    path: makeMotionPath(points),
    count: 12,
    ease: 'none',
    follows: false,
    finalScale: 1,
    mode: 'add',
  }

  const preview = h('canvas', {
    class: 'motion-preview',
    width: meta.width,
    height: meta.height,
    style: `background-color:${editor.paperColor()}`,
  })
  const context = preview.getContext('2d')
  const sprites = h('canvas', { width: meta.width, height: meta.height })
  const spriteContext = sprites.getContext('2d')

  let step = 0

  const showFrame = (): void => {
    if (!context || !spriteContext) return

    step = step >= options.count ? 0 : step + 1
    placeOnPath(sprite, start, options, step)
    context.clearRect(0, 0, meta.width, meta.height)
    context.drawImage(picture, 0, 0)
    spriteContext.clearRect(0, 0, meta.width, meta.height)
    painter.paint(spriteContext, sprite)
    context.drawImage(sprites, 0, 0)
  }

  const timer = window.setInterval(showFrame, PREVIEW_MS)

  scope.add(() => clearInterval(timer))
  showFrame()

  const create = async (): Promise<void> => {
    dialog.close()

    const isDone = await buildMotion(editor, options)

    if (!isDone) {
      toast(t('page.full'), { isError: true })

      return
    }

    playSfx('page')
    onDone()
  }

  const dialog = openDialog({
    title: t('tool.path'),
    icon: 'path',
    isWide: true,
    onClose: () => scope.dispose(),
    body: [
      preview,
      chipRow<MotionMode>(
        t('path.mode'),
        [
          ['add', t('path.modeAdd')],
          ['overlay', t('path.modeOverlay')],
        ],
        options.mode,
        value => {
          options.mode = value
        },
      ),
      sliderRow(t('path.count'), options.count, { min: 2, max: 30 }, value => {
        options.count = value
      }),
      chipRow<MotionEase>(
        t('path.ease'),
        EASES.map(([ease, label]) => [ease, t(label)]),
        options.ease,
        value => {
          options.ease = value
        },
      ),
      sliderRow(
        t('path.scale'),
        SCALE_PERCENT,
        { min: 25, max: 200 },
        value => {
          options.finalScale = value / SCALE_PERCENT
        },
      ),
      toggleRow(t('path.follow'), options.follows, value => {
        options.follows = value
      }),
    ],
    footer: key({
      icon: 'check',
      label: t('path.create'),
      variant: 'primary',
      onPress: () => void create(),
    }),
  })
}

export function openWobbleDialog(editor: Editor): void {
  let count = 2
  let strength = 1
  let kind: WobbleKind = 'line'

  const create = async (): Promise<void> => {
    dialog.close()

    if (await insertWobble(editor, { count, strength, kind })) playSfx('page')
    else toast(t('page.full'), { isError: true })
  }

  const dialog = openDialog({
    title: t('wobble.title'),
    icon: 'wobble',
    body: [
      h('p', { class: 'dialog-text' }, t('wobble.detail')),
      chipRow<WobbleKind>(
        t('wobble.kind'),
        [
          ['line', t('wobble.line')],
          ['whole', t('wobble.whole')],
        ],
        kind,
        value => {
          kind = value
        },
      ),
      chipRow<number>(
        t('wobble.strength'),
        [
          [0, t('wobble.weak')],
          [1, t('wobble.middle')],
          [2, t('wobble.strong')],
        ],
        strength,
        value => {
          strength = value
        },
      ),
      sliderRow(t('wobble.count'), count, { min: 1, max: 7 }, value => {
        count = value
      }),
    ],
    footer: key({
      icon: 'check',
      label: t('wobble.create'),
      variant: 'primary',
      onPress: () => void create(),
    }),
  })
}

const RANGE_ACTIONS: readonly (readonly [RangeAction, string, MessageKey])[] = [
  ['reverse', 'loop', 'range.reverse'],
  ['pingPong', 'onion', 'range.pingPong'],
  ['repeat', 'pages', 'range.repeat'],
  ['stretch', 'film', 'range.stretch'],
  ['delete', 'trash', 'range.delete'],
]

export function openRangeDialog(editor: Editor): void {
  const total = editor.pageCount

  let first = editor.page.peek() + 1
  let last = total
  let times = 2

  const run = (action: RangeAction): void => {
    const low = Math.min(first, last) - 1
    const high = Math.max(first, last) - 1

    dialog.close()

    if (applyRange(editor, low, high, action, times)) playSfx('page')
    else toast(t('page.full'), { isError: true })
  }

  const dialog = openDialog({
    title: t('range.title'),
    icon: 'pages',
    body: [
      sliderRow(t('range.from'), first, { min: 1, max: total }, value => {
        first = value
      }),
      sliderRow(t('range.to'), last, { min: 1, max: total }, value => {
        last = value
      }),
      sliderRow(t('range.times'), times, { min: 2, max: 8 }, value => {
        times = value
      }),
      h(
        'div',
        { class: 'range-actions' },
        RANGE_ACTIONS.map(([action, iconName, label]) =>
          key({
            icon: iconName,
            label: t(label),
            variant: action === 'delete' ? 'danger' : 'plain',
            onPress: () => run(action),
          }),
        ),
      ),
    ],
  })
}

export function openJumpDialog(editor: Editor): void {
  const input = h('input', {
    class: 'text-input',
    type: 'number',
    min: 1,
    max: editor.pageCount,
    value: editor.page.peek() + 1,
    'data-nav': true,
    'data-autofocus': true,
    'aria-label': t('jump.title'),
    onKeyDown: event => {
      if (event.key === 'Enter') go()
    },
  })

  const go = (): void => {
    const page = Number(input.value)

    dialog.close()

    if (Number.isFinite(page)) void editor.goTo(Math.round(page) - 1)
  }

  const dialog = openDialog({
    title: t('jump.title'),
    icon: 'pages',
    body: input,
    footer: key({
      icon: 'check',
      label: t('jump.go'),
      variant: 'primary',
      onPress: go,
    }),
  })
}
