import { loadPlane, updateCel } from '../core/cel.ts'
import { Compositor } from '../core/compositor.ts'
import { inkOf, withInk } from '../core/frames.ts'
import { COVERAGE_FULL, KNOCKOUT_VALUE, valueInk } from '../core/ink.ts'
import type { EdgeSpec } from '../draw/edge.ts'
import { History, type HistoryStep } from '../core/history.ts'
import {
  defaultInks,
  dsiInk,
  type LayerInfo,
  type Note,
  resolveInk,
  type Track,
} from '../core/note.ts'
import { DEVICE_PATTERNS, type Pattern } from '../core/patterns.ts'
import {
  DSI_PEN_BLUE,
  DSI_PEN_INVERSE,
  DSI_PEN_RED,
  N3DS_SHEET_PAIRS,
  rgbCss,
  type Rgb,
} from '../core/profile.ts'
import { Signal } from '../core/signal.ts'
import { EMPTY_REF } from '../core/store.ts'
import { Surface } from '../core/surface.ts'
import { ERASER_SETS, PAINT_SETS, PEN_SETS, type PenSpec } from './pens.ts'
import { settings } from './settings.ts'
import type { ShapeKind } from '../draw/shapes.ts'
import { fullMask } from '../draw/mask.ts'
import { type Floating, layeredValue, liftMask } from './floating.ts'
import type { MotionPoint } from './motion.ts'

export type SelectMode = 'rect' | 'lasso' | 'wand'

export type WarpMode = 'push' | 'swell' | 'pinch'

export interface InkChoice {
  code: number
  color: Rgb
}

export interface InkValue {
  value: number
  color: Rgb
}

export interface EditOptions {
  onChange?: () => void
}

interface PageClipboard {
  rows: Uint32Array
}

const PAGE_PIN = 'editor-page'

export class Editor {
  readonly note: Note
  readonly history = new History()
  readonly compositor: Compositor

  readonly page = new Signal(0)
  readonly layer = new Signal(0)
  readonly toolId = new Signal('pen')
  readonly shape = new Signal<ShapeKind>('line')
  readonly shapeFilled = new Signal(false)
  readonly isTracingShape = new Signal(false)
  readonly ink = new Signal(1)
  readonly penId: Signal<string>
  readonly eraserId: Signal<string>
  readonly paintId: Signal<string>
  readonly isBucket = new Signal(false)
  readonly patternId = new Signal('checker')
  readonly patternErase = new Signal(false)
  readonly overwrite = new Signal(false)
  readonly size = new Signal(3)
  readonly eraserSize = new Signal(12)
  readonly opacity = new Signal(1)
  readonly eraserStrength = new Signal(1)
  readonly penEdge: EdgeSpec = {
    style: 'none',
    width: 2,
    second: KNOCKOUT_VALUE,
  }
  readonly dotSize = new Signal(8)
  readonly showsDotGrid = new Signal(true)
  readonly onion = new Signal(false)
  readonly isPlaying = new Signal(false)
  readonly floating = new Signal<Floating | null>(null)
  readonly selectMode = new Signal<SelectMode>('rect')
  readonly warpMode = new Signal<WarpMode>('push')
  readonly warpSize = new Signal(24)
  readonly warpStrength = new Signal(50)
  readonly tracedPath = new Signal<readonly MotionPoint[] | null>(null)

  readonly pictureVersion = new Signal(0)
  readonly pagesVersion = new Signal(0)
  readonly settingsVersion = new Signal(0)
  readonly historyVersion = new Signal(0)
  readonly inksVersion = new Signal(0)
  readonly floatingVersion = new Signal(0)

  readonly surface: Surface
  readonly planes: Uint8Array[] = []

  private readonly bases: Uint8Array[] = []
  private readonly scratch: Uint32Array
  private readonly onChange: () => void
  private clipboard: PageClipboard | null = null
  private floatClipboard: Floating | null = null
  private allTiles: Uint8Array | null = null
  private loadedPage = -1
  private loadToken = 0
  private editing = false

  patternSource: () => readonly Pattern[] = () => DEVICE_PATTERNS

