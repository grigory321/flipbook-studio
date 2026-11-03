import type { Editor } from '../../app/editor.ts'
import { type Thumbnail, ThumbnailCache } from '../../app/thumbnails.ts'
import {
  bgmTracks,
  soundTracks,
  type Track,
  trackBase,
  trackPages,
} from '../../core/note.ts'
import { t } from '../../i18n/index.ts'
import { eventElement, h, icon, Scope } from '../dom.ts'
import { playSfx } from '../sfx.ts'

const LONG_PRESS_MS = 320
const DRAG_SLOP = 6
const OVERSCAN = 4
const EDGE_SCROLL = 18
const EDGE_ZONE = 48
const CLIP_INSET = 2
const CLIP_RADIUS = 7
const TAIL_ALPHA = 0.22
const DEFAULT_CELL = 74
const DEFAULT_LANE = 24
const EMPTY_LANE_TEXT = '#c4a98f'
const EMPTY_LANE_INSET = 8
const GRIP_WIDTH = 6
const GRIP_REACH = 10
const GRIP_REACH_TOUCH = 18
const LABEL_COLOR = '#211d1a'
const LABEL_TEXT = '#fff7ec'

const BGM_COLORS = ['#2fbf72', '#3fa9f5']
const SOUND_COLORS = ['#ff8a1e', '#f4497f', '#e0a800', '#8e6cf0']

interface Cell {
  element: HTMLElement
  canvas: HTMLCanvasElement
  number: HTMLElement
  page: number
  shown: string
  shownPage: number
  loading: string
  token: number
}

interface LaneDrag {
  kind: 'mark' | 'bgm' | 'pan' | 'length'
  lane: number
  from: number
  page: number
  grab: number
  clipStart: number
  seconds: number
  startX: number
  startScroll: number
  hasMoved: boolean
}

export interface StripActions {
  onAddPage: () => void
  onPickTrack: (track: Track) => void
}

export class PageStrip {
  readonly element = h('div', { class: 'strip' })

  private readonly editor: Editor
  private readonly actions: StripActions
  private readonly scope = new Scope()
  private readonly thumbnails: ThumbnailCache
  private readonly gutter = h('div', { class: 'strip-gutter' })
  private readonly scroller = h('div', { class: 'strip-scroll' })
  private readonly track = h('div', { class: 'strip-track' })
  private readonly marker = h('div', { class: 'strip-marker', hidden: true })
  private readonly lanes = h('canvas', { class: 'strip-lanes', hidden: true })
  private readonly addCell = h(
    'button',
    {
      class: 'strip-add',
      type: 'button',
      'data-nav': true,
      'aria-label': t('page.add'),
      title: t('page.add'),
    },
    icon('plus'),
  )
  private readonly cells = new Map<number, Cell>()
  private readonly spareCells: Cell[] = []
  private currentCell: Cell | null = null
  private renderRequest = 0
  private placedWidth = 0

  private cellWidth = DEFAULT_CELL
  private laneHeight = DEFAULT_LANE
  private dragFrom = -1
  private dragTo = -1
  private pressTimer = 0
  private pressX = 0
  private showsLanes = false
  private laneDrag: LaneDrag | null = null

  constructor(editor: Editor, actions: StripActions) {
    this.editor = editor
    this.actions = actions
    this.thumbnails = new ThumbnailCache(editor.note)

    this.track.append(this.addCell, this.marker)
    this.scroller.append(this.track, this.lanes)
    this.element.append(this.gutter, this.scroller)

    this.addCell.addEventListener('click', () => actions.onAddPage())
    this.scroller.addEventListener('scroll', this.requestRender, {
      passive: true,
    })

    this.lanes.addEventListener('pointerdown', this.onLanePress)
    this.lanes.addEventListener('pointermove', this.onLaneMove)
    this.lanes.addEventListener('pointerup', this.onLaneRelease)
    this.lanes.addEventListener('pointercancel', this.onLaneCancel)

    this.track.addEventListener('pointerdown', this.onPress)
    this.track.addEventListener('pointermove', this.onDrag)
    this.track.addEventListener('pointerup', this.onRelease)
    this.track.addEventListener('pointercancel', this.cancelDrag)
    this.track.addEventListener('contextmenu', event => event.preventDefault())

    const observer = new ResizeObserver(() => this.layout())

    observer.observe(this.scroller)
    this.scope.add(() => observer.disconnect())
    this.scope.add(() => cancelAnimationFrame(this.renderRequest))

    this.scope.effect(() => {
      editor.pagesVersion.value
      editor.settingsVersion.value
      this.layout()
      this.scrollToPage(editor.page.peek())
    })

    this.scope.effect(() => {
      const page = editor.page.value

      this.highlight(page)
      this.scrollToPage(page)
    })

    this.scope.effect(() => {
      if (!editor.isPlaying.value) this.requestRender()
    })

    this.scope.effect(() => {
      editor.settingsVersion.value
      this.renderGutter()
    })
  }

