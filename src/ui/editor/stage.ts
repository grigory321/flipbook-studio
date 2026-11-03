import type { Editor } from '../../app/editor.ts'
import { settings } from '../../app/settings.ts'
import type { Floating, FloatPoint } from '../../app/floating.ts'
import {
  addPatternFromFloating,
  addShapeFromFloating,
} from '../../app/my-library.ts'
import type { Tool, ToolPoint } from '../../app/tools.ts'
import { Compositor, type Region } from '../../core/compositor.ts'
import { Signal } from '../../core/signal.ts'
import { t } from '../../i18n/index.ts'
import { eventElement, h, key, Scope, setPressed, SVG_NS } from '../dom.ts'
import { openMenu, toast } from '../overlay.ts'
import {
  playSfx,
  type ScribbleKind,
  startScribble,
  stopScribble,
  updateScribble,
} from '../sfx.ts'
import { FloatPainter } from './float-paint.ts'
import { type CurlDirection, PageCurl } from './page-curl.ts'

const ZOOM_MIN = 0.25
const ZOOM_MAX = 16
const TAP_MS = 330
const TAP_MOVE = 10
const ONION_BEFORE = 0x3e8be8
const ONION_AFTER = 0xa87fff
const ONION_ALPHA = 0x80
const FIT_MARGIN = 28
const BINDING_ROOM = 8
const STACK_SHOWN = 20
const PAN_KEEP = 56
const FLIP_MIN_INTERVAL_MS = 90
const SCRIBBLE_FULL_SPEED = 1.6
const SCRIBBLE_DECAY = 0.75
const GRAIN_SIZE = 96
const FRAME_DOTS = 9
const FRAME_STEM = 26
const POINTER_REACH = 12
const TOUCH_REACH = 22

const STABILIZER_MS = 3

function followShare(strength: number, elapsed: number): number {
  if (strength <= 0) return 1

  return 1 - Math.exp(-Math.max(0, elapsed) / (strength * STABILIZER_MS))
}

function drawTint(
  source: Uint32Array,
  target: Uint32Array,
  tint: number,
): void {
  for (let index = 0; index < source.length; index++) {
    if (source[index] && !target[index]) target[index] = tint
  }
}

interface ActivePointer {
  x: number
  y: number
  startX: number
  startY: number
}

interface OnionBuffers {
  compositor: Compositor
  pixels: Uint32Array<ArrayBuffer>
  image: ImageData
}

interface OnionStamp {
  page: number
  tint: number
}

export class Stage {
  readonly element = h('div', { class: 'stage' })
  readonly zoom = new Signal(1)
  readonly isFitted = new Signal(true)
  readonly isHand = new Signal(false)

  private readonly editor: Editor
  private readonly scope = new Scope()
  private readonly page = h('div', { class: 'page' })
  private readonly holder = h('div', { class: 'page-holder' })
  private readonly inkCanvas = h('canvas', { class: 'page-layer' })
  private readonly onionCanvas = h('canvas', { class: 'page-layer page-onion' })
  private readonly floatCanvas = h('canvas', { class: 'page-layer page-float' })
  private readonly underCanvas = h('canvas', {
    class: 'page-under',
    hidden: true,
  })
  private readonly pageNumber = h('span', { class: 'page-number' })
  private readonly dotGrid = h('div', { class: 'page-grid', hidden: true })
  private readonly sheets = h('div', { class: 'page-sheets' })
  private readonly cursor = h('div', { class: 'brush-cursor', hidden: true })
  private readonly frame = document.createElementNS(SVG_NS, 'svg')
  private readonly frameLine = document.createElementNS(SVG_NS, 'polygon')
  private readonly frameStem = document.createElementNS(SVG_NS, 'line')
  private readonly frameDots: SVGCircleElement[] = []
  private readonly painter: FloatPainter
  private readonly context: CanvasRenderingContext2D
  private readonly onionContext: CanvasRenderingContext2D
  private readonly floatContext: CanvasRenderingContext2D
  private readonly underContext: CanvasRenderingContext2D
  private readonly image: ImageData
  private readonly curl: PageCurl

  private readonly toolFor: () => Tool | undefined
  private readonly onUndo: () => void
  private readonly onRedo: () => void
  private readonly onPath: () => void