  constructor(note: Note, options: EditOptions = {}) {
    const { grid, profile } = note

    this.note = note
    this.onChange = options.onChange ?? (() => {})
    this.compositor = new Compositor(note)
    this.scratch = new Uint32Array(grid.count)
    this.penId = new Signal(
      PEN_SETS[profile.id][profile.id === 'free' ? 0 : 1].id,
    )
    this.eraserId = new Signal(
      ERASER_SETS[profile.id][profile.id === 'free' ? 0 : 2].id,
    )
    this.paintId = new Signal(PAINT_SETS[profile.id][0].id)
    this.fitPlanes()
    this.surface = new Surface(grid, this.planes[0])
    this.ink.value = profile.id === 'free' ? 1 : this.defaultDeviceInk()
    void this.openPage(0)
  }

  private fitPlanes(): void {
    const { frames, meta } = this.note
    const pixels = meta.width * meta.height

    while (this.planes.length < frames.layers) {
      this.planes.push(new Uint8Array(pixels))
      this.bases.push(new Uint8Array(pixels))
    }

    this.planes.length = frames.layers
    this.bases.length = frames.layers
  }

  private defaultDeviceInk(): number {
    return this.note.profile.id === 'dsi' ? DSI_PEN_INVERSE : 1
  }

  get usesSmoothLines(): boolean {
    return this.note.profile.id === 'free' && settings.smoothLines.peek()
  }

  get pageCount(): number {
    return this.note.frames.count
  }

  private notifyPicture(): void {
    Signal.bump(this.pictureVersion)
  }

  private notifyPages(): void {
    Signal.bump(this.pagesVersion)
    this.onChange()
  }

  private notifySettings(): void {
    Signal.bump(this.settingsVersion)
    this.onChange()
  }

  private notifyHistory(): void {
    Signal.bump(this.historyVersion)
  }

  private record(step: HistoryStep): void {
    this.history.push(step)
    this.notifyHistory()
  }

  private loadPlanes(page: number): void {
    const { frames, grid, store } = this.note

    for (let layer = 0; layer < frames.layers; layer++) {
      loadPlane(
        store,
        frames.cel(page, layer),
        this.planes[layer],
        grid,
        this.scratch,
      )

      if (this.editing) this.bases[layer].set(this.planes[layer])
    }

    this.loadedPage = page
    this.note.pinPages(PAGE_PIN, page, 1)
  }

  async goTo(page: number): Promise<void> {
    this.dropFloating()
    await this.openPage(page)
  }

  private async openPage(page: number): Promise<void> {
    const token = ++this.loadToken

    while (!this.note.pagesLoaded(this.clampPage(page), 1)) {
      await this.note.ensurePages(this.clampPage(page), 1)

      if (token !== this.loadToken) return
    }

    this.showPage(this.clampPage(page))
  }

  private clampPage(page: number): number {
    return Math.max(0, Math.min(this.pageCount - 1, page))
  }

  get isPageReady(): boolean {
    return this.loadedPage === this.page.peek()
  }

  private showPage(page: number): void {
    const { frames } = this.note
    const before = Math.min(this.page.peek(), frames.count - 1)
    const hasNewInks =
      frames.inks(before) !== frames.inks(page) ||
      frames.paper(before) !== frames.paper(page)

    this.loadPlanes(page)
    this.page.value = page
    this.syncInk()
    this.notifyPicture()

    if (hasNewInks) Signal.bump(this.inksVersion)
  }

  private reloadPage(page: number): void {
    this.loadedPage = -1
    void this.openPage(page)
  }

  restorePlanes(page: number): void {
    void this.openPage(page)
  }

  private syncInk(): void {
    const { profile } = this.note

    if (profile.id === 'dsi') {
      const inks = this.note.frames.inks(this.page.peek())

      this.ink.value = inkOf(inks, this.layer.peek(), 0) || DSI_PEN_INVERSE
    }
  }

  currentPen(): PenSpec {
    return this.findPen(PEN_SETS, this.penId.peek())
  }

  currentEraser(): PenSpec {
    return this.findPen(ERASER_SETS, this.eraserId.peek())
  }

  currentPaint(): PenSpec {
    return this.findPen(PAINT_SETS, this.paintId.peek())
  }

  private findPen(
    sets: Readonly<Record<string, readonly PenSpec[]>>,
    id: string,
  ): PenSpec {
    const set = sets[this.note.profile.id]

    return set.find(spec => spec.id === id) ?? set[0]
  }

  currentPattern(): Pattern {
    const patterns = this.patternSource()

    return (
      patterns.find(pattern => pattern.id === this.patternId.peek()) ??
      patterns[0]
    )
  }

