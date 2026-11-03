import { playSfx, unlockSfx } from './sfx.ts'
import { eventElement, focusedElement, h } from './dom.ts'

export type InputKind = 'touch' | 'pen' | 'mouse' | 'keys' | 'pad'

type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: Readonly<Record<string, Direction>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const CONFIRM_KEYS = new Set(['Enter', ' ', 'z', 'Z'])
const CANCEL_KEYS = new Set(['Escape', 'x', 'X'])
const TEXT_INPUTS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const PAD_DEADZONE = 0.5
const PAD_REPEAT_FIRST_MS = 320
const PAD_REPEAT_MS = 110

const PAD_KEYS: Readonly<Record<number, string>> = {
  0: 'Enter',
  1: 'Escape',
  2: 'x',
  3: 'y',
  4: 'PageUp',
  5: 'PageDown',
  8: 'Select',
  9: 'Start',
  12: 'ArrowUp',
  13: 'ArrowDown',
  14: 'ArrowLeft',
  15: 'ArrowRight',
}

export interface NavScope {
  root: HTMLElement
  onCancel?: () => void
  usesArrows?: boolean
}

class Navigator {
  readonly cursor = h('div', { class: 'cursor', hidden: true })

  private readonly scopes: NavScope[] = []
  private padHeld = new Map<number, number>()
  private padRequest = 0
  private kind: InputKind = detectInitialInput()
  private listeners = new Set<(kind: InputKind) => void>()
  private hasKeyFocus = false

  get inputKind(): InputKind {
    return this.kind
  }

  get isKeyFocus(): boolean {
    return this.hasKeyFocus && !!focusedElement()?.matches('[data-nav]')
  }

  private get usesButtons(): boolean {
    return this.kind === 'keys' || this.kind === 'pad'
  }

  onInputChange(listener: (kind: InputKind) => void): () => void {
    this.listeners.add(listener)

    return () => this.listeners.delete(listener)
  }

  private setKind(kind: InputKind): void {
    if (kind === this.kind) return

    this.kind = kind
    document.documentElement.dataset.input = kind

    for (const listener of this.listeners) listener(kind)
  }

  install(): void {
    document.documentElement.dataset.input = this.kind
    document.body.appendChild(this.cursor)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('pointerdown', this.onPointerDown, true)
    window.addEventListener('focusin', this.onFocus)
    window.addEventListener('resize', this.placeCursor)
    window.addEventListener('scroll', this.placeCursor, true)
    window.addEventListener('animationend', this.placeCursor)
    window.addEventListener('transitionend', this.placeCursor)
    window.addEventListener('gamepadconnected', this.startPad)
    window.addEventListener('click', this.onClick, true)
  }

  push(scope: NavScope): () => void {
    this.scopes.push(scope)

    return () => {
      const index = this.scopes.indexOf(scope)

      if (index >= 0) this.scopes.splice(index, 1)

      this.placeCursor()
    }
  }

  private get scope(): NavScope | undefined {
    return this.scopes[this.scopes.length - 1]
  }

  focusFirst(preferred?: HTMLElement | null): void {
    const target = preferred ?? this.items()[0]

    target?.focus({ preventScroll: true })
    this.hasKeyFocus = this.usesButtons
    this.placeCursor()
  }

  clearFocus(): void {
    focusedElement()?.blur()
    this.hasKeyFocus = false
    this.placeCursor()
  }

  private items(): HTMLElement[] {
    const root = this.scope?.root

    if (!root) return []

    const items = root.querySelectorAll<HTMLElement>('[data-nav]')

    return [...items].filter(isReachable)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.hasKeyFocus = false
    unlockSfx()
    this.setKind(pointerKind(event.pointerType))
    this.placeCursor()
  }

  private readonly onFocus = (): void => {
    this.placeCursor()
  }

  private readonly onClick = (event: MouseEvent): void => {
    const target = eventElement(event)

    if (!target || target.closest('[data-silent]')) return

    if (target.closest('[data-nav]')) playSfx('tap')
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return

    const isPad = event.isTrusted === false

    this.setKind(isPad ? 'pad' : 'keys')
    unlockSfx()

    if (event.ctrlKey || event.metaKey || event.altKey) return

    if (event.key === 'Tab') {
      this.hasKeyFocus = true

      return
    }

    const focused = focusedElement()
    const isTyping = TEXT_INPUTS.has(focused?.tagName ?? '')

    if (event.key === 'Escape' || (!isTyping && CANCEL_KEYS.has(event.key))) {
      const scope = this.scope

      if (scope?.onCancel) {
        event.preventDefault()
        playSfx('back')
        scope.onCancel()
      }

      return
    }

    if (isTyping) return

    const direction = DIRECTIONS[event.key]

    if (direction && this.scope?.usesArrows !== false) {
      event.preventDefault()
      this.move(direction)

      return
    }

    if (CONFIRM_KEYS.has(event.key) && !event.repeat && this.isKeyFocus) {
      if (focused && this.scope?.root.contains(focused)) {
        event.preventDefault()
        focused.click()
      }
    }
  }

