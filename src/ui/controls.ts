import type { Signal } from '../core/signal.ts'
import { h } from './dom.ts'

export function toggleRow(
  label: string,
  value: boolean,
  onChange: (next: boolean) => void,
): HTMLElement {
  const button = h(
    'button',
    {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'data-nav': true,
      'aria-checked': String(value),
      'aria-label': label,
      onClick: () => {
        const next = button.getAttribute('aria-checked') !== 'true'

        button.setAttribute('aria-checked', String(next))
        onChange(next)
      },
    },
    h('span', { class: 'switch-knob' }),
  )

  return h('div', { class: 'toggle-row' }, h('span', null, label), button)
}

export interface SliderRange {
  min: number
  max: number
  step?: number
  format?: (value: number) => string
}

export function sliderRow(
  label: string,
  value: number,
  range: SliderRange,
  onInput: (next: number) => void,
): HTMLElement {
  const format = range.format ?? String
  const output = h('output', { class: 'slider-value' }, format(value))
  const input: HTMLInputElement = h('input', {
    class: 'slider',
    type: 'range',
    min: range.min,
    max: range.max,
    step: range.step,
    value,
    'data-nav': true,
    onInput: () => {
      const next = Number(input.value)

      output.textContent = format(next)
      onInput(next)
    },
  })

  return h(
    'label',
    { class: 'slider-row' },
    h('span', { class: 'slider-label' }, label),
    input,
    output,
  )
}

export function settingSlider(
  label: string,
  signal: Signal<number>,
  range: SliderRange,
): HTMLElement {
  return sliderRow(label, signal.peek(), range, value => {
    signal.value = value
  })
}

export function settingToggle(
  label: string,
  signal: Signal<boolean>,
): HTMLElement {
  return toggleRow(label, signal.peek(), value => {
    signal.value = value
  })
}
