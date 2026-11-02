import type { InkValue } from '../../app/editor.ts'
import { KNOCKOUT_VALUE } from '../../core/ink.ts'
import { rgbCss } from '../../core/profile.ts'
import type { EdgeSpec, EdgeStyle } from '../../draw/edge.ts'
import { type MessageKey, t } from '../../i18n/index.ts'
import { sliderRow } from '../controls.ts'
import { fill, h } from '../dom.ts'

const EDGE_STYLES: readonly (readonly [EdgeStyle, MessageKey])[] = [
  ['none', 'edge.none'],
  ['outline', 'edge.outline'],
  ['hollow', 'edge.hollow'],
]

const EDGE_MAX = 8

export interface EdgePickerOptions {
  label?: string
  edge: EdgeSpec
  inks: readonly InkValue[]
  ink: number
  paper: string
  onChange: () => void
}

export function edgePicker(options: EdgePickerOptions): HTMLElement {
  const { edge, inks } = options
  const styleRow = h('div', { class: 'chip-row' })
  const swatches = h('div', { class: 'swatches is-free' })
  const colorLabel = h('span', { class: 'field-label' })
  const details = h(
    'div',
    { class: 'edge-options' },
    sliderRow(t('edge.width'), edge.width, { min: 1, max: EDGE_MAX }, value => {
      edge.width = value
      options.onChange()
    }),
    colorLabel,
    swatches,
  )

  const swatch = (value: number, css: string, label: string): HTMLElement =>
    h('button', {
      class: `swatch ${value === KNOCKOUT_VALUE ? 'is-knockout' : ''}`,
      type: 'button',
      'data-nav': true,
      title: label,
      'aria-label': label,
      'aria-pressed': String(value === edge.second),
      style: `--swatch:${css}`,
      onClick: () => {
        edge.second = value
        render()
        options.onChange()
      },
    })

  const pick = (style: EdgeStyle): void => {
    const other = inks.find(ink => ink.value !== options.ink)

    edge.style = style
    edge.second = style === 'outline' && other ? other.value : KNOCKOUT_VALUE
    render()
    options.onChange()
  }

  const render = (): void => {
    fill(
      styleRow,
      EDGE_STYLES.map(([style, label]) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(style === edge.style),
            onClick: () => pick(style),
          },
          t(label),
        ),
      ),
    )
    fill(
      swatches,
      swatch(KNOCKOUT_VALUE, options.paper, t('edge.knockout')),
      inks.map(ink => swatch(ink.value, rgbCss(ink.color), rgbCss(ink.color))),
    )
    fill(colorLabel, t(edge.style === 'hollow' ? 'edge.inner' : 'edge.color'))
    details.hidden = edge.style === 'none'
  }

  render()

  return h(
    'div',
    { class: 'edge-picker' },
    options.label
      ? h(
          'div',
          { class: 'field' },
          h('span', { class: 'field-label' }, options.label),
          styleRow,
        )
      : styleRow,
    details,
  )
}