  inkChoices(): InkChoice[] {
    const { meta, profile } = this.note

    if (profile.id === 'free') {
      return meta.palette.map((color, index) => ({ code: index + 1, color }))
    }

    if (profile.id === 'dsi') {
      const paper = this.note.frames.paper(this.page.peek())

      return [DSI_PEN_INVERSE, DSI_PEN_RED, DSI_PEN_BLUE].map(code => ({
        code,
        color: dsiInk(paper, code),
      }))
    }

    return profile.colors.map((color, code) => ({ code, color }))
  }

  currentInkColor(): Rgb {
    const { meta, profile } = this.note
    const ink = this.ink.peek()

    if (profile.id === 'free') return meta.palette[ink - 1] ?? meta.palette[0]

    const paper = this.note.frames.paper(this.page.peek())

    return resolveInk(profile, paper, ink) ?? profile.colors[0]
  }

  pickInk(code: number): void {
    this.ink.value = code

    const { meta, profile } = this.note

    if (profile.id === 'dsi') {
      this.setLayerInk(this.layer.peek(), 0, code)
    } else if (profile.id === '3ds' && meta.oneSheet) {
      this.layer.value = this.sheetLayerOf(code)
    } else if (profile.id === '3ds') {
      this.ensureAdvancedInk(code)
    }
  }

  private sheetLayerOf(color: number): number {
    const layer = N3DS_SHEET_PAIRS.findIndex(pair => pair.includes(color))

    return Math.max(0, layer)
  }

  private sheetSlotOf(color: number): number {
    const pair = N3DS_SHEET_PAIRS[this.sheetLayerOf(color)]

    return pair.indexOf(color)
  }

  private ensureAdvancedInk(color: number): void {
    const page = this.page.peek()
    const layer = this.layer.peek()
    const inks = this.note.frames.inks(page)

    if (inkOf(inks, layer, 0) === color) return
    if (inkOf(inks, layer, 1) === color) return

    this.setLayerInk(layer, 1, color)
  }

  private drawValue(): number {
    const { meta, profile } = this.note
    const ink = this.ink.peek()

    if (profile.id === 'free') return ink
    if (profile.id === 'dsi') return 1

    if (meta.oneSheet) return this.sheetSlotOf(ink) + 1

    const inks = this.note.frames.inks(this.page.peek())

    return inkOf(inks, this.layer.peek(), 1) === ink ? 2 : 1
  }

  setLayerInk(layer: number, slot: number, color: number): void {
    const { frames } = this.note
    const page = this.page.peek()
    const before = frames.inks(page)
    const after = withInk(before, layer, slot, color)

    if (before === after) return

    this.runStep({
      page,
      redo: () => frames.setInks(page, after),
      undo: () => frames.setInks(page, before),
    })
  }

  setPaper(paper: number, all = false): void {
    const { frames } = this.note
    const page = this.page.peek()
    const first = all ? 0 : page
    const last = all ? frames.count - 1 : page
    const before = new Uint8Array(last - first + 1)

    for (let index = first; index <= last; index++) {
      before[index - first] = frames.paper(index)
    }

    this.runStep({
      page,
      bytes: before.byteLength,
      redo: () => {
        for (let index = first; index <= last; index++) {
          frames.setPaper(index, paper)
        }
      },
      undo: () => {
        before.forEach((value, offset) => {
          frames.setPaper(first + offset, value)
        })
      },
    })
  }

  private runStep(step: HistoryStep): void {
    this.dropFloating()

    const wrapped: HistoryStep = {
      page: step.page,
      bytes: step.bytes,
      redo: () => {
        step.redo()
        this.afterChange(step.page)
      },
      undo: () => {
        step.undo()
        this.afterChange(step.undoPage ?? step.page)
      },
    }

    this.history.run(wrapped)
    this.notifyHistory()
  }

  private afterChange(page: number): void {
    this.reloadPage(page)
    this.notifyPages()
    Signal.bump(this.inksVersion)
  }

  replacePages(
    first: number,
    count: number,
    rows: Uint32Array,
    showPage: number,
  ): void {
    const { frames } = this.note
    const before = frames.copyRows(first, count)
    const added = rows.length / frames.stride
    const previous = this.page.peek()

    this.runStep({
      page: showPage,
      undoPage: previous,
      bytes: before.byteLength + rows.byteLength,
      redo: () => {
        frames.removeRows(first, count)
        frames.insertRows(first, rows)
      },
      undo: () => {
        frames.removeRows(first, added)
        frames.insertRows(first, before)
      },
    })
  }