  private panX = 0
  private panY = 0
  private frameRequest = 0
  private activeTool: Tool | null = null
  private drawingPointer = -1
  private hasPen = false
  private isSpaceHeld = false
  private pointers = new Map<number, ActivePointer>()
  private gestureStart = { distance: 0, zoom: 1, panX: 0, panY: 0, x: 0, y: 0 }
  private gestureTime = 0
  private maxFingers = 0
  private movedFar = false
  private smoothX = 0
  private smoothTime = 0
  private smoothY = 0
  private shownPage = -1
  private lastFlip = 0
  private onionToken = 0
  private onion: OnionBuffers | null = null
  private onionWanted = ''
  private scribbleSpeed = 0
  private lastMoveX = 0
  private lastMoveY = 0
  private lastMoveTime = 0

  constructor(
    editor: Editor,
    toolFor: () => Tool | undefined,
    actions: { undo: () => void; redo: () => void; path: () => void },
  ) {
    this.editor = editor
    this.toolFor = toolFor
    this.onUndo = actions.undo
    this.onRedo = actions.redo
    this.onPath = actions.path
    this.painter = new FloatPainter(editor)

    const { width, height } = editor.note.meta

    for (const canvas of [this.inkCanvas, this.floatCanvas, this.underCanvas]) {
      canvas.width = width
      canvas.height = height
    }

    this.onionCanvas.width = 0
    this.onionCanvas.height = 0

    this.context = this.contextOf(this.inkCanvas)
    this.onionContext = this.contextOf(this.onionCanvas)
    this.floatContext = this.contextOf(this.floatCanvas)
    this.underContext = this.contextOf(this.underCanvas)
    this.image = new ImageData(
      new Uint8ClampedArray(editor.compositor.pixels.buffer),
      width,
      height,
    )
    this.curl = new PageCurl(width, height)

    this.page.append(
      this.onionCanvas,
      this.inkCanvas,
      this.floatCanvas,
      this.dotGrid,
      this.pageNumber,
    )

    const holder = this.holder

    holder.append(this.sheets, this.underCanvas, this.page, this.curl.element)
    holder.dataset.kind = editor.note.profile.id
    holder.style.setProperty('--page-width', `${width}px`)
    holder.style.setProperty('--page-height', `${height}px`)
    holder.style.setProperty('--grain', paperGrain())

    this.buildFrame()

    this.element.append(
      holder,
      this.frame,
      this.cursor,
      this.viewReset(),
      this.zoomChip(),
      this.floatingBar(),
    )

    this.bindInput()
    this.bindState()
  }

  private buildFrame(): void {
    this.frame.setAttribute('class', 'float-frame')
    this.frame.style.display = 'none'
    this.frameLine.setAttribute('class', 'frame-line')
    this.frameStem.setAttribute('class', 'frame-stem')
    this.frame.append(this.frameLine, this.frameStem)

    for (let index = 0; index < FRAME_DOTS; index++) {
      const dot = document.createElementNS(SVG_NS, 'circle')

      dot.setAttribute('class', 'frame-dot')
      dot.setAttribute('r', '7')
      this.frameDots.push(dot)
      this.frame.appendChild(dot)
    }
  }

  private contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    const context = canvas.getContext('2d', { alpha: true })

    if (!context) throw new Error('canvas を使えません')