  setOpen(isOpen: boolean): void {
    this.element.hidden = !isOpen

    if (!isOpen) return

    this.layout()
    this.scrollToPage(this.editor.page.peek())
  }

  setSoundRows(isShown: boolean): void {
    this.showsLanes = isShown
    this.lanes.hidden = !isShown
    this.element.classList.toggle('has-sounds', isShown)
    this.renderGutter()
    this.layout()
  }

  private tracks(): Track[] {
    const { meta } = this.editor.note

    return [...bgmTracks(meta), ...soundTracks(meta)]
  }

  private trackColor(index: number): string {
    return index < BGM_COLORS.length
      ? BGM_COLORS[index]
      : SOUND_COLORS[index - BGM_COLORS.length]
  }

  private renderGutter(): void {
    const cap = h('div', { class: 'strip-cap', 'aria-hidden': 'true' })
    const labels = this.showsLanes ? this.laneLabels() : []

    this.gutter.hidden = !this.showsLanes
    this.gutter.replaceChildren(cap, ...labels)
  }

  private laneLabels(): HTMLElement[] {
    return this.tracks().map((track, index) => {
      const isBgm = track.kind === 'bgm'
      const name = isBgm
        ? t('sound.bgmNumber', { n: index + 1 })
        : t('sound.slot', { n: index - BGM_COLORS.length + 1 })

      return h(
        'button',
        {
          class: `lane-label ${track.soundId ? 'has-sound' : ''}`,
          type: 'button',
          'data-nav': true,
          title: name,
          'aria-label': name,
          style: `--lane-color:${this.trackColor(index)}`,
          onClick: () => this.actions.onPickTrack(track),
        },
        icon(isBgm ? 'music' : 'volume'),
      )
    })
  }

  private layout = (): void => {
    const editor = this.editor
    const styles = getComputedStyle(this.element)

    this.cellWidth =
      parseFloat(styles.getPropertyValue('--cell')) || DEFAULT_CELL
    this.laneHeight =
      parseFloat(styles.getPropertyValue('--lane')) || DEFAULT_LANE

    const count = editor.pageCount
    const total = (count + 1) * this.cellWidth

    this.track.style.width = `${total}px`
    this.addCell.style.transform = `translateX(${count * this.cellWidth}px)`
    this.requestRender()
  }

  private scrollToPage(page: number): void {
    const { clientWidth, scrollLeft } = this.scroller
    const left = page * this.cellWidth
    const right = left + this.cellWidth

    if (left < scrollLeft + this.cellWidth) {
      this.scroller.scrollLeft = Math.max(0, left - this.cellWidth)
    } else if (right > scrollLeft + clientWidth - this.cellWidth) {
      this.scroller.scrollLeft = right - clientWidth + this.cellWidth
    }
  }

  private createCell(): Cell {
    const canvas = h('canvas', {
      class: 'strip-thumb',
      width: this.thumbnails.width,
      height: this.thumbnails.height,
    })
    const number = h('span', { class: 'strip-number' })
    const element = h(
      'button',
      { class: 'strip-cell', type: 'button', 'data-silent': true },
      h('span', { class: 'strip-sheet' }, canvas, number),
    )

    this.track.appendChild(element)

    return {
      element,
      canvas,
      number,
      page: -1,
      shown: '',
      shownPage: -1,
      loading: '',
      token: 0,
    }
  }

