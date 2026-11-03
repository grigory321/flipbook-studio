import { effect } from '../core/signal.ts'
import { iconPath } from './icons.ts'

export type Child =
  Node | string | number | null | undefined | false | readonly Child[]

type AttributeValue = string | number | boolean | null | undefined

type EventProps = {
  onClick?: (event: MouseEvent) => void
  onInput?: (event: Event) => void
  onChange?: (event: Event) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onFocus?: (event: FocusEvent) => void
  onToggle?: (event: Event) => void
  onPointerDown?: (event: PointerEvent) => void
  onPointerEnter?: (event: PointerEvent) => void
  onPointerUp?: (event: PointerEvent) => void
}

type AttributeProps = {
  [name: `data-${string}`]: AttributeValue
  [name: `aria-${string}`]: AttributeValue
  class?: string
  style?: string
  id?: string
  type?: string
  role?: string
  title?: string
  name?: string
  lang?: string
  href?: string
  download?: string
  rows?: number
  value?: string | number
  min?: number
  max?: number
  step?: number
  maxlength?: number
  placeholder?: string
  accept?: string
  for?: string
  open?: boolean
  hidden?: boolean
  disabled?: boolean
  tabindex?: number
  inert?: boolean
  draggable?: string
  spellcheck?: string
  autocomplete?: string
  width?: number
  height?: number
}

export type Props = AttributeProps & EventProps

function append(parent: Node, child: Child): void {
  if (child === null || child === undefined || child === false) return

  if (child instanceof Node) {
    parent.appendChild(child)
  } else if (typeof child === 'string' || typeof child === 'number') {
    parent.appendChild(document.createTextNode(String(child)))
  } else {
    for (const item of child) append(parent, item)
  }
}

function listen<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: ((event: HTMLElementEventMap[K]) => void) | undefined,
): void {
  if (listener) element.addEventListener(type, listener)
}

function listenAll(element: HTMLElement, props: EventProps): void {
  listen(element, 'click', props.onClick)
  listen(element, 'input', props.onInput)
  listen(element, 'change', props.onChange)
  listen(element, 'keydown', props.onKeyDown)
  listen(element, 'focus', props.onFocus)
  listen(element, 'toggle', props.onToggle)
  listen(element, 'pointerdown', props.onPointerDown)
  listen(element, 'pointerenter', props.onPointerEnter)
  listen(element, 'pointerup', props.onPointerUp)
}

function setAttribute(
  element: HTMLElement,
  name: string,
  value: AttributeValue,
): void {
  if (value === true) element.setAttribute(name, '')
  else if (value !== false && value !== null && value !== undefined) {
    element.setAttribute(name, String(value))
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)

  if (props) {
    listenAll(element, props)

    for (const [name, value] of Object.entries(props)) {
      if (typeof value !== 'function') setAttribute(element, name, value)
    }
  }

  append(element, children)

  return element
}

export function eventElement(event: Event): Element | null {
  return event.target instanceof Element ? event.target : null
}

export function focusedElement(): HTMLElement | null {
  const active = document.activeElement

  return active instanceof HTMLElement ? active : null
}

export function fill(element: Element, ...children: Child[]): void {
  element.replaceChildren()
  append(element, children)
}

export const SVG_NS = 'http://www.w3.org/2000/svg'

export function icon(name: string, className = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  const path = document.createElementNS(SVG_NS, 'path')
  const data = iconPath(name)

  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute(
    'class',
    `icon ${data.isFilled ? 'icon-fill' : ''} ${className}`,
  )
  svg.setAttribute('aria-hidden', 'true')
  path.setAttribute('d', data.d)
  svg.appendChild(path)

  return svg
}

export class Scope {
  private readonly cleanups: (() => void)[] = []

  effect(body: () => void | (() => void)): void {
    this.cleanups.push(effect(body))
  }

  add(cleanup: () => void): void {
    this.cleanups.push(cleanup)
  }

  listen<K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options)
    this.add(() => target.removeEventListener(type, listener, options))
  }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup()
  }
}

export type KeyVariant = 'plain' | 'primary' | 'soft' | 'danger' | 'ghost'

export interface KeyOptions {
  icon?: string
  label?: string
  variant?: KeyVariant
  title?: string
  class?: string
  onPress?: (button: HTMLButtonElement) => void
  isDisabled?: boolean
}

export function key(options: KeyOptions): HTMLButtonElement {
  const variant = options.variant ?? 'plain'
  const classes = ['key', `key-${variant}`, options.class ?? '']

  if (!options.label) classes.push('key-icon')

  const button: HTMLButtonElement = h(
    'button',
    {
      class: classes.join(' '),
      type: 'button',
      'data-nav': true,
      title: options.title,
      'aria-label': options.title ?? options.label,
      disabled: options.isDisabled,
      onClick: () => options.onPress?.(button),
    },
    options.icon ? icon(options.icon) : null,
    options.label ? h('span', { class: 'key-label' }, options.label) : null,
  )

  return button
}

export function setPressed(button: HTMLElement, isPressed: boolean): void {
  button.setAttribute('aria-pressed', String(isPressed))
  button.classList.toggle('is-on', isPressed)
}
