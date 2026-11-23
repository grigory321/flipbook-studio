import type { Editor } from '../../app/editor.ts'
import { Compositor } from '../../core/compositor.ts'
import {
  makeMotionPath,
  type MotionEase,
  type MotionPoint,
  pathLength,
} from '../../app/motion.ts'
import {
  applyRange,
  buildMotion,
  insertWobble,
  sourcePlanes,
  wobbleVariants,
  type MotionMode,
  liftLayers,
  type MotionOptions,
  type Mover,
  placeMover,
  type RangeAction,
  type WobbleKind,
} from '../../app/series.ts'
import { t, type MessageKey } from '../../i18n/index.ts'
import { fill, h, key, Scope } from '../dom.ts'
import { openDialog, toast } from '../overlay.ts'
import { playSfx } from '../sfx.ts'
import { showSliderValue, sliderRow, toggleRow } from '../controls.ts'

const SCALE_PERCENT = 100
const ADD_PAGES_MAX = 60
const ADD_PAGES_DEFAULT = 10
const PATH_COUNT_MIN = 2
const PATH_COUNT_MAX = 60
const PATH_SPEED_MAX = 40
const WOBBLE_COUNT_MAX = 24
const WOBBLE_COUNT_DEFAULT = 5

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
  onDone: () => void,
): void {
  const floating = editor.floating.peek()

  if (!floating) return

  const { meta, frames } = editor.note
  const { width, height } = meta
  const scope = new Scope()
  const sprite = floating.bake()
  const main: Mover = {
    layers: editor.selectionLayers(),
    sprite,
    home: sprite.center,
  }
  const options: MotionOptions = {
    path: makeMotionPath(points),
    count: 12,
    ease: 'none',
    follows: false,
    finalScale: 1,
    mode: 'add',
    returns: false,
    allLayers: false,
  }

  const distance = (): number =>
    pathLength(options.path) * (options.returns ? 2 : 1)
  const speedFor = (pages: number): number =>
    Math.max(1, Math.min(PATH_SPEED_MAX, Math.round(distance() / pages)))
  const pagesFor = (dots: number): number =>
    Math.max(
      PATH_COUNT_MIN,
      Math.min(PATH_COUNT_MAX, Math.round(distance() / dots)),
    )

  let speed = speedFor(options.count)

  const summary = h('p', { class: 'dialog-text' })
  const countRow = sliderRow(
    t('path.count'),
    options.count,
    { min: PATH_COUNT_MIN, max: PATH_COUNT_MAX },
    value => {
      speed = speedFor(value)
      showSliderValue(speedRow, speed)
      setCount(value)
    },
  )
  const speedRow = sliderRow(
    t('path.speed'),
    speed,
    { min: 1, max: PATH_SPEED_MAX },
    value => {
      speed = value
      setCount(pagesFor(value))
    },
  )

  const setCount = (value: number): void => {
    options.count = value
    showSliderValue(countRow, value)
    summary.textContent = t('path.summary', {
      n: value,
      s: (value / editor.note.fps).toFixed(1),
    })
  }

  setCount(options.count)

  const compositor = new Compositor(editor.note)
  const image = new ImageData(width, height)
  const whole = { left: 0, top: 0, right: width - 1, bottom: height - 1 }
  const page = editor.page.peek()
  const preview = h('canvas', {
    class: 'motion-preview',
    width,
    height,
    style: `background-color:${editor.paperColor()}`,
  })
  const context = preview.getContext('2d')

  let movers = [main]
  let still: readonly Uint8Array[] = editor.planes
  let step = 0

  const chooseLayers = (isAll: boolean): void => {
    options.allLayers = isAll

    if (!isAll) {
      movers = [main]
      still = editor.planes

      return
    }

    const copies = editor.planes.map(plane => plane.slice())

    movers = [main, ...liftLayers(copies, main.layers, width, height)]
    still = copies
  }

  const showFrame = (): void => {
    if (!context) return

    step = step >= options.count ? 0 : step + 1

    const planes = still.map(plane => plane.slice())

    for (const mover of movers) {
      placeMover(mover, main.home, options, step)
      mover.sprite.stamp(
        mover.layers.map(layer => planes[layer]),
        width,
        height,
      )
    }

    compositor.composeRegion(page, planes, whole)
    image.data.set(new Uint8ClampedArray(compositor.pixels.buffer))
    context.putImageData(image, 0, 0)
  }

  const timer = window.setInterval(showFrame, 1000 / editor.note.fps)

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

  const canChooseLayers =
    frames.layers > 1 && main.layers.length < frames.layers

  const dialog = openDialog({
    title: t('tool.path'),
    icon: 'path',
    isWide: true,
    onClose: () => scope.dispose(),
    body: [
      preview,
      canChooseLayers
        ? chipRow<'one' | 'all'>(
            t('path.layers'),
            [
              ['one', t('path.layersOne')],
              ['all', t('path.layersAll')],
            ],
            'one',
            value => chooseLayers(value === 'all'),
          )
        : null,
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
      speedRow,
      countRow,
      summary,
      toggleRow(t('path.returns'), options.returns, value => {
        options.returns = value
        setCount(pagesFor(speed))
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
  const { meta } = editor.note
  const scope = new Scope()
  const room = Math.min(
    WOBBLE_COUNT_MAX,
    editor.note.profile.maxPages - editor.pageCount,
  )

  if (room < 1) {
    toast(t('page.full'), { isError: true })

    return
  }

  let count = Math.min(WOBBLE_COUNT_DEFAULT, room)
  let strength = 1
  let kind: WobbleKind = 'line'

  const planes = sourcePlanes(editor)
  const compositor = new Compositor(editor.note)
  const whole = {
    left: 0,
    top: 0,
    right: meta.width - 1,
    bottom: meta.height - 1,
  }
  const preview = h('canvas', {
    class: 'motion-preview',
    width: meta.width,
    height: meta.height,
    style: `background-color:${editor.paperColor()}`,
  })
  const context = preview.getContext('2d')
  const page = editor.page.peek()

  let pictures: ImageData[] = []
  let step = 0

  const makePictures = (): void => {
    pictures = wobbleVariants(editor, planes, kind, strength).map(variant => {
      compositor.composeRegion(
        page,
        variant.map(plane => plane ?? new Uint8Array(meta.width * meta.height)),
        whole,
      )

      return new ImageData(
        new Uint8ClampedArray(compositor.pixels.slice().buffer),
        meta.width,
        meta.height,
      )
    })
  }

  const showFrame = (): void => {
    if (!context || pictures.length === 0) return

    context.putImageData(pictures[step % pictures.length], 0, 0)
    step++
  }

  makePictures()
  showFrame()

  const timer = window.setInterval(showFrame, 1000 / editor.note.fps)

  scope.add(() => clearInterval(timer))

  const create = (): void => {
    dialog.close()

    if (insertWobble(editor, { count, strength, kind })) playSfx('page')
    else toast(t('page.full'), { isError: true })
  }

  const dialog = openDialog({
    title: t('wobble.title'),
    icon: 'wobble',
    isWide: true,
    onClose: () => scope.dispose(),
    body: [
      preview,
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
          makePictures()
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
          makePictures()
        },
      ),
      sliderRow(t('wobble.count'), count, { min: 1, max: room }, value => {
        count = value
      }),
    ],
    footer: key({
      icon: 'check',
      label: t('wobble.create'),
      variant: 'primary',
      onPress: create,
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
