import { t } from '../i18n/index.ts'
import { type Child, focusedElement, h, icon, key } from './dom.ts'
import { nav } from './nav.ts'
import { playSfx } from './sfx.ts'

export interface DialogOptions {
  title: string
  icon?: string
  body: Child
  footer?: Child
  isWide?: boolean
  onClose?: () => void
  isLocked?: boolean
}

export interface DialogHandle {
  element: HTMLElement
  body: HTMLElement
  close(): void
}

const layer = h('div', { class: 'overlay-layer' })
const toastLayer = h('div', { class: 'toast-layer', 'aria-live': 'polite' })

export function installOverlays(): void {
  document.body.append(layer, toastLayer)
}

export function openDialog(options: DialogOptions): DialogHandle {
  const previousFocus = focusedElement()
  const body = h('div', { class: 'dialog-body' }, options.body)
  let removeScope = (): void => {}

  const close = (): void => {
    removeScope()
    backdrop.remove()
    options.onClose?.()
    previousFocus?.focus({ preventScroll: true })
    nav.placeCursor()
  }

  const backdrop = h(
    'div',
    {
      class: 'dialog-backdrop',
      onPointerDown: event => {
        if (event.target === event.currentTarget && !options.isLocked) {
          playSfx('back')
          close()
        }
      },
    },
    h(
      'section',
      {
        class: `dialog ${options.isWide ? 'dialog-wide' : ''}`,
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': options.title,
      },
      h('div', { class: 'dialog-tape' }),
      h(
        'header',
        { class: 'dialog-head' },
        options.icon ? icon(options.icon, 'dialog-icon') : null,
        h('h2', { class: 'dialog-title' }, options.title),
        options.isLocked
          ? null
          : key({
              icon: 'close',
              title: t('common.close'),
              variant: 'ghost',
              onPress: close,
            }),
      ),
      body,
      options.footer
        ? h('footer', { class: 'dialog-foot' }, options.footer)
        : null,
    ),
  )

  layer.appendChild(backdrop)

  removeScope = nav.push({
    root: backdrop,
    onCancel: options.isLocked ? undefined : close,
  })

  requestAnimationFrame(() => {
    const preferred = backdrop.querySelector<HTMLElement>('[data-autofocus]')

    nav.focusFirst(preferred)
  })

  return { element: backdrop, body, close }
}

export interface MenuItem {
  label: string
  icon?: string
  hint?: string
  isDanger?: boolean
  isDisabled?: boolean
  onSelect: () => void
}

export function openMenu(
  anchor: HTMLElement,
  items: readonly (MenuItem | null)[],
): void {
  const previousFocus = focusedElement()
  let removeScope = (): void => {}

  const close = (): void => {
    removeScope()
    backdrop.remove()
    previousFocus?.focus({ preventScroll: true })
    nav.placeCursor()
  }

  const list = h(
    'div',
    { class: 'menu', role: 'menu' },
    items.map(item =>
      item
        ? h(
            'button',
            {
              class: `menu-item ${item.isDanger ? 'is-danger' : ''}`,
              type: 'button',
              role: 'menuitem',
              'data-nav': true,
              disabled: item.isDisabled,
              onClick: () => {
                close()
                item.onSelect()
              },
            },
            item.icon ? icon(item.icon) : h('span', { class: 'icon' }),
            h('span', { class: 'menu-label' }, item.label),
            item.hint ? h('kbd', { class: 'menu-hint' }, item.hint) : null,
          )
        : h('hr', { class: 'menu-line' }),
    ),
  )

  const backdrop = h(
    'div',
    {
      class: 'menu-backdrop',
      onPointerDown: event => {
        if (event.target === event.currentTarget) close()
      },
    },
    list,
  )

  layer.appendChild(backdrop)
  placeMenu(list, anchor)

  removeScope = nav.push({ root: backdrop, onCancel: close })
  requestAnimationFrame(() => nav.focusFirst())
}

function placeMenu(menu: HTMLElement, anchor: HTMLElement): void {
  const margin = 8
  const box = anchor.getBoundingClientRect()
  const width = menu.offsetWidth
  const height = menu.offsetHeight
  const left = Math.min(box.left, innerWidth - width - margin)
  const below = box.bottom + margin
  const top =
    below + height < innerHeight
      ? below
      : Math.max(margin, box.top - height - margin)

  menu.style.left = `${Math.max(margin, left)}px`
  menu.style.top = `${top}px`
}

export interface ToastOptions {
  actionLabel?: string
  onAction?: () => void
  isError?: boolean
}

const TOAST_MS = 2400
const TOAST_ACTION_MS = 6000
const TOAST_LIMIT = 3

export function toast(message: string, options: ToastOptions = {}): void {
  const hasAction = !!options.actionLabel

  const remove = (): void => element.remove()

  const element = h(
    'div',
    {
      class: `toast ${options.isError ? 'is-error' : ''}`,
      role: 'status',
    },
    h('span', { class: 'toast-text' }, message),
    hasAction
      ? h(
          'button',
          {
            class: 'toast-action',
            type: 'button',
            onClick: () => {
              remove()
              options.onAction?.()
            },
          },
          options.actionLabel,
        )
      : null,
  )

  while (toastLayer.children.length >= TOAST_LIMIT) {
    toastLayer.firstElementChild?.remove()
  }

  toastLayer.appendChild(element)
  playSfx(options.isError ? 'error' : 'move')
  setTimeout(remove, hasAction ? TOAST_ACTION_MS : TOAST_MS)
}

export interface ProgressHandle {
  set(ratio: number): void
  close(): void
}

export function openProgress(title: string): ProgressHandle {
  const bar = h('div', { class: 'progress-bar' })

  const dialog = openDialog({
    title,
    isLocked: true,
    body: h('div', { class: 'progress' }, bar),
  })

  return {
    set: ratio => {
      bar.style.width = `${Math.round(ratio * 100)}%`
    },
    close: dialog.close,
  }
}
