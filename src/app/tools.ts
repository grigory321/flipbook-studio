import { valueInk } from '../core/ink.ts'
import { PATTERN_SOLID } from '../core/patterns.ts'
import type { Surface } from '../core/surface.ts'
import { DEVICE_STACK_LIMIT, fillSoftEdges, floodFill } from '../draw/flood.ts'
import { dsiRandomState, DsiPen, seedDsiRandom } from '../draw/pen-dsi.ts'
import {
  loadN3dsRandom,
  N3dsKind,
  n3dsPenIndex,
  N3dsPen,
  saveN3dsRandom,
} from '../draw/pen-3ds.ts'
import {
  connectedMask,
  fillPolygon,
  polygonMask,
  rectMask,
} from '../draw/mask.ts'
import { FreePen } from '../draw/pen-free.ts'
import {
  fillOutline,
  type Point,
  shapePoints,
  type ShapeKind,
} from '../draw/shapes.ts'
import { EdgeTracer } from '../draw/edge.ts'
import { WarpField } from '../draw/warp.ts'
import type { Editor } from './editor.ts'
import type { FloatHandle, Floating, FloatPoint } from './floating.ts'
import { addMyShape } from './my-library.ts'
import { settings } from './settings.ts'
import {
  type ExactPoint,
  type PenSpec,
  startStroke,
  type Stroke,
  type StrokeKind,
} from './pens.ts'

export interface ToolPoint {
  x: number
  y: number
  exactX?: number
  exactY?: number
  pressure: number
  isConstrained: boolean
  time: number
  reach: number
  stem: number
}

export type ToolRefusal = 'locked' | 'empty' | null

export interface Tool {
  readonly id: string
  readonly icon: string
  readonly nameKey?: string
  readonly name?: string
  readonly key?: string
  readonly order: number
  readonly options:
    | 'pen'
    | 'paint'
    | 'eraser'
    | 'fill'
    | 'shape'
    | 'select'
    | 'warp'
    | 'dot'
    | 'none'
  readonly usesSurface?: boolean
  activate?(): void
  down(editor: Editor, point: ToolPoint): ToolRefusal
  move(editor: Editor, point: ToolPoint): void
  up(editor: Editor, point: ToolPoint): void
  tick?(editor: Editor, now: number): void
  readonly currentPath?: readonly FloatPoint[]
  cancel?(editor: Editor): void
}

class StrokeTool implements Tool {
  readonly id: string
  readonly icon: string
  readonly nameKey: string
  readonly key: string
  readonly order: number
  readonly options: 'pen' | 'paint' | 'eraser'

  private readonly kind: StrokeKind
  private stroke: Stroke | null = null
  private edge: EdgeTracer | null = null

  constructor(
    id: string,
    icon: string,
    key: string,
    order: number,
    kind: StrokeKind,
  ) {
    this.id = id
    this.icon = icon
    this.nameKey = `tool.${id}`
    this.key = key
    this.order = order
    this.kind = kind
    this.options = kind
  }

  private specFor(editor: Editor): PenSpec {
    if (this.kind === 'pen') return editor.currentPen()
    if (this.kind === 'eraser') return editor.currentEraser()

    return editor.currentPaint()
  }

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const surface = editor.beginEdit()

    if (!surface) return 'locked'

    if (this.kind === 'paint' && editor.isBucket.peek()) {
      fillBucket(editor, surface, point)
      editor.commitEdit()

      return null
    }

    const hasEdge = this.kind === 'pen' && editor.penEdge.style !== 'none'

    this.edge = hasEdge ? new EdgeTracer(surface, editor.penEdge) : null
    this.stroke = startStroke({
      surface,
      spec: this.specFor(editor),
      kind: this.kind,
      size:
        this.kind === 'eraser' ? editor.eraserSize.peek() : editor.size.peek(),
      patternErase: this.kind === 'eraser' && editor.patternErase.peek(),
      x: point.x,
      y: point.y,
      exact: exactOf(point),
      pressure: point.pressure,
      now: point.time,
      isSmooth: editor.usesSmoothLines,
      usesPressure: settings.penPressure.peek(),
    })
    this.edge?.update()