    return context
  }

  get pictureCanvas(): HTMLCanvasElement {
    return this.inkCanvas
  }

  addOverlay(element: HTMLElement): void {
    this.element.appendChild(element)
  }

  private viewReset(): HTMLElement {
    const button = key({
      icon: 'home',
      label: t('stage.reset'),
      class: 'view-reset',
      onPress: () => this.fit(),
    })

    this.scope.effect(() => {
      button.hidden = this.isFitted.value
    })

    return button
  }

  private zoomChip(): HTMLElement {
    const hand = key({
      icon: 'hand',
      title: t('stage.hand'),
      variant: 'ghost',
      onPress: () => {
        this.isHand.value = !this.isHand.peek()
      },
    })

    this.scope.effect(() => {
      setPressed(hand, this.isHand.value)
      this.element.classList.toggle('is-hand', this.isHand.value)
    })

    const label = h('button', {
      class: 'zoom-label',
      type: 'button',
      'data-nav': true,
      title: t('stage.fit'),
      onClick: () => this.fit(),
    })

    this.scope.effect(() => {
      label.textContent = `${Math.round(this.zoom.value * 100)}%`
    })

    return h(
      'div',
      { class: 'zoom-chip' },
      hand,
      key({
        icon: 'minus',
        title: t('stage.zoomOut'),
        variant: 'ghost',
        onPress: () => this.zoomBy(0.8),
      }),
      label,
      key({
        icon: 'plus',
        title: t('stage.zoomIn'),
        variant: 'ghost',
        onPress: () => this.zoomBy(1.25),
      }),
    )
  }

  private floatingBar(): HTMLElement {
    const editor = this.editor

    const act = (run: (floating: Floating) => void) => (): void => {
      const floating = editor.floating.peek()

      if (!floating) return

      run(floating)
      editor.touchFloating()
    }

    const openMore = (anchor: HTMLElement): void => {
      const isFree = editor.floating.peek()?.isFreeCorners

      openMenu(anchor, [
        {
          label: t('select.flipH'),
          icon: 'flipH',
          onSelect: act(floating => floating.flipHorizontal()),
        },
        {
          label: t('select.flipV'),
          icon: 'flipV',
          onSelect: act(floating => floating.flipVertical()),
        },
        {
          label: t('select.rotate'),
          icon: 'rotate',
          onSelect: act(floating => floating.rotateBy(Math.PI / 2)),
        },
        {
          label: t('select.corners'),
          icon: isFree ? 'check' : 'corners',
          onSelect: act(floating => floating.setFreeCorners(!isFree)),
        },
        null,
        {
          label: t('tool.path'),
          icon: 'path',
          onSelect: this.onPath,
        },
        {
          label: t('select.toShape'),
          icon: 'shape',
          onSelect: act(floating => {
            const id = addShapeFromFloating(floating)

            if (id) editor.shape.value = id

            toast(t(id ? 'shape.registered' : 'select.tooSmall'))
          }),
        },
        {
          label: t('select.toPattern'),
          icon: 'pattern',
          onSelect: act(floating => {
            const id = addPatternFromFloating(floating)

            if (id) editor.patternId.value = id

            toast(t(id ? 'pattern.registered' : 'select.tooSmall'))
          }),
        },
      ])
    }

    const resetButton = key({
      icon: 'home',
      label: t('select.reset'),
      class: 'float-reset',
      onPress: act(floating => floating.reset()),
    })

    const textButton = key({
      icon: 'text',
      title: t('select.retouch'),
      onPress: act(floating => floating.retouch?.()),
    })

    const bar = h(
      'div',
      { class: 'float-bar', hidden: true },
      resetButton,
      textButton,
      key({
        icon: 'copy',
        title: t('select.copy'),
        onPress: () => {
          editor.copyFloating()
          toast(t('select.copied'))
        },
      }),
      key({
        icon: 'stamp',
        title: t('select.stamp'),
        onPress: () => {
          editor.stampFloating()
          playSfx('tap')
        },
      }),
      key({
        icon: 'trash',
        title: t('select.delete'),
        onPress: () => editor.deleteFloating(),
      }),
      key({
        icon: 'more',
        title: t('common.more'),
        onPress: openMore,
      }),
      key({
        icon: 'close',
        title: t('select.cancel'),
        onPress: () => editor.discardFloating(),
      }),
      key({
        icon: 'check',
        label: t('select.done'),
        variant: 'primary',
        class: 'float-done',
        onPress: () => editor.dropFloating(),
      }),
    )

    this.scope.effect(() => {
      editor.floatingVersion.value

      const floating = editor.floating.value

      bar.hidden = floating === null
      resetButton.disabled = floating?.isAtHome ?? true
      textButton.hidden = !floating?.retouch
    })

    return bar
  }

  private bindState(): void {
    const editor = this.editor

    this.scope.effect(() => {
      const page = editor.page.value

      editor.pictureVersion.value

      const flip = this.prepareFlip(page)

      this.renderFull()
      if (flip !== 'forward') this.showSpread(page)
      if (flip) this.playFlip(flip)
    })

    this.scope.effect(() => {
      editor.settingsVersion.value
      editor.pagesVersion.value
      this.showPaperStyle()
    })

    this.scope.effect(() => {
      const isDot = editor.toolId.value === 'dot'
      const size = editor.dotSize.value
      const isVisible =
        isDot && editor.showsDotGrid.value && size * this.zoom.value >= 4

      this.element.classList.toggle('is-dot', isDot)
      this.dotGrid.hidden = !isVisible
      this.dotGrid.style.setProperty('--cell', `${size}px`)
    })

    this.scope.effect(() => {
      this.element.classList.toggle(
        'is-plain',
        settings.paperLook.value === 'plain',
      )
    })

    this.scope.effect(() => {
      const isSmooth = settings.smoothLines.value

      this.element.classList.toggle(
        'is-smooth',
        isSmooth && editor.note.profile.id === 'free',
      )
    })

    this.scope.effect(() => {
      editor.onion.value
      editor.page.value
      editor.isPlaying.value
      editor.pagesVersion.value
      editor.settingsVersion.value
      settings.onionBefore.value
      settings.onionAfter.value
      this.renderOnion()
    })

    this.scope.effect(() => {
      editor.floatingVersion.value
      editor.floating.value
      editor.toolId.value
      this.renderFloating()
    })

    const observer = new ResizeObserver(() => {
      if (this.isFitted.peek()) this.fit()
      else this.applyTransform()
    })

    observer.observe(this.element)
    this.scope.add(() => observer.disconnect())
    this.scope.add(() => cancelAnimationFrame(this.frameRequest))
  }

  private showPaperStyle(): void {
    const { meta } = this.editor.note

    this.page.dataset.paper = meta.paperStyle
    this.underCanvas.dataset.paper = meta.paperStyle
    this.showSpread(this.editor.page.peek())
  }

  private showSpread(page: number): void {
    const after = Math.min(STACK_SHOWN, this.editor.pageCount - page - 1)

    this.holder.style.setProperty('--after', String(after))
  }

  private prepareFlip(page: number): CurlDirection | null {
    const from = this.shownPage
    const now = performance.now()
    const isFast = now - this.lastFlip < FLIP_MIN_INTERVAL_MS

    this.shownPage = page

    if (from < 0 || from === page || this.editor.isPlaying.peek()) return null

    this.lastFlip = now
    this.curl.cancel()

    if (isFast || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return null
    }

    const color = this.page.style.backgroundColor
    const style = this.editor.note.meta.paperStyle

    if (page > from) {
      this.curl.paint(this.inkCanvas, color, style)

      return 'forward'
    }

    const { width, height } = this.editor.note.meta

    this.underContext.clearRect(0, 0, width, height)
    this.underContext.drawImage(this.inkCanvas, 0, 0)
    this.underCanvas.style.backgroundColor = color
    this.underCanvas.hidden = false

    return 'back'
  }

  private playFlip(direction: CurlDirection): void {
    const style = this.editor.note.meta.paperStyle

    if (direction === 'back') {
      this.curl.paint(this.inkCanvas, this.page.style.backgroundColor, style)
      this.page.style.visibility = 'hidden'
    }

    this.curl.play(direction, () => {
      this.page.style.visibility = ''
      this.underCanvas.hidden = true

      if (direction === 'forward') this.showSpread(this.editor.page.peek())
    })
  }

  private renderFull(): void {
    const editor = this.editor
    const { width, height } = editor.note.meta
    const page = editor.page.peek()

    if (editor.isPlaying.peek()) return

    if (!editor.isEditing && editor.isPageReady) {
      this.present(editor.compositor.composePage(page, editor.planes), page)

      return
    }

    editor.compositor.composeRegion(page, editor.planes, {
      left: 0,
      top: 0,
      right: width - 1,
      bottom: height - 1,
    })

    this.context.putImageData(this.image, 0, 0)
    this.showPaper(page)
  }

  present(region: Region | null, page: number): void {
    if (region) {
      this.context.putImageData(
        this.image,
        0,
        0,
        region.left,
        region.top,
        region.right - region.left + 1,
        region.bottom - region.top + 1,
      )
    }

    this.showPaper(page)
  }

  private showPaper(page: number): void {
    const color = this.editor.paperColor(page)

    this.pageNumber.textContent = String(page + 1)

    if (this.page.style.backgroundColor !== color) {
      this.page.style.backgroundColor = color
    }
  }

  private renderOnion(): void {
    const editor = this.editor
    const isOn = editor.onion.peek()
    const isShown = isOn && !editor.isPlaying.peek()

    this.onionCanvas.hidden = !isShown

    if (!isOn) this.releaseOnion()
    if (!isShown) return

    const stamps = this.onionStamps(editor.page.peek())
    const signature = this.onionSignature(stamps)

    if (signature === this.onionWanted) return

    this.onionWanted = signature
    void this.stampOnion(stamps)
  }

  private onionStamps(page: number): OnionStamp[] {
    const before = settings.onionBefore.peek()
    const after = settings.onionAfter.peek()
    const reach = Math.max(before, after)
    const count = this.editor.pageCount
    const stamps: OnionStamp[] = []

    for (let step = 1; step <= reach; step++) {
      const alpha = Math.round((ONION_ALPHA * (reach - step + 1)) / reach)

      if (step <= before && page - step >= 0) {
        stamps.push({
          page: page - step,
          tint: ((alpha << 24) | ONION_BEFORE) >>> 0,
        })
      }

      if (step <= after && page + step < count) {
        stamps.push({
          page: page + step,
          tint: ((alpha << 24) | ONION_AFTER) >>> 0,
        })
      }
    }

    return stamps
  }

  private onionSignature(stamps: readonly OnionStamp[]): string {
    const { frames, meta } = this.editor.note
    const visible = meta.layers.map(layer => +layer.visible).join('')
    const rows = stamps.map(
      ({ page, tint }) => `${tint}:${frames.copyRows(page, 1).join(',')}`,
    )

    return `${visible}|${rows.join('|')}`
  }

  private async stampOnion(stamps: readonly OnionStamp[]): Promise<void> {
    const token = ++this.onionToken
    const onion = this.onionBuffers()

    onion.pixels.fill(0)

    try {
      for (const { page, tint } of stamps) {
        await this.editor.note.ensurePages(page, 1)

        if (token !== this.onionToken) return

        onion.compositor.composePage(page)
        drawTint(onion.compositor.pixels, onion.pixels, tint)
      }
    } catch (error) {
      onion.compositor.invalidate()

      if (token === this.onionToken) this.onionWanted = ''

      throw error
    }

    this.onionContext.putImageData(onion.image, 0, 0)
  }

  private onionBuffers(): OnionBuffers {
    if (this.onion) return this.onion

    const { width, height } = this.editor.note.meta
    const pixels = new Uint32Array(width * height)

    this.onionCanvas.width = width
    this.onionCanvas.height = height
    this.onion = {
      compositor: new Compositor(this.editor.note),
      pixels,
      image: new ImageData(new Uint8ClampedArray(pixels.buffer), width, height),
    }

    return this.onion
  }

  private releaseOnion(): void {
    if (!this.onion) return

    this.onion = null
    this.onionWanted = ''
    this.onionToken++
    this.onionCanvas.width = 0
    this.onionCanvas.height = 0
  }

  private renderFloating(): void {
    const editor = this.editor
    const floating = editor.floating.peek()
    const { width, height } = editor.note.meta
    const context = this.floatContext

    context.clearRect(0, 0, width, height)

    if (floating) this.painter.paint(context, floating)

    const tool = this.toolFor()
    const path = tool?.currentPath

    if (path && path.length > 1) this.drawSelectionPath(tool, path)

    this.renderFrame()
  }

  private drawSelectionPath(tool: Tool, path: readonly FloatPoint[]): void {
    const context = this.floatContext
    const mode = this.editor.selectMode.peek()
    const isTraced =
      tool.id === 'path' || tool.id === 'shape' || mode === 'lasso'
    const [startX, startY] = path[0]
    const [endX, endY] = path[path.length - 1]

    if (tool.id === 'select' && mode === 'wand') return

    context.strokeStyle = '#ff7a00'
    context.lineWidth = 1
    context.setLineDash(tool.id === 'select' ? [4, 3] : [])
    context.beginPath()

    if (isTraced) {
      context.moveTo(startX, startY)

      for (const [x, y] of path) context.lineTo(x, y)
    } else {
      context.rect(startX, startY, endX - startX, endY - startY)
    }

    context.stroke()
    context.setLineDash([])
  }

  private renderFrame(): void {
    const floating = this.editor.floating.peek()
    const toolId = this.toolFor()?.id
    const isShown =
      floating &&
      (toolId === 'select' || toolId === 'move' || toolId === 'shape')

    this.frame.style.display = isShown ? '' : 'none'

    if (!isShown) return

    const box = this.element.getBoundingClientRect()
    const page = this.inkCanvas.getBoundingClientRect()
    const { width } = this.editor.note.meta
    const scale = page.width / width
    const toScreenX = (x: number): number => page.left - box.left + x * scale
    const toScreenY = (y: number): number => page.top - box.top + y * scale
    const zoom = this.zoom.peek()
    const handles = floating.handles(FRAME_STEM / zoom)
    const corners = floating.corners()
    const [topHandle] = handles.filter(([name]) => name === 'n')
    const rotate = handles.find(([name]) => name === 'rotate')

    this.frameLine.setAttribute(
      'points',
      corners.map(([x, y]) => `${toScreenX(x)},${toScreenY(y)}`).join(' '),
    )

    if (rotate && topHandle) {
      this.frameStem.setAttribute('x1', String(toScreenX(topHandle[1])))
      this.frameStem.setAttribute('y1', String(toScreenY(topHandle[2])))
      this.frameStem.setAttribute('x2', String(toScreenX(rotate[1])))
      this.frameStem.setAttribute('y2', String(toScreenY(rotate[2])))
    }

    this.frameStem.style.display = rotate ? '' : 'none'

    this.frameDots.forEach((dot, index) => {
      const handle = handles[index]

      dot.style.display = handle ? '' : 'none'

      if (!handle) return

      dot.setAttribute('cx', String(toScreenX(handle[1])))
      dot.setAttribute('cy', String(toScreenY(handle[2])))
      dot.classList.toggle('is-rotate', handle[0] === 'rotate')
    })
  }

  fit(): void {
    const box = this.element.getBoundingClientRect()
    const { width, height } = this.editor.note.meta

    if (box.width <= 0 || box.height <= 0) return

    const side =
      Number.parseFloat(
        getComputedStyle(this.element).getPropertyValue('--fit-side'),
      ) || 0
    const margin = box.width < 480 ? 12 : FIT_MARGIN
    const scale = Math.min(
      (box.width - (margin + side) * 2) / width,
      (box.height - (margin + BINDING_ROOM) * 2) / height,
    )

    const snapped = scale >= 1 ? Math.floor(scale * 4) / 4 : scale

    this.zoom.value = Math.max(ZOOM_MIN, snapped)
    this.panX = 0
    this.panY = 0
    this.isFitted.value = true
    this.applyTransform()
  }

  private clampPan(): void {
    const box = this.element.getBoundingClientRect()
    const { width, height } = this.editor.note.meta
    const zoom = this.zoom.peek()
    const limitX = (box.width + width * zoom) / 2 - PAN_KEEP
    const limitY = (box.height + height * zoom) / 2 - PAN_KEEP

    this.panX = Math.max(-limitX, Math.min(limitX, this.panX))
    this.panY = Math.max(-limitY, Math.min(limitY, this.panY))
  }

  private applyTransform(): void {
    this.clampPan()

    const zoom = this.zoom.peek()
    const { width, height } = this.editor.note.meta
    const holder = this.holder

    holder.style.width = `${width}px`
    holder.style.height = `${height}px`
    holder.style.transform = `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px)) scale(${zoom})`
    holder.style.setProperty('--zoom', String(zoom))
    this.renderFrame()
  }

  private zoomBy(factor: number): void {
    this.setZoom(this.zoom.peek() * factor)
  }

  private setZoom(zoom: number): void {
    this.zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
    this.isFitted.value = false
    this.applyTransform()
  }

  private toPage(event: PointerEvent): { x: number; y: number } {
    const box = this.inkCanvas.getBoundingClientRect()
    const { width, height } = this.editor.note.meta

    return {
      x: ((event.clientX - box.left) / box.width) * width,
      y: ((event.clientY - box.top) / box.height) * height,
    }
  }

  private toolPoint(event: PointerEvent, x: number, y: number): ToolPoint {
    return {
      x: Math.floor(x),
      y: Math.floor(y),
      exactX: x,
      exactY: y,
      pressure: event.pointerType === 'pen' ? event.pressure : 0.5,
      isConstrained: event.shiftKey,
      time: performance.now(),
      reach:
        (event.pointerType === 'touch' ? TOUCH_REACH : POINTER_REACH) /
        this.zoom.peek(),
      stem: FRAME_STEM / this.zoom.peek(),
    }
  }

  private bindInput(): void {
    const target = this.element

    target.addEventListener('pointerdown', this.onDown)
    target.addEventListener('pointermove', this.onMove)
    target.addEventListener('pointerup', this.onUp)
    target.addEventListener('pointercancel', this.onCancel)
    target.addEventListener('lostpointercapture', this.onCancel)
    target.addEventListener('pointerleave', () => {
      this.cursor.hidden = true
    })
    target.addEventListener('wheel', this.onWheel, { passive: false })
    target.addEventListener('contextmenu', event => event.preventDefault())

    this.scope.listen(window, 'keydown', event => {
      if (event.key === ' ' && !isTyping(event)) this.isSpaceHeld = true
    })

    this.scope.listen(window, 'keyup', event => {
      if (event.key === ' ') this.isSpaceHeld = false
    })
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (eventElement(event)?.closest('button')) return

    event.preventDefault()
    this.element.setPointerCapture(event.pointerId)
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    })

    if (event.pointerType === 'pen') this.hasPen = true

    const isFinger = event.pointerType === 'touch'
    const shouldPan =
      this.isSpaceHeld ||
      this.isHand.peek() ||
      event.button === 1 ||
      (isFinger && this.hasPen)

    if (this.pointers.size === 2 && isFinger) {
      this.cancelStroke()
      this.beginGesture()

      return
    }

    if (this.pointers.size > 2 && isFinger) return

    if (this.pointers.size === 1) {
      this.gestureTime = performance.now()
      this.maxFingers = 1
      this.movedFar = false
    }

    if (shouldPan) {
      this.beginGesture()

      return
    }

    if (event.button !== 0 || this.editor.isPlaying.peek()) return
    if (!this.editor.isPageReady) return

    this.startStroke(event)
  }

  private startStroke(event: PointerEvent): void {
    const tool = this.toolFor()

    if (!tool) return

    const { x, y } = this.toPage(event)

    this.smoothX = x
    this.smoothY = y
    this.smoothTime = event.timeStamp

    const refusal = tool.down(this.editor, this.toolPoint(event, x, y))

    if (refusal) {
      playSfx('error')
      toast(t(refusal === 'locked' ? 'stage.layerLocked' : 'stage.layerEmpty'))

      return
    }

    this.activeTool = tool
    this.drawingPointer = event.pointerId
    this.flush()
    this.startDrawSound(tool, event)

    if (!this.frameRequest) {
      this.frameRequest = requestAnimationFrame(this.strokeLoop)
    }
  }

  private startDrawSound(tool: Tool, event: PointerEvent): void {
    const kinds: Partial<Record<Tool['options'], ScribbleKind>> = {
      pen: 'pen',
      paint: 'pen',
      eraser: 'eraser',
    }
    const kind = kinds[tool.options]

    if (!kind) return

    this.scribbleSpeed = 0
    this.lastMoveX = event.clientX
    this.lastMoveY = event.clientY
    this.lastMoveTime = event.timeStamp
    startScribble(kind)
  }

  private trackDrawSpeed(event: PointerEvent): void {
    const elapsed = event.timeStamp - this.lastMoveTime

    if (elapsed <= 0) return

    const distance = Math.hypot(
      event.clientX - this.lastMoveX,
      event.clientY - this.lastMoveY,
    )

    this.scribbleSpeed = Math.max(
      this.scribbleSpeed,
      distance / elapsed / SCRIBBLE_FULL_SPEED,
    )
    this.lastMoveX = event.clientX
    this.lastMoveY = event.clientY
    this.lastMoveTime = event.timeStamp
  }

  private readonly strokeLoop = (): void => {
    this.frameRequest = 0

    if (!this.activeTool) return

    this.activeTool.tick?.(this.editor, performance.now())
    this.flush()
    updateScribble(this.scribbleSpeed)
    this.scribbleSpeed *= SCRIBBLE_DECAY
    this.frameRequest = requestAnimationFrame(this.strokeLoop)
  }

  private flush(): void {
    const editor = this.editor
    const surface = editor.surface

    if (surface.right < surface.left) return

    const region: Region = {
      left: surface.left,
      top: surface.top,
      right: surface.right,
      bottom: surface.bottom,
    }

    surface.resetRegion()
    editor.compositor.composeRegion(editor.page.peek(), editor.planes, region)
    this.present(region, editor.page.peek())
  }

  private readonly onMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId)

    if (event.pointerType !== 'touch') this.updateBrushCursor(event)

    if (!pointer) return

    pointer.x = event.clientX
    pointer.y = event.clientY

    const moved = Math.hypot(
      pointer.x - pointer.startX,
      pointer.y - pointer.startY,
    )

    if (moved > TAP_MOVE) this.movedFar = true

    if (this.isGesturing) {
      this.updateGesture()

      return
    }

    if (event.pointerId !== this.drawingPointer || !this.activeTool) return

    this.trackDrawSpeed(event)

    const events = event.getCoalescedEvents?.() ?? []

    for (const sample of events.length ? events : [event]) {
      this.moveStroke(sample)
    }

    if (this.activeTool.options === 'select') this.editor.touchFloating()

    this.flush()
  }

  private moveStroke(event: PointerEvent): void {
    const tool = this.activeTool

    if (!tool) return

    const { x, y } = this.toPage(event)
    const isFreePen = this.editor.note.profile.id === 'free'
    const elapsed = event.timeStamp - this.smoothTime
    const follow = isFreePen
      ? followShare(settings.stabilizer.peek(), elapsed)
      : 1

    this.smoothTime = event.timeStamp
    this.smoothX += (x - this.smoothX) * follow
    this.smoothY += (y - this.smoothY) * follow

    tool.move(this.editor, this.toolPoint(event, this.smoothX, this.smoothY))
  }

  private get isGesturing(): boolean {
    return this.gestureStart.distance >= 0 && this.gestureActive
  }

  private gestureActive = false

  private beginGesture(): void {
    const [first, second] = [...this.pointers.values()]
    const distance = second
      ? Math.hypot(first.x - second.x, first.y - second.y)
      : 0

    this.maxFingers = Math.max(this.maxFingers, this.pointers.size)
    this.gestureActive = true
    this.gestureStart = {
      distance,
      zoom: this.zoom.peek(),
      panX: this.panX,
      panY: this.panY,
      x: second ? (first.x + second.x) / 2 : first.x,
      y: second ? (first.y + second.y) / 2 : first.y,
    }
  }

  private updateGesture(): void {
    const [first, second] = [...this.pointers.values()]

    if (!first) return

    const start = this.gestureStart
    const x = second ? (first.x + second.x) / 2 : first.x
    const y = second ? (first.y + second.y) / 2 : first.y

    if (second && start.distance > 0) {
      const distance = Math.hypot(first.x - second.x, first.y - second.y)
      const zoom = (start.zoom * distance) / start.distance

      this.zoom.value = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom))
    }

    this.panX = start.panX + x - start.x
    this.panY = start.panY + y - start.y
    this.isFitted.value = false
    this.applyTransform()
  }

  private readonly onUp = (event: PointerEvent): void => {
    const count = this.pointers.size

    this.maxFingers = Math.max(this.maxFingers, count)
    this.pointers.delete(event.pointerId)

    if (event.pointerId === this.drawingPointer) this.finishStroke(event)

    if (this.pointers.size === 0) {
      this.gestureActive = false
      this.detectTapGesture(event)
    }
  }

  private detectTapGesture(event: PointerEvent): void {
    const elapsed = performance.now() - this.gestureTime

    if (event.pointerType !== 'touch' || elapsed > TAP_MS) return
    if (this.movedFar) return

    if (this.maxFingers === 2) this.onUndo()
    if (this.maxFingers === 3) this.onRedo()
  }

  private finishStroke(event: PointerEvent): void {
    const tool = this.activeTool

    this.drawingPointer = -1
    this.activeTool = null
    stopScribble()

    if (!tool) return

    const point = this.toolPoint(event, this.smoothX, this.smoothY)

    tool.up(this.editor, point)
    this.flush()

    if (tool.options === 'select') this.editor.touchFloating()
  }

  private cancelStroke(): void {
    stopScribble()
    this.activeTool?.cancel?.(this.editor)
    this.activeTool = null
    this.drawingPointer = -1
  }

  private readonly onCancel = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId)

    if (event.pointerId === this.drawingPointer) this.cancelStroke()

    if (this.pointers.size === 0) this.gestureActive = false
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()

    if (event.ctrlKey || !event.shiftKey) {
      this.zoomBy(event.deltaY < 0 ? 1.1 : 0.9)
    } else {
      this.panX -= event.deltaY
      this.isFitted.value = false
      this.applyTransform()
    }
  }

  private updateBrushCursor(event: PointerEvent): void {
    const editor = this.editor
    const box = this.element.getBoundingClientRect()
    const tool = this.toolFor()
    const isOverPage = eventElement(event)?.closest('.page-holder')
    const options = tool?.options

    if (options === 'warp' && isOverPage) {
      this.placeCursor(event, box, editor.warpSize.peek() * 2)

      return
    }

    if (
      !isOverPage ||
      !(options === 'pen' || options === 'eraser' || options === 'paint')
    ) {
      this.cursor.hidden = true

      return
    }

    const spec =
      options === 'eraser'
        ? editor.currentEraser()
        : options === 'paint'
          ? editor.currentPaint()
          : editor.currentPen()

    const size =
      spec.engine === 'free'
        ? options === 'eraser'
          ? editor.eraserSize.peek()
          : editor.size.peek()
        : (spec.size ?? 5)

    this.placeCursor(event, box, size)
  }

  private placeCursor(event: PointerEvent, box: DOMRect, size: number): void {
    const diameter = Math.max(4, size * this.zoom.peek())

    this.cursor.hidden = false
    this.cursor.style.width = `${diameter}px`
    this.cursor.style.height = `${diameter}px`
    this.cursor.style.transform = `translate(${event.clientX - box.left - diameter / 2}px, ${event.clientY - box.top - diameter / 2}px)`
  }

  dispose(): void {
    this.scope.dispose()
  }
}

function paperGrain(): string {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  canvas.width = GRAIN_SIZE
  canvas.height = GRAIN_SIZE

  if (!context) return 'none'

  const image = context.createImageData(GRAIN_SIZE, GRAIN_SIZE)

  for (let index = 0; index < image.data.length; index += 4) {
    const shade = 90 + Math.random() * 70

    image.data[index] = shade + 8
    image.data[index + 1] = shade + 6
    image.data[index + 2] = shade
    image.data[index + 3] = Math.random() * 11
  }

  context.putImageData(image, 0, 0)

  return `url(${canvas.toDataURL()})`
}

function isTyping(event: KeyboardEvent): boolean {
  return !!eventElement(event)?.matches('input, textarea')
}