  private placeCell(cell: Cell, page: number): void {
    cell.page = page
    cell.element.hidden = false
    cell.element.style.transform = `translateX(${page * this.placedWidth}px)`
    cell.element.dataset.page = String(page)
    cell.element.setAttribute('aria-label', t('page.number', { n: page + 1 }))
    cell.number.textContent = String(page + 1)
  }

  private releaseCell(cell: Cell): void {
    cell.element.hidden = true
    cell.element.classList.remove('is-current')
    cell.page = -1
    cell.loading = ''
    cell.token++

    if (cell === this.currentCell) this.currentCell = null

    this.spareCells.push(cell)
  }

  private highlight(page: number): void {
    const cell = this.cells.get(page) ?? null

    if (cell === this.currentCell) return

    this.currentCell?.element.classList.remove('is-current')
    cell?.element.classList.add('is-current')
    this.currentCell = cell
  }

  private readonly requestRender = (): void => {
    if (this.renderRequest) return

    this.renderRequest = requestAnimationFrame(() => {
      this.renderRequest = 0
      this.render()
    })
  }

  private render(): void {
    const editor = this.editor
    const { scrollLeft, clientWidth } = this.scroller

    this.element.style.setProperty('--film-scroll', `${scrollLeft}px`)
    const width = this.cellWidth || DEFAULT_CELL
    const first = Math.max(0, Math.floor(scrollLeft / width) - OVERSCAN)
    const last = Math.min(
      editor.pageCount - 1,
      Math.ceil((scrollLeft + clientWidth) / width) + OVERSCAN,
    )

    for (const [page, cell] of this.cells) {
      if (page >= first && page <= last) continue

      this.cells.delete(page)
      this.releaseCell(cell)
    }

    if (width !== this.placedWidth) {
      this.placedWidth = width

      for (const [page, cell] of this.cells) this.placeCell(cell, page)
    }

    for (let page = first; page <= last; page++) {
      let cell = this.cells.get(page)

      if (!cell) {
        cell = this.spareCells.pop() ?? this.createCell()
        this.placeCell(cell, page)
        this.cells.set(page, cell)
      }

      this.paintCell(cell)
    }

    this.highlight(editor.page.peek())
    this.drawLanes()
  }

  private paintCell(cell: Cell): void {
    const { page } = cell
    const thumbnails = this.thumbnails
    const key = thumbnails.keyOf(page)

    if (cell.shown === key) {
      cell.shownPage = page

      return
    }

    const known = thumbnails.cached(key)

    if (known) {
      this.showThumbnail(cell, known)

      return
    }

    if (cell.shownPage !== page) this.clearCell(cell)

    if (this.editor.isPlaying.peek() || cell.loading === key) return

    const token = ++cell.token

    cell.loading = key
    thumbnails
      .get(page, () => token === cell.token)
      .then(
        thumbnail => {
          if (token !== cell.token) return

          cell.loading = ''

          if (thumbnail) this.showThumbnail(cell, thumbnail)
        },
        (error: unknown) => {
          if (token === cell.token) cell.loading = ''

          console.error(error)
        },
      )
  }

  private showThumbnail(cell: Cell, thumbnail: Thumbnail): void {
    const { width, height } = this.thumbnails

    cell.canvas
      .getContext('2d')
      ?.putImageData(
        new ImageData(
          new Uint8ClampedArray(thumbnail.pixels.buffer),
          width,
          height,
        ),
        0,
        0,
      )
    cell.shown = thumbnail.key
    cell.shownPage = cell.page
  }

  private clearCell(cell: Cell): void {
    if (!cell.shown) return

    const { width, height } = this.thumbnails

    cell.canvas.getContext('2d')?.clearRect(0, 0, width, height)
    cell.shown = ''
    cell.shownPage = -1
  }

  private soundPages(track: Track): number {
    const { note } = this.editor
    const sound = track.soundId ? note.sounds.get(track.soundId) : null

    if (!sound) return 0

    const drag = this.laneDrag

    if (drag?.kind === 'length' && this.tracks()[drag.lane] === track) {
      return drag.seconds * trackBase(track, note.fps)
    }

    return trackPages(track, sound, note.fps)
  }