  packPlane(previous: number, plane: Uint8Array): number {
    const { grid, store } = this.note

    this.allTiles ??= new Uint8Array(grid.count).fill(1)

    return updateCel(store, previous, plane, grid, this.allTiles, this.scratch)
  }

  toggleSound(page: number, slot: number): void {
    const { frames } = this.note
    const before = frames.sounds(page)
    const after = before ^ (1 << slot)

    this.runStep({
      page,
      redo: () => frames.setSounds(page, after),
      undo: () => frames.setSounds(page, before),
    })
  }

  moveSound(slot: number, from: number, to: number): void {
    const { frames } = this.note

    if (from === to) return

    const bit = 1 << slot
    const fromMarks = frames.sounds(from)
    const toMarks = frames.sounds(to)

    this.runStep({
      page: this.page.peek(),
      redo: () => {
        frames.setSounds(from, fromMarks & ~bit)
        frames.setSounds(to, toMarks | bit)
      },
      undo: () => {
        frames.setSounds(from, fromMarks)
        frames.setSounds(to, toMarks)
      },
    })
  }

  setBgmOffset(track: Track, offset: number): void {
    const before = track.offset

    if (before === offset) return

    this.runStep({
      page: this.page.peek(),
      redo: () => {
        track.offset = offset
      },
      undo: () => {
        track.offset = before
      },
    })
  }

  setTrackLength(track: Track, length: number | null): void {
    const before = track.length

    if (before === length) return

    this.runStep({
      page: this.page.peek(),
      redo: () => {
        track.length = length
      },
      undo: () => {
        track.length = before
      },
    })
  }

  beginEdit(): Surface | null {
    const { meta, frames, profile } = this.note
    const layer = this.layer.peek()

    if (!this.isPageReady) return null
    if (!meta.layers[layer]?.visible || meta.layers[layer]?.locked) return null

    const surface = this.surface

    this.editing = true
    surface.plane = this.planes[layer]
    surface.value = this.drawValue()
    surface.others = []
    surface.pattern = this.currentPattern()
    surface.phase = profile.patternPhase
    surface.overwrite = this.overwrite.peek()
    surface.masked = false
    surface.alpha = this.coverageOf(this.opacity.peek())
    surface.eraseStrength = this.coverageOf(this.eraserStrength.peek())
    surface.base = this.bases[layer]
    surface.trace = null
    surface.touched.fill(0)
    surface.resetRegion()

    if (profile.id === '3ds' && meta.oneSheet) {
      for (let other = 0; other < frames.layers; other++) {
        if (other !== layer) surface.others.push(this.planes[other])
      }
    }

    for (let index = 0; index < frames.layers; index++) {
      this.bases[index].set(this.planes[index])
    }

    return surface
  }

  private coverageOf(share: number): number {
    if (this.note.profile.id !== 'free') return COVERAGE_FULL

    return Math.max(
      1,
      Math.min(COVERAGE_FULL, Math.round(share * COVERAGE_FULL)),
    )
  }

  restoreBase(): void {
    const { frames } = this.note

    for (let index = 0; index < frames.layers; index++) {
      this.planes[index].set(this.bases[index])
    }
  }

  cancelEdit(): void {
    this.restoreBase()
    this.editing = false
    this.surface.resetRegion()
    this.notifyPicture()
  }

  get isEditing(): boolean {
    return this.editing
  }

  private get isSheet(): boolean {
    const { meta, profile } = this.note

    return profile.id === '3ds' && meta.oneSheet
  }

  selectionLayers(): number[] {
    if (!this.isSheet) return [this.layer.peek()]

    return Array.from({ length: this.note.frames.layers }, (_, index) => index)
  }

  selectionPlanes(): Uint8Array[] {
    return this.selectionLayers().map(layer => this.planes[layer])
  }

  basePlane(plane: Uint8Array): Uint8Array {
    return this.bases[this.planes.indexOf(plane)]
  }

  edgeInks(): InkValue[] {
    return this.note.profile.id === 'free' ? this.inkValues() : []
  }

  get inkValue(): number {
    const value = this.drawValue()

    return this.isSheet ? layeredValue(this.layer.peek(), value) : value
  }

