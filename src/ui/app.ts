import type { Session } from '../app/session.ts'
import { effect } from '../core/signal.ts'
import { language } from '../i18n/index.ts'
import { fill, h } from './dom.ts'
import { type InputKind, nav } from './nav.ts'

export interface GuideItem {
  button: 'confirm' | 'cancel' | 'shoulder' | 'start'
  label: string
}

export interface TouchGuideItem {
  fingers: number
  label: string
}

export interface Scene {
  element: HTMLElement
  guide?: () => GuideItem[]
  touchGuide?: () => TouchGuideItem[]
  onCancel?: () => void
  usesArrows?: boolean
  initialFocus?: () => HTMLElement | null
  dispose?: () => void
}

export type SceneFactory = () => Scene

const WIPE_MS = 180

const BUTTON_LABELS: Readonly<
  Record<'keys' | 'pad', Record<GuideItem['button'], string>>
> = {
  keys: { confirm: 'Z', cancel: 'X', shoulder: 'Q / W', start: 'Enter' },
  pad: { confirm: 'A', cancel: 'B', shoulder: 'L / R', start: 'START' },
}

export class App {
  readonly session: Session

  private readonly world = h('div', { class: 'world' })
  private readonly stage = h('div', { class: 'scene-host' })
  private readonly guideBar = h('div', {
    class: 'guide',
    'aria-hidden': 'true',
  })
  private readonly wipe = h('div', { class: 'wipe' })
  private scene: Scene | null = null
  private factory: SceneFactory | null = null
  private removeScope = (): void => {}
  private lastLanguage = language.peek()

  constructor(session: Session) {
    this.session = session
  }

  mount(root: HTMLElement): void {
    fill(root, this.world, this.stage, this.guideBar, this.wipe)

    nav.onInputChange(kind => this.renderGuide(kind))

    effect(() => {
      const next = language.value

      if (next !== this.lastLanguage && this.factory) {
        this.lastLanguage = next
        this.mountScene(this.factory)
      }
    })
  }

  async show(factory: SceneFactory): Promise<void> {
    const shouldWipe = this.scene !== null

    if (shouldWipe) {
      this.wipe.classList.add('is-in')
      await delay(WIPE_MS)
    }

    this.mountScene(factory)

    if (shouldWipe) {
      this.wipe.classList.remove('is-in')
    }
  }

  private mountScene(factory: SceneFactory): void {
    this.removeScope()
    this.scene?.dispose?.()

    const scene = factory()

    this.factory = factory
    this.scene = scene

    fill(this.stage, scene.element)

    this.removeScope = nav.push({
      root: scene.element,
      onCancel: scene.onCancel,
      usesArrows: scene.usesArrows,
    })

    this.renderGuide(nav.inputKind)

    requestAnimationFrame(() => {
      nav.focusFirst(scene.initialFocus?.() ?? null)
    })
  }

  refreshGuide(): void {
    this.renderGuide(nav.inputKind)
  }

  private renderGuide(kind: InputKind): void {
    if (kind === 'touch' || kind === 'pen') {
      this.renderTouchGuide()
    } else {
      this.renderButtonGuide(kind === 'pad' ? 'pad' : 'keys')
    }
  }

  private renderButtonGuide(kind: 'keys' | 'pad'): void {
    const items = this.scene?.guide?.() ?? []
    const labels = BUTTON_LABELS[kind]

    this.guideBar.hidden = items.length === 0

    fill(
      this.guideBar,
      items.map(item =>
        h(
          'span',
          { class: 'guide-item' },
          h(
            'kbd',
            { class: `guide-button is-${item.button}` },
            labels[item.button],
          ),
          item.label,
        ),
      ),
    )
  }

  private renderTouchGuide(): void {
    const items = this.scene?.touchGuide?.() ?? []

    this.guideBar.hidden = items.length === 0

    fill(
      this.guideBar,
      items.map(item =>
        h(
          'span',
          { class: 'guide-item' },
          item.fingers > 0
            ? h(
                'span',
                { class: 'guide-fingers', 'aria-hidden': 'true' },
                Array.from({ length: item.fingers }, () =>
                  h('i', { class: 'guide-finger' }),
                ),
              )
            : null,
          item.label,
        ),
      ),
    )
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise(resolve => {
    const input = h('input', { type: 'file', accept })

    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null)
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = h('a', { href: url, download: fileName })

  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