    return null
  }

  move(_editor: Editor, point: ToolPoint): void {
    this.stroke?.move(point.x, point.y, point.pressure, exactOf(point))
    this.edge?.update()
  }

  tick(_editor: Editor, now: number): void {
    this.stroke?.tick(now)
    this.edge?.update()
  }

  up(editor: Editor, point: ToolPoint): void {
    if (!this.stroke) return

    this.stroke.finish(point.x, point.y, exactOf(point))
    this.stroke = null
    this.edge?.finish()
    this.edge = null
    editor.commitEdit()
  }

  cancel(editor: Editor): void {
    if (!this.stroke) return

    this.stroke = null
    this.edge = null
    editor.cancelEdit()
  }
}

class FillTool implements Tool {
  readonly id = 'fill'
  readonly icon = 'bucket'
  readonly nameKey = 'tool.fill'
  readonly key = 'f'
  readonly order = 35
  readonly options = 'fill'

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const surface = editor.beginEdit()

    if (!surface) return 'locked'

    surface.pattern = PATTERN_SOLID
    fillBucket(editor, surface, point)
    editor.commitEdit()

    return null
  }

  move(): void {}

  up(): void {}
}

function exactOf(point: ToolPoint): ExactPoint {
  return [point.exactX ?? point.x, point.exactY ?? point.y]
}

function fillBucket(editor: Editor, surface: Surface, point: ToolPoint): void {
  const { frames, meta, profile } = editor.note
  const isDevice = profile.id !== 'free'
  const isOneSheet = profile.id === '3ds' && meta.oneSheet
  const layers: Uint8Array[] = []

  if (isOneSheet || !isDevice) {
    for (let layer = 0; layer < frames.layers; layer++) {
      if (meta.layers[layer].visible) layers.push(editor.planes[layer])
    }
  } else {
    layers.push(surface.plane)
  }

  floodFill(
    surface,
    point.x,
    point.y,
    layers,
    isDevice ? DEVICE_STACK_LIMIT : Infinity,
  )

  if (!isDevice) fillSoftEdges(surface)
}

const ROTATE_SNAP = Math.PI / 12

class FloatGrip {
  private held: FloatHandle | 'body' | null = null
  private lastX = 0
  private lastY = 0

  press(floating: Floating, point: ToolPoint, anywhere = false): boolean {
    const handle = floating.handleAt(point.x, point.y, point.reach, point.stem)

    if (handle) this.held = handle
    else if (anywhere || floating.contains(point.x, point.y)) this.held = 'body'
    else return false

    this.lastX = point.x
    this.lastY = point.y

    return true
  }

  drag(editor: Editor, point: ToolPoint): boolean {
    const floating = editor.floating.peek()

    if (!this.held || !floating) return false

    if (this.held === 'body') {
      floating.moveBy(point.x - this.lastX, point.y - this.lastY)
    } else if (this.held === 'rotate') {
      floating.rotateTo(rotationTo(floating, point))
    } else {
      floating.dragHandle(this.held, point.x, point.y)
    }

    this.lastX = point.x
    this.lastY = point.y
    editor.touchFloating()

    return true
  }

  release(): boolean {
    const wasHolding = this.held !== null

    this.held = null

    return wasHolding
  }
}

function rotationTo(floating: Floating, point: ToolPoint): number {
  const [centerX, centerY] = floating.center
  const angle = Math.atan2(point.y - centerY, point.x - centerX) + Math.PI / 2

  return point.isConstrained
    ? Math.round(angle / ROTATE_SNAP) * ROTATE_SNAP
    : angle
}