  private laneTop(lane: number): number {
    return lane * this.laneHeight
  }

  private drawLanes(): void {
    const canvas = this.lanes

    if (!this.showsLanes) return

    const tracks = this.tracks()
    const ratio = devicePixelRatio || 1
    const { clientWidth: width, scrollLeft } = this.scroller
    const height = this.laneTop(tracks.length)

    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio
      canvas.height = height * ratio
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
    }

    canvas.style.transform = `translateX(${scrollLeft}px)`

    const context = canvas.getContext('2d')

    if (!context) return

    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.font = `800 11px 'Zen Maru Gothic', sans-serif`
    context.textBaseline = 'middle'

    tracks.forEach((track, lane) => {
      const y = this.laneTop(lane)

      context.fillStyle = lane % 2 ? '#fff7ec' : '#ffffff'
      context.fillRect(0, y, width, this.laneHeight)

      if (!track.soundId) {
        context.fillStyle = EMPTY_LANE_TEXT
        context.fillText(
          t('sound.tapToPick'),
          EMPTY_LANE_INSET,
          y + this.laneHeight / 2 + 1,
        )
      } else if (track.kind === 'bgm') {
        this.drawBgm(context, track, lane, width)
      } else {
        this.drawMarks(context, track, lane, width)
      }
    })