  inkValues(): InkValue[] {
    const { frames, meta, profile } = this.note
    const page = this.page.peek()

    if (profile.id === 'free') {
      return meta.palette.map((color, index) => ({ value: index + 1, color }))
    }

    if (profile.id === 'dsi') return []

    if (this.isSheet) {
      return N3DS_SHEET_PAIRS.flatMap((pair, layer) =>
        pair.map((code, slot) => ({
          value: layeredValue(layer, slot + 1),
          color: profile.colors[code],
        })),
      )
    }

    const layer = this.layer.peek()

    return [0, 1].map(slot => ({
      value: slot + 1,
      color: profile.colors[inkOf(frames.inks(page), layer, slot)],
    }))
  }

  get usesLayeredValues(): boolean {
    return this.isSheet
  }

  lift(mask: Uint8Array): boolean {
    const { width, height } = this.note.meta
    const floating = liftMask(this.selectionPlanes(), width, height, mask)

    if (!floating) return false

    this.markFloating(floating)
    this.floating.value = floating
    this.notifyPicture()

    return true
  }

  liftAll(): 'locked' | 'empty' | null {
    const { width, height } = this.note.meta

    if (this.floating.peek()) return null
    if (!this.beginEdit()) return 'locked'
    if (this.lift(fullMask(width, height))) return null

    this.cancelEdit()

    return 'empty'
  }

  liftDrawing(): boolean {
    const { width, height } = this.note.meta
    const planes = this.selectionPlanes()
    const drawn = planes.map(plane => plane.slice())
    const mask = new Uint8Array(width * height)

    planes.forEach(plane => {
      const base = this.basePlane(plane)

      for (let index = 0; index < mask.length; index++) {
        if (plane[index] !== base[index] && plane[index] !== 0) mask[index] = 1
      }
    })

    this.restoreBase()

    const floating = liftMask(drawn, width, height, mask)

    if (!floating) return false

    this.markFloating(floating)
    this.floating.value = floating
    this.notifyPicture()

    return true
  }

  private markFloating(floating: Floating): void {
    const { width, height } = this.note.meta
    const box = floating.bounds()
    const left = Math.max(0, box.left)
    const top = Math.max(0, box.top)
    const right = Math.min(width - 1, box.right)
    const bottom = Math.min(height - 1, box.bottom)

    if (right >= left && bottom >= top) {
      this.surface.markRegion(left, top, right, bottom)
    }
  }

  private stampOnPage(floating: Floating): void {
    const { width, height } = this.note.meta

    this.markFloating(floating)
    floating.stamp(this.selectionPlanes(), width, height)
  }

  dropFloating(): void {
    const floating = this.floating.peek()

    if (!floating) return

    this.floating.value = null

    if (!this.editing && !this.beginEdit()) return

    this.stampOnPage(floating)
    this.commitEdit()
    this.notifyPicture()
    this.touchFloating()
  }

  stampFloating(): void {
    const floating = this.floating.peek()

    if (!floating) return
    if (!this.editing && !this.beginEdit()) return

    this.stampOnPage(floating)
    this.commitEdit()
    this.beginEdit()
    this.notifyPicture()
  }

  deleteFloating(): void {
    if (!this.floating.peek()) return

    this.floating.value = null

    if (this.editing) this.commitEdit()

    this.notifyPicture()
    this.touchFloating()
  }

  copyFloating(): void {
    this.floatClipboard = this.floating.peek()?.bake() ?? null
  }

  get hasFloatClipboard(): boolean {
    return this.floatClipboard !== null
  }

  placeFloating(floating: Floating): boolean {
    this.dropFloating()

    if (!this.beginEdit()) return false

    this.floating.value = floating
    this.toolId.value = 'select'
    this.touchFloating()

    return true
  }

  pasteFloating(): boolean {
    const clipboard = this.floatClipboard

    return clipboard ? this.placeFloating(clipboard.bake()) : false
  }

  discardFloating(): void {
    if (!this.floating.peek()) return

    this.floating.value = null

    if (this.editing) this.cancelEdit()

    this.touchFloating()
  }

  touchFloating(): void {
    Signal.bump(this.floatingVersion)
  }

  refreshRegion(): void {
    this.notifyPicture()
  }