class ShapeTool implements Tool {
  readonly id = 'shape'
  readonly icon = 'shape'
  readonly nameKey = 'tool.shape'
  readonly key = 'l'
  readonly order = 40
  readonly options = 'shape'

  private readonly grip = new FloatGrip()
  private tracePath: FloatPoint[] = []
  private isActive = false
  private startX = 0
  private startY = 0
  private endX = 0
  private endY = 0
  private isConstrained = false
  private randomState: ReturnType<typeof saveN3dsRandom> | null = null
  private dsiSeed = 0

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const floating = editor.floating.peek()

    if (floating && this.grip.press(floating, point)) return null

    if (floating) editor.dropFloating()

    if (editor.isTracingShape.peek()) {
      this.tracePath = [[point.x, point.y]]

      return null
    }

    if (!editor.beginEdit()) return 'locked'

    this.isActive = true
    this.startX = this.endX = point.x
    this.startY = this.endY = point.y
    this.isConstrained = point.isConstrained
    this.randomState = saveN3dsRandom()
    this.dsiSeed = dsiRandomState()
    this.render(editor)

    return null
  }

  get currentPath(): readonly FloatPoint[] {
    return this.tracePath
  }

  move(editor: Editor, point: ToolPoint): void {
    if (this.tracePath.length > 0) {
      this.tracePath.push([point.x, point.y])
      editor.touchFloating()

      return
    }

    if (this.grip.drag(editor, point) || !this.isActive) return

    this.endX = point.x
    this.endY = point.y
    this.isConstrained = point.isConstrained
    this.render(editor)
  }

  up(editor: Editor): void {
    if (this.tracePath.length > 0) {
      this.finishTrace(editor)

      return
    }

    if (this.grip.release() || !this.isActive) return

    this.isActive = false

    if (!editor.liftDrawing()) editor.cancelEdit()
  }

  private finishTrace(editor: Editor): void {
    const id = addMyShape(this.tracePath)

    this.tracePath = []
    editor.touchFloating()

    if (!id) return

    editor.shape.value = id
    editor.isTracingShape.value = false
  }

  cancel(editor: Editor): void {
    this.grip.release()
    this.tracePath = []

    if (!this.isActive) return

    this.isActive = false
    editor.cancelEdit()
  }

  private render(editor: Editor): void {
    const surface = editor.surface
    const { left, top, right, bottom } = surface

    editor.restoreBase()

    if (right >= left) surface.markRegion(left, top, right, bottom)

    if (this.randomState) loadN3dsRandom(this.randomState)

    seedDsiRandom(this.dsiSeed)

    drawShape(
      surface,
      editor.currentPen(),
      editor.size.peek(),
      editor.shape.peek(),
      [this.startX, this.startY],
      [this.endX, this.endY],
      this.isConstrained,
      editor.shapeFilled.peek(),
      editor.usesSmoothLines,
    )
  }
}

export function drawShape(
  surface: Surface,
  spec: PenSpec,
  size: number,
  kind: ShapeKind,
  start: Point,
  end: Point,
  isConstrained: boolean,
  isFilled: boolean,
  isSmooth = false,
): void {
  const points = shapePoints(
    kind,
    start[0],
    start[1],
    end[0],
    end[1],
    isConstrained,
  )

  if (kind === 'rect' || kind === 'oval') {
    if (isFilled) fillOutline(points, (x, y) => surface.plot(x, y))
  } else if (isFilled && kind !== 'line') {
    fillPolygon(points, (left, right, y) => {
      for (let x = left; x <= right; x++) surface.plot(x, y)
    })
  }

  if (spec.engine === 'free') {
    drawFreeShape(surface, spec, size, kind, points, isSmooth)
  } else if (spec.engine === 'dsi') {
    drawDsiShape(surface, spec, kind, points, start)
  } else {
    drawN3dsShape(surface, spec, kind, points, start, end)
  }
}