  private move(direction: Direction): void {
    const items = this.items()
    const current = focusedElement()

    if (!current || !items.includes(current)) {
      this.focusFirst()

      return
    }

    const next = nearestItem(current, items, direction)

    if (!next) return

    next.focus({ preventScroll: true })
    this.hasKeyFocus = true
    next.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    playSfx('move')
  }

  readonly placeCursor = (): void => {
    const target = focusedElement()
    const isVisible =
      this.usesButtons &&
      this.hasKeyFocus &&
      !!target?.matches('[data-nav]') &&
      !!this.scope?.root.contains(target) &&
      !target.closest('[data-no-cursor]')

    this.cursor.hidden = !isVisible

    if (!isVisible || !target) return

    const box = target.getBoundingClientRect()
    const margin = 4

    this.cursor.style.transform = `translate(${box.left - margin}px, ${box.top - margin}px)`
    this.cursor.style.width = `${box.width + margin * 2}px`
    this.cursor.style.height = `${box.height + margin * 2}px`
  }

  private readonly startPad = (): void => {
    if (!this.padRequest) this.padRequest = requestAnimationFrame(this.pollPad)
  }

  private readonly pollPad = (now: number): void => {
    this.padRequest = requestAnimationFrame(this.pollPad)

    const pad = [...navigator.getGamepads()].find(Boolean)

    if (!pad) return

    const pressed = new Set<number>()

    pad.buttons.forEach((button, index) => {
      if (button.pressed) pressed.add(index)
    })

    const stickX = pad.axes[0] ?? 0
    const stickY = pad.axes[1] ?? 0

    if (stickY < -PAD_DEADZONE) pressed.add(12)
    if (stickY > PAD_DEADZONE) pressed.add(13)
    if (stickX < -PAD_DEADZONE) pressed.add(14)
    if (stickX > PAD_DEADZONE) pressed.add(15)

    for (const button of this.padHeld.keys()) {
      if (!pressed.has(button)) this.padHeld.delete(button)
    }

    for (const button of pressed) {
      const nextAt = this.padHeld.get(button)
      const isDirection = button >= 12

      if (nextAt === undefined) {
        this.padHeld.set(button, now + PAD_REPEAT_FIRST_MS)
        this.pressPad(button)
      } else if (isDirection && now >= nextAt) {
        this.padHeld.set(button, now + PAD_REPEAT_MS)
        this.pressPad(button)
      }
    }
  }

  private pressPad(button: number): void {
    const name = PAD_KEYS[button]

    if (!name) return

    window.dispatchEvent(new KeyboardEvent('keydown', { key: name }))
  }
}

function detectInitialInput(): InputKind {
  return matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'
}

function pointerKind(type: string): InputKind {
  if (type === 'mouse') return 'mouse'

  return type === 'pen' ? 'pen' : 'touch'
}

function isReachable(element: HTMLElement): boolean {
  if (element.matches(':disabled')) return false
  if (element.closest('[inert]')) return false

  const box = element.getBoundingClientRect()

  return box.width > 0 && box.height > 0
}

function nearestItem(
  current: HTMLElement,
  items: HTMLElement[],
  direction: Direction,
): HTMLElement | null {
  const from = current.getBoundingClientRect()
  const fromX = from.left + from.width / 2
  const fromY = from.top + from.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const item of items) {
    if (item === current) continue

    const box = item.getBoundingClientRect()
    const x = box.left + box.width / 2
    const y = box.top + box.height / 2
    const isHorizontal = direction === 'left' || direction === 'right'
    const ahead = {
      up: fromY - y,
      down: y - fromY,
      left: fromX - x,
      right: x - fromX,
    }[direction]

    if (ahead <= 1) continue

    const aside = isHorizontal ? Math.abs(y - fromY) : Math.abs(x - fromX)
    const score = ahead + aside * 3

    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }

  return best
}

export const nav = new Navigator()