  commitEdit(): void {
    const { frames, grid, store } = this.note
    const page = this.page.peek()

    this.editing = false

    if (!this.isPageReady) return

    const before: number[] = []
    const after: number[] = []

    for (let layer = 0; layer < frames.layers; layer++) {
      const previous = frames.cel(page, layer)

      before.push(previous)
      after.push(
        updateCel(
          store,
          previous,
          this.planes[layer],
          grid,
          this.surface.touched,
          this.scratch,
        ),
      )
    }

    if (before.every((value, layer) => value === after[layer])) return

    const apply = (cels: number[]): void => {
      cels.forEach((cel, layer) => frames.setCel(page, layer, cel))
    }

    apply(after)
    this.note.pinPages(PAGE_PIN, page, 1)
    this.notifyPages()
    this.record({
      page,
      redo: () => {
        apply(after)
        this.afterChange(page)
      },
      undo: () => {
        apply(before)
        this.afterChange(page)
      },
    })
  }

  undo(): void {
    if (this.floating.peek()) {
      this.discardFloating()

      return
    }

    const step = this.history.undo()

    if (step) this.notifyHistory()
  }

  redo(): void {
    if (this.floating.peek()) {
      this.dropFloating()

      return
    }

    const step = this.history.redo()

    if (step) this.notifyHistory()
  }

  private blankRow(from: number): Uint32Array {
    const { frames } = this.note
    const row = new Uint32Array(frames.stride)
    const attrs = frames.paper(from)

    row[frames.layers] = attrs
    row[frames.layers + 1] = frames.inks(from)
    row[frames.layers + 2] = frames.depths(from)

    return row
  }

  canAddPages(count: number): boolean {
    return this.pageCount + count <= this.note.profile.maxPages
  }

  private insertRows(at: number, rows: Uint32Array, showPage: number): void {
    const { frames } = this.note
    const count = rows.length / frames.stride
    const previousPage = this.page.peek()

    this.runStep({
      page: showPage,
      undoPage: previousPage,
      bytes: rows.byteLength,
      redo: () => frames.insertRows(at, rows),
      undo: () => frames.removeRows(at, count),
    })
  }

  addPages(count = 1): boolean {
    if (!this.canAddPages(count)) return false

    const page = this.page.peek()
    const blank = this.blankRow(page)
    const rows = new Uint32Array(blank.length * count)

    for (let index = 0; index < count; index++) {
      rows.set(blank, index * blank.length)
    }

    this.insertRows(page + 1, rows, page + 1)

    return true
  }

  duplicatePage(): boolean {
    if (!this.canAddPages(1)) return false

    const page = this.page.peek()

    this.insertRows(page + 1, this.note.frames.copyRows(page, 1), page + 1)

    return true
  }

  deletePage(): void {
    const { frames } = this.note
    const page = this.page.peek()

    if (frames.count === 1) {
      this.clearPage()

      return
    }

    const rows = frames.copyRows(page, 1)
    const nextPage = Math.min(page, frames.count - 2)

    this.runStep({
      page: nextPage,
      undoPage: page,
      bytes: rows.byteLength,
      redo: () => {
        frames.removeRows(page, 1)
      },
      undo: () => {
        frames.insertRows(page, rows)
      },
    })
  }

  goToFirstAndClear(): void {
    const { frames } = this.note
    const rows = frames.copyRows(0, 1)

    rows.fill(EMPTY_REF, 0, frames.layers)
    frames.clearRowSounds(rows)
    this.dropFloating()
    this.replacePages(0, frames.count, rows, 0)
  }

  clearPage(): void {
    const { frames } = this.note
    const page = this.page.peek()
    const before = frames.copyRows(page, 1)
    const after = before.slice()

    after.fill(EMPTY_REF, 0, frames.layers)

    this.runStep({
      page,
      bytes: before.byteLength + after.byteLength,
      redo: () => {
        frames.removeRows(page, 1)
        frames.insertRows(page, after)
      },
      undo: () => {
        frames.removeRows(page, 1)
        frames.insertRows(page, before)
      },
    })
  }

  clearLayer(): void {
    const { frames } = this.note
    const page = this.page.peek()
    const layer = this.layer.peek()
    const before = frames.cel(page, layer)

    if (before === EMPTY_REF) return

    this.runStep({
      page,
      redo: () => frames.setCel(page, layer, EMPTY_REF),
      undo: () => frames.setCel(page, layer, before),
    })
  }

  movePage(from: number, to: number): void {
    const { frames } = this.note

    if (from === to) return

    this.runStep({
      page: to,
      redo: () => frames.moveRows(from, 1, to),
      undo: () => frames.moveRows(to, 1, from),
    })
  }