function drawFreeShape(
  surface: Surface,
  spec: PenSpec,
  size: number,
  kind: ShapeKind,
  points: readonly Point[],
  isSmooth: boolean,
): void {
  if (points.length === 0) return

  const pen = new FreePen(surface, spec.style ?? 'round', 'draw', size, {
    isSmooth,
    isStraight: true,
    usesPressure: false,
  })

  if (kind === 'oval') {
    for (const [x, y] of points) pen.begin(x, y, 1)

    return
  }

  pen.begin(points[0][0], points[0][1], 1)

  for (const [x, y] of points) pen.move(x, y, 1)
}

function drawDsiShape(
  surface: Surface,
  spec: PenSpec,
  kind: ShapeKind,
  points: readonly Point[],
  center: Point,
): void {
  const path =
    kind === 'oval'
      ? [...points].sort(
          (a, b) =>
            Math.atan2(a[1] - center[1], a[0] - center[0]) -
            Math.atan2(b[1] - center[1], b[0] - center[0]),
        )
      : [...points]

  if (path.length === 0) path.push(center)
  if (kind === 'oval') path.push(path[0])

  const pen = new DsiPen(surface, spec.code)

  pen.down(path[0][0], path[0][1])
  pen.isStarting = true
  pen.lineTo(path[0][0], path[0][1])

  path.forEach(([x, y], index) => {
    pen.isStarting = index < 4
    pen.lineTo(x, y)
  })
}

function drawN3dsShape(
  surface: Surface,
  spec: PenSpec,
  kind: ShapeKind,
  points: readonly Point[],
  start: Point,
  end: Point,
): void {
  const tip = n3dsPenIndex(spec.code)
  const pen = new N3dsPen(surface, N3dsKind.pen, tip)

  if (pen.isBrushLarge && kind === 'line') {
    pen.taper(start[0], start[1], end[0], end[1])

    return
  }

  if (kind === 'oval') {
    for (const [x, y] of points) {
      pen.begin(x, y)
      pen.point(x, y)
    }

    return
  }

  if (points.length === 0) return

  pen.begin(points[0][0], points[0][1])

  points.forEach(([x, y], index) => {
    if (index === 0) pen.point(x, y)
    else pen.step(x, y)
  })
}

const MIN_DRAG = 2
const SWELL_REPEAT_MS = 90
const STRENGTH_SCALE = 100

class SelectTool implements Tool {
  readonly id = 'select'
  readonly icon = 'select'
  readonly nameKey = 'tool.select'
  readonly key = 's'
  readonly order = 50
  readonly options = 'select'

  private readonly grip = new FloatGrip()
  private path: FloatPoint[] = []
  private startX = 0
  private startY = 0
  private isDragging = false

  get currentPath(): readonly FloatPoint[] {
    return this.path
  }

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const floating = editor.floating.peek()

    if (floating && this.grip.press(floating, point)) return null

    if (floating) editor.dropFloating()

    if (!editor.beginEdit()) return 'locked'

    this.isDragging = true
    this.startX = point.x
    this.startY = point.y
    this.path = [[point.x, point.y]]

    return null
  }

  move(editor: Editor, point: ToolPoint): void {
    if (this.grip.drag(editor, point)) return

    if (this.isDragging) {
      this.path.push([point.x, point.y])
      editor.touchFloating()
    }
  }

  up(editor: Editor, point: ToolPoint): void {
    if (this.grip.release() || !this.isDragging) return

    this.isDragging = false

    const mask = this.maskFor(editor, point)

    if (!mask || !editor.lift(mask)) editor.cancelEdit()

    this.path = []
    editor.touchFloating()
  }

  private maskFor(editor: Editor, point: ToolPoint): Uint8Array | null {
    const { width, height } = editor.note.meta
    const mode = editor.selectMode.peek()

    if (mode === 'wand') {
      return connectedMask(
        editor.selectionPlanes(),
        width,
        height,
        point.x,
        point.y,
      )
    }

    const moved = Math.max(
      Math.abs(point.x - this.startX),
      Math.abs(point.y - this.startY),
    )

    if (moved < MIN_DRAG && this.path.length < MIN_DRAG) return null

    if (mode === 'lasso') return polygonMask(this.path, width, height)

    return rectMask(width, height, this.startX, this.startY, point.x, point.y)
  }

  cancel(): void {
    this.grip.release()
    this.isDragging = false
    this.path = []
  }
}