    this.drawLengthLabel(context)
  }

  private drawLengthLabel(context: CanvasRenderingContext2D): void {
    const drag = this.laneDrag

    if (drag?.kind !== 'length') return

    const { fps } = this.editor.note
    const pages = this.soundPages(this.tracks()[drag.lane])
    const text = t('sound.seconds', { n: (pages / fps).toFixed(1) })
    const x =
      drag.clipStart + pages * this.cellWidth - this.scroller.scrollLeft + 6
    const y = this.laneTop(drag.lane)
    const width = context.measureText(text).width + 12

    context.beginPath()
    context.roundRect(x, y + 1, width, this.laneHeight - 2, CLIP_RADIUS)
    context.fillStyle = LABEL_COLOR
    context.fill()
    context.fillStyle = LABEL_TEXT
    context.fillText(text, x + 6, y + this.laneHeight / 2 + 1)
  }

  private grip(
    context: CanvasRenderingContext2D,
    end: number,
    lane: number,
  ): void {
    const inset = CLIP_INSET + 3

    context.beginPath()
    context.roundRect(
      end - GRIP_WIDTH - 2,
      this.laneTop(lane) + inset,
      GRIP_WIDTH - 2,
      this.laneHeight - inset * 2,
      2,
    )
    context.fillStyle = '#ffffff'
    context.fill()
  }

  private clip(
    context: CanvasRenderingContext2D,
    x: number,
    lane: number,
    width: number,
    color: string,
    label: string,
    isLifted = false,
  ): void {
    const y = this.laneTop(lane) + CLIP_INSET
    const height = this.laneHeight - CLIP_INSET * 2

    context.beginPath()
    context.roundRect(x, y, width, height, CLIP_RADIUS)
    context.fillStyle = color
    context.globalAlpha = isLifted ? 0.75 : 1
    context.fill()
    context.globalAlpha = 1

    if (isLifted) {
      context.strokeStyle = '#4b2a12'
      context.lineWidth = 2
      context.stroke()
    }

    if (width > 44 && label) {
      context.save()
      context.clip()
      context.fillStyle = '#ffffff'
      context.fillText(label, Math.max(x, 0) + 7, y + height / 2 + 1)
      context.restore()
    }
  }

  private trackName(track: Track): string {
    const sound = track.soundId
      ? this.editor.note.sounds.get(track.soundId)
      : null

    return sound?.name ?? ''
  }

  private drawBgm(
    context: CanvasRenderingContext2D,
    track: Track,
    lane: number,
    width: number,
  ): void {
    const pages = this.soundPages(track)

    if (pages <= 0) return

    const drag = this.laneDrag
    const isDragged = drag?.kind === 'bgm' && drag.lane === lane
    const offset = isDragged ? drag.page : track.offset
    const start = offset * this.cellWidth
    const clipWidth = this.bgmEnd(offset, pages) - start
    const x = start - this.scroller.scrollLeft

    if (clipWidth <= 0 || x + clipWidth < 0 || x > width) return

    this.clip(
      context,
      x,
      lane,
      clipWidth,
      this.trackColor(lane),
      this.trackName(track),
      isDragged,
    )
    this.grip(context, x + clipWidth, lane)
  }

  private bgmEnd(offset: number, pages: number): number {
    const end = Math.min(offset + pages, this.editor.pageCount)

    return end * this.cellWidth
  }

  private drawMarks(
    context: CanvasRenderingContext2D,
    track: Track,
    lane: number,
    width: number,
  ): void {
    const { frames } = this.editor.note
    const slot = lane - BGM_COLORS.length
    const bit = 1 << slot
    const color = this.trackColor(lane)
    const cell = this.cellWidth
    const clipWidth = Math.max(cell - 4, this.soundPages(track) * cell)
    const { scrollLeft } = this.scroller
    const first = Math.max(0, Math.floor((scrollLeft - clipWidth) / cell))
    const last = Math.min(
      this.editor.pageCount - 1,
      Math.ceil((scrollLeft + width) / cell),
    )
    const drag = this.laneDrag
    const isDragged = drag?.kind === 'mark' && drag.lane === lane

    const placed: number[] = []

    for (let page = first; page <= last; page++) {
      if (!(frames.sounds(page) & bit)) continue
      if (isDragged && page === drag.from) continue

      placed.push(page * cell - scrollLeft + 2)
    }

    context.globalAlpha = TAIL_ALPHA

    for (const x of placed) this.tail(context, x, lane, clipWidth, color)

    context.globalAlpha = 1

    for (const x of placed) {
      this.clip(context, x, lane, cell - 4, color, this.trackName(track))
    }

    for (const x of placed) this.grip(context, x + clipWidth, lane)

    if (isDragged) {
      const x = drag.page * cell - scrollLeft + 2

      this.clip(context, x, lane, cell - 4, color, '', true)
    }
  }

  private tail(
    context: CanvasRenderingContext2D,
    x: number,
    lane: number,
    width: number,
    color: string,
  ): void {
    context.beginPath()
    context.roundRect(
      x,
      this.laneTop(lane) + CLIP_INSET,
      width,
      this.laneHeight - CLIP_INSET * 2,
      CLIP_RADIUS,
    )
    context.fillStyle = color
    context.fill()
  }

  private lanePoint(event: PointerEvent): { lane: number; page: number } {
    const box = this.lanes.getBoundingClientRect()
    const x = event.clientX - box.left + this.scroller.scrollLeft
    const lane = Math.floor((event.clientY - box.top) / this.laneHeight)
    const page = Math.floor(x / this.cellWidth)

    return {
      lane: Math.max(0, Math.min(this.tracks().length - 1, lane)),
      page: Math.max(0, Math.min(this.editor.pageCount - 1, page)),
    }
  }

  private contentX(event: PointerEvent): number {
    const box = this.lanes.getBoundingClientRect()

    return event.clientX - box.left + this.scroller.scrollLeft
  }

  private clipWidth(track: Track): number {
    const width = this.soundPages(track) * this.cellWidth

    return track.kind === 'bgm' ? width : Math.max(this.cellWidth - 4, width)
  }

  private clipStartAtGrip(
    track: Track,
    lane: number,
    x: number,
    reach: number,
  ): number | null {
    if (!track.soundId) return null

    const cell = this.cellWidth
    const width = this.clipWidth(track)
    const isNear = (start: number): boolean =>
      Math.abs(start + width - x) <= reach

    if (track.kind === 'bgm') {
      const start = track.offset * cell
      const end = this.bgmEnd(track.offset, this.soundPages(track))

      return Math.abs(end - x) <= reach ? start : null
    }

    const { frames } = this.editor.note
    const bit = 1 << (lane - BGM_COLORS.length)
    const guess = Math.round((x - width) / cell)

    for (let page = guess - 1; page <= guess + 1; page++) {
      const isMarked =
        page >= 0 && page < frames.count && frames.sounds(page) & bit

      if (isMarked && isNear(page * cell + 2)) return page * cell + 2
    }

    return null
  }

  private readonly onLanePress = (event: PointerEvent): void => {
    const { lane, page } = this.lanePoint(event)
    const track = this.tracks()[lane]
    const reach = event.pointerType === 'touch' ? GRIP_REACH_TOUCH : GRIP_REACH
    const clipStart = this.clipStartAtGrip(
      track,
      lane,
      this.contentX(event),
      reach,
    )

    event.preventDefault()
    this.lanes.setPointerCapture(event.pointerId)

    const start = {
      lane,
      grab: 0,
      clipStart: 0,
      seconds: 0,
      startX: event.clientX,
      startScroll: this.scroller.scrollLeft,
      hasMoved: false,
    }

    if (clipStart !== null) {
      this.laneDrag = {
        ...start,
        kind: 'length',
        from: -1,
        page,
        clipStart,
        seconds: this.soundPages(track) / this.editor.note.fps,
      }

      return
    }

    if (track.kind === 'bgm') {
      const pages = this.soundPages(track)
      const isOnClip =
        pages > 0 && page >= track.offset && page <= track.offset + pages

      this.laneDrag = isOnClip
        ? {
            ...start,
            kind: 'bgm',
            from: track.offset,
            page: track.offset,
            grab: page - track.offset,
          }
        : { ...start, kind: 'pan', from: -1, page }

      return
    }

    const slot = lane - BGM_COLORS.length
    const isMarked = (this.editor.note.frames.sounds(page) & (1 << slot)) !== 0

    this.laneDrag = {
      ...start,
      kind: isMarked ? 'mark' : 'pan',
      from: isMarked ? page : -1,
      page,
    }
  }

  private showGripCursor(event: PointerEvent): void {
    const { lane } = this.lanePoint(event)
    const isOnGrip =
      this.clipStartAtGrip(
        this.tracks()[lane],
        lane,
        this.contentX(event),
        GRIP_REACH,
      ) !== null

    this.lanes.classList.toggle('is-on-grip', isOnGrip)
  }

  private dragLength(drag: LaneDrag, event: PointerEvent): void {
    const { note } = this.editor
    const track = this.tracks()[drag.lane]
    const sound = track.soundId ? note.sounds.get(track.soundId) : null

    if (!sound) return

    const pages = Math.round(
      (this.contentX(event) - drag.clipStart) / this.cellWidth,
    )
    const whole = sound.samples.length / sound.rate

    drag.seconds = Math.min(
      whole,
      Math.max(1, pages) / trackBase(track, note.fps),
    )
    this.drawLanes()
  }

  private readonly onLaneMove = (event: PointerEvent): void => {
    const drag = this.laneDrag

    if (!drag) {
      if (event.pointerType === 'mouse') this.showGripCursor(event)

      return
    }

    const moved = event.clientX - drag.startX

    if (Math.abs(moved) > DRAG_SLOP) drag.hasMoved = true

    if (!drag.hasMoved) return

    if (drag.kind === 'pan') {
      this.scroller.scrollLeft = drag.startScroll - moved

      return
    }

    if (drag.kind === 'length') {
      this.dragLength(drag, event)

      return
    }

    const box = this.scroller.getBoundingClientRect()

    if (event.clientX < box.left + EDGE_ZONE) {
      this.scroller.scrollLeft -= EDGE_SCROLL
    } else if (event.clientX > box.right - EDGE_ZONE) {
      this.scroller.scrollLeft += EDGE_SCROLL
    }

    const { page } = this.lanePoint(event)

    const pages = this.soundPages(this.tracks()[drag.lane])

    drag.page =
      drag.kind === 'bgm'
        ? Math.max(1 - Math.ceil(pages), page - drag.grab)
        : page

    this.drawLanes()
  }

  private readonly onLaneRelease = (): void => {
    const drag = this.laneDrag

    this.laneDrag = null

    if (!drag) return

    if (drag.hasMoved) this.finishLaneDrag(drag)
    else if (drag.kind !== 'length') this.tapLane(drag)

    this.drawLanes()
  }

  private finishLaneDrag(drag: LaneDrag): void {
    const track = this.tracks()[drag.lane]

    if (drag.kind === 'length') {
      const { note } = this.editor
      const sound = track.soundId ? note.sounds.get(track.soundId) : null
      const whole = sound ? sound.samples.length / sound.rate : 0

      this.editor.setTrackLength(
        track,
        drag.seconds >= whole ? null : drag.seconds,
      )
      playSfx('tap')
    } else if (drag.kind === 'bgm') {
      this.editor.setBgmOffset(track, drag.page)
      playSfx('tap')
    } else if (drag.kind === 'mark') {
      this.editor.moveSound(drag.lane - BGM_COLORS.length, drag.from, drag.page)
      playSfx('tap')
    }
  }

  private tapLane(drag: LaneDrag): void {
    const track = this.tracks()[drag.lane]

    if (!track.soundId) {
      this.actions.onPickTrack(track)

      return
    }

    if (track.kind === 'sound') {
      this.editor.toggleSound(drag.page, drag.lane - BGM_COLORS.length)
      playSfx('tap')
    }
  }

  private readonly onLaneCancel = (): void => {
    this.laneDrag = null
    this.drawLanes()
  }

  private pageAt(event: PointerEvent): number {
    const box = this.track.getBoundingClientRect()
    const page = Math.round((event.clientX - box.left) / this.cellWidth)

    return Math.max(0, Math.min(this.editor.pageCount, page))
  }

  private readonly onPress = (event: PointerEvent): void => {
    const target = eventElement(event)?.closest<HTMLElement>('.strip-cell')

    if (!target || event.button !== 0) return

    const page = Number(target.dataset.page)

    this.dragFrom = page
    this.dragTo = page
    this.pressX = event.clientX

    if (event.pointerType === 'mouse') return

    this.pressTimer = window.setTimeout(() => {
      this.track.setPointerCapture(event.pointerId)
      this.beginDrag()
      navigator.vibrate?.(12)
    }, LONG_PRESS_MS)
  }

  private beginDrag(): void {
    this.track.classList.add('is-dragging')
    this.marker.hidden = false
    playSfx('page')
  }

  private readonly onDrag = (event: PointerEvent): void => {
    if (this.dragFrom < 0) return

    const moved = Math.abs(event.clientX - this.pressX)
    const isDragging = this.track.classList.contains('is-dragging')

    if (!isDragging) {
      if (moved > DRAG_SLOP) clearTimeout(this.pressTimer)

      if (event.pointerType === 'mouse' && moved > DRAG_SLOP) {
        this.track.setPointerCapture(event.pointerId)
        this.beginDrag()
      }

      return
    }

    event.preventDefault()

    const box = this.scroller.getBoundingClientRect()

    if (event.clientX < box.left + EDGE_ZONE) {
      this.scroller.scrollLeft -= EDGE_SCROLL
    } else if (event.clientX > box.right - EDGE_ZONE) {
      this.scroller.scrollLeft += EDGE_SCROLL
    }

    this.dragTo = this.pageAt(event)
    this.marker.style.transform = `translateX(${this.dragTo * this.cellWidth}px)`
  }

  private readonly onRelease = (event: PointerEvent): void => {
    clearTimeout(this.pressTimer)

    const from = this.dragFrom
    const to = this.dragTo
    const wasDragging = this.track.classList.contains('is-dragging')

    this.cancelDrag()

    if (from < 0) return

    if (wasDragging) {
      this.editor.movePage(from, to > from ? to - 1 : to)
    } else if (eventElement(event)?.closest('.strip-cell')) {
      playSfx('page')
      void this.editor.goTo(from)
    }
  }

  private readonly cancelDrag = (): void => {
    clearTimeout(this.pressTimer)
    this.dragFrom = -1
    this.track.classList.remove('is-dragging')
    this.marker.hidden = true
  }

  dispose(): void {
    this.scope.dispose()
  }
}