  copyPage(): void {
    this.clipboard = { rows: this.note.frames.copyRows(this.page.peek(), 1) }
  }

  get hasPageClipboard(): boolean {
    return this.clipboard !== null
  }

  pastePage(): boolean {
    if (!this.clipboard || !this.canAddPages(1)) return false

    const page = this.page.peek()

    this.insertRows(page + 1, this.clipboard.rows.slice(), page + 1)

    return true
  }

  setSpeed(speed: number): void {
    this.note.meta.speed = speed
    this.notifySettings()
  }

  setTitle(title: string): void {
    this.note.meta.title = title
    this.notifySettings()
  }

  setLoop(isLooping: boolean): void {
    this.note.meta.loop = isLooping
    this.notifySettings()
  }

  touchSettings(): void {
    this.notifySettings()
    this.compositor.invalidate()
    this.notifyPicture()
  }

  private runLayerStep(
    redo: () => void,
    undo: () => void,
    bytes?: number,
  ): void {
    this.dropFloating()

    const apply = (change: () => void): void => {
      change()
      this.fitPlanes()
      this.reloadPage(this.page.peek())
      this.touchSettings()
      this.notifyPages()
    }

    this.history.run({
      page: this.page.peek(),
      bytes,
      redo: () => apply(redo),
      undo: () => apply(undo),
    })
    this.notifyHistory()
  }

  addLayer(): boolean {
    const { frames, meta, profile } = this.note

    if (frames.layers >= profile.maxLayers) return false

    const at = this.layer.peek()
    let entry: LayerInfo = {
      name: String.fromCharCode(65 + frames.layers),
      visible: true,
      locked: false,
    }

    this.runLayerStep(
      () => {
        frames.insertLayer(at)
        meta.layers.splice(at, 0, entry)
        this.layer.value = at
      },
      () => {
        frames.removeLayer(at)
        entry = meta.layers.splice(at, 1)[0] ?? entry
        this.layer.value = Math.min(at, frames.layers - 1)
      },
    )

    return true
  }

  removeLayer(): boolean {
    const { frames, meta, profile } = this.note

    if (frames.layers <= profile.minLayers) return false

    const at = this.layer.peek()
    const cels = new Uint32Array(frames.count)
    let entry = meta.layers[at]

    this.runLayerStep(
      () => {
        for (let page = 0; page < cels.length; page++) {
          cels[page] = frames.cel(page, at)
        }

        frames.removeLayer(at)
        entry = meta.layers.splice(at, 1)[0] ?? entry
        this.layer.value = Math.min(at, frames.layers - 1)
      },
      () => {
        frames.insertLayer(at)

        for (let page = 0; page < cels.length; page++) {
          frames.setCel(page, at, cels[page])
        }

        meta.layers.splice(at, 0, entry)
        this.layer.value = at
      },
      cels.byteLength,
    )

    return true
  }

  moveLayer(layer: number, direction: -1 | 1): void {
    const { frames, meta } = this.note
    const other = layer + direction

    if (other < 0 || other >= frames.layers) return

    const swap = (selected: number): void => {
      const held = meta.layers[layer]

      meta.layers[layer] = meta.layers[other]
      meta.layers[other] = held
      frames.swapLayers(layer, other)
      this.layer.value = selected
    }

    this.runLayerStep(
      () => swap(other),
      () => swap(layer),
    )
  }

  setOneSheet(isOneSheet: boolean): void {
    const { meta, profile } = this.note

    if (profile.id !== '3ds') return

    meta.oneSheet = isOneSheet
    this.note.frames.setInks(this.page.peek(), defaultInks(profile, isOneSheet))
    this.touchSettings()
  }

  paperColor(page = this.page.peek()): string {
    const { profile } = this.note
    const paper = this.note.frames.paper(page)

    return rgbCss(profile.papers[paper] ?? profile.papers[0])
  }

  pickColorAt(x: number, y: number): number | null {
    const { frames, meta, profile } = this.note
    const index = y * meta.width + x

    if (profile.id !== 'free') return null

    for (let layer = 0; layer < frames.layers; layer++) {
      if (meta.layers[layer].visible && this.planes[layer][index]) {
        return valueInk(this.planes[layer][index])
      }
    }

    return null
  }

  get loadedPlanesPage(): number {
    return this.loadedPage
  }
}