class MoveTool implements Tool {
  readonly id = 'move'
  readonly icon = 'move'
  readonly nameKey = 'tool.move'
  readonly key = 'm'
  readonly order = 70
  readonly options = 'none'
  readonly usesSurface = false

  private readonly grip = new FloatGrip()

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const refusal = editor.liftAll()

    if (refusal) return refusal

    const floating = editor.floating.peek()

    if (floating) this.grip.press(floating, point, true)

    return null
  }

  move(editor: Editor, point: ToolPoint): void {
    this.grip.drag(editor, point)
  }

  up(): void {
    this.grip.release()
  }

  cancel(): void {
    this.grip.release()
  }
}

class PathTool implements Tool {
  readonly id = 'path'
  readonly icon = 'path'
  readonly nameKey = 'tool.path'
  readonly order = 80
  readonly options = 'none'
  readonly usesSurface = false

  private path: FloatPoint[] = []

  get currentPath(): readonly FloatPoint[] {
    return this.path
  }

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const refusal = editor.liftAll()

    if (refusal) return refusal

    this.path = [[point.x, point.y]]

    return null
  }

  move(editor: Editor, point: ToolPoint): void {
    this.path.push([point.x, point.y])
    editor.touchFloating()
  }

  up(editor: Editor): void {
    const [startX, startY] = this.path[0] ?? [0, 0]
    const reach = this.path.reduce(
      (most, [x, y]) =>
        Math.max(most, Math.abs(x - startX), Math.abs(y - startY)),
      0,
    )

    if (reach >= MIN_PATH_REACH) editor.tracedPath.value = this.path

    this.path = []
    editor.touchFloating()
  }

  cancel(editor: Editor): void {
    this.path = []
    editor.touchFloating()
  }
}

const MIN_PATH_REACH = 8

class WarpTool implements Tool {
  readonly id = 'warp'
  readonly icon = 'warp'
  readonly nameKey = 'tool.warp'
  readonly order = 71
  readonly options = 'warp'

  private field: WarpField | null = null
  private planes: Uint8Array[] = []
  private lastX = 0
  private lastY = 0
  private lastSwell = 0

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const { width, height } = editor.note.meta

    if (!editor.beginEdit()) return 'locked'

    this.field = new WarpField(width, height)
    this.planes = editor.selectionPlanes()
    this.lastX = point.x
    this.lastY = point.y
    this.lastSwell = point.time
    this.swell(editor)

    return null
  }

  private swell(editor: Editor): void {
    const mode = editor.warpMode.peek()

    if (mode === 'push' || !this.field) return

    const amount = editor.warpStrength.peek() / STRENGTH_SCALE
    const box = this.field.swell(
      this.lastX,
      this.lastY,
      editor.warpSize.peek(),
      mode === 'swell' ? amount : -amount,
    )

    this.show(editor, box)
  }

  private show(
    editor: Editor,
    box: { left: number; top: number; right: number; bottom: number },
  ): void {
    for (const plane of this.planes) {
      this.field?.apply(editor.basePlane(plane), plane, box)
    }

    editor.surface.markRegion(box.left, box.top, box.right, box.bottom)
  }

  move(editor: Editor, point: ToolPoint): void {
    if (!this.field) return

    if (editor.warpMode.peek() === 'push') {
      const box = this.field.push(
        this.lastX,
        this.lastY,
        point.x - this.lastX,
        point.y - this.lastY,
        editor.warpSize.peek(),
        editor.warpStrength.peek() / STRENGTH_SCALE,
      )

      this.show(editor, box)
    }

    this.lastX = point.x
    this.lastY = point.y
  }

  tick(editor: Editor, now: number): void {
    if (now - this.lastSwell < SWELL_REPEAT_MS) return

    this.lastSwell = now
    this.swell(editor)
  }

  up(editor: Editor): void {
    if (!this.field) return

    this.field = null
    editor.commitEdit()
  }

  cancel(editor: Editor): void {
    if (!this.field) return

    this.field = null
    editor.cancelEdit()
  }
}

class DotTool implements Tool {
  readonly id = 'dot'
  readonly icon = 'dot'
  readonly nameKey = 'tool.dot'
  readonly key = 'g'
  readonly order = 62
  readonly options = 'dot'

  private isErasing = false
  private lastColumn = 0
  private lastRow = 0
  private isActive = false

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const surface = editor.beginEdit()

    if (!surface) return 'locked'

    const size = editor.dotSize.peek()
    const column = Math.floor(point.x / size)
    const row = Math.floor(point.y / size)
    const x = Math.min(surface.width - 1, Math.max(0, column * size))
    const y = Math.min(surface.height - 1, Math.max(0, row * size))

    const value = surface.plane[y * surface.width + x]

    this.isErasing = value !== 0 && valueInk(value) === valueInk(surface.value)
    this.isActive = true
    this.lastColumn = column
    this.lastRow = row
    this.fillCell(surface, column, row, size)

    return null
  }

  move(editor: Editor, point: ToolPoint): void {
    if (!this.isActive) return

    const size = editor.dotSize.peek()
    const column = Math.floor(point.x / size)
    const row = Math.floor(point.y / size)

    const steps = Math.max(
      Math.abs(column - this.lastColumn),
      Math.abs(row - this.lastRow),
    )

    for (let step = 1; step <= steps; step++) {
      this.fillCell(
        editor.surface,
        Math.round(
          this.lastColumn + ((column - this.lastColumn) * step) / steps,
        ),
        Math.round(this.lastRow + ((row - this.lastRow) * step) / steps),
        size,
      )
    }

    this.lastColumn = column
    this.lastRow = row
  }

  up(editor: Editor): void {
    if (!this.isActive) return

    this.isActive = false
    editor.commitEdit()
  }

  cancel(editor: Editor): void {
    if (!this.isActive) return

    this.isActive = false
    editor.cancelEdit()
  }

  private fillCell(
    surface: Surface,
    column: number,
    row: number,
    size: number,
  ): void {
    for (let y = row * size; y < (row + 1) * size; y++) {
      for (let x = column * size; x < (column + 1) * size; x++) {
        if (this.isErasing) surface.erase(x, y)
        else surface.plot(x, y)
      }
    }
  }
}

class PickerTool implements Tool {
  readonly id = 'picker'
  readonly icon = 'picker'
  readonly nameKey = 'tool.picker'
  readonly key = 'i'
  readonly order = 90
  readonly options = 'none'
  readonly usesSurface = false

  down(editor: Editor, point: ToolPoint): ToolRefusal {
    const value = editor.pickColorAt(point.x, point.y)

    if (value) editor.pickInk(value)

    return null
  }

  move(editor: Editor, point: ToolPoint): void {
    this.down(editor, point)
  }

  up(): void {}
}

export function builtinTools(): Tool[] {
  return [
    new StrokeTool('pen', 'pen', 'p', 10, 'pen'),
    new StrokeTool('paint', 'paint', 'b', 20, 'paint'),
    new StrokeTool('eraser', 'eraser', 'e', 30, 'eraser'),
    new FillTool(),
    new ShapeTool(),
    new SelectTool(),
    new MoveTool(),
    new WarpTool(),
    new PathTool(),
    new DotTool(),
    new PickerTool(),
  ]
}
