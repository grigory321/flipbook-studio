import type { Editor } from '../../app/editor.ts'
import { Floating } from '../../app/floating.ts'
import { BASIC_FONTS, type FontChoice, prepareFont } from '../../app/fonts.ts'
import { scaleDots, styleGlyphs } from '../../app/text-art.ts'
import { KNOCKOUT_VALUE } from '../../core/ink.ts'
import type { EdgeSpec } from '../../draw/edge.ts'
import { t } from '../../i18n/index.ts'
import { sliderRow, toggleRow } from '../controls.ts'
import { fill, h, icon, key } from '../dom.ts'
import { openDialog } from '../overlay.ts'
import { edgePicker } from './edge-picker.ts'
import { FloatPainter } from './float-paint.ts'
import { fontLabel, openFontPicker } from './font-dialog.ts'

interface TextSpec {
  text: string
  size: number
  font: FontChoice
  isBold: boolean
  isVertical: boolean
  dot: number
  edge: EdgeSpec
}

const SIZE_MIN = 10
const SIZE_MAX = 96
const DOT_MAX = 6
const LINE_GAP = 1.3
const SOLID_ALPHA = 128
const MIN_GLYPH = 5

const SIDEWAYS = /[ーｰ〜～…‥（）()「」『』【】〔〕—―-]/
const CORNER = /[、。，．]/

interface GlyphMask {
  mask: Uint8Array
  width: number
  height: number
}

type TextContext = OffscreenCanvasRenderingContext2D

function fontOf(spec: TextSpec): string {
  const size = Math.max(MIN_GLYPH, Math.round(spec.size / spec.dot))

  return `${spec.isBold ? 700 : 400} ${size}px ${spec.font.family}`
}

function glyphSize(spec: TextSpec): number {
  return Math.max(MIN_GLYPH, Math.round(spec.size / spec.dot))
}

function newContext(
  width: number,
  height: number,
  font: string,
): TextContext | null {
  const canvas = new OffscreenCanvas(Math.max(1, width), Math.max(1, height))
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (context) context.font = font

  return context
}

function drawHorizontal(
  spec: TextSpec,
  lines: string[],
  pad: number,
): TextContext | null {
  const measure = newContext(1, 1, fontOf(spec))

  if (!measure) return null

  const widest = lines.map(line => measure.measureText(line).width)
  const lineHeight = Math.ceil(glyphSize(spec) * LINE_GAP)
  const width = Math.ceil(Math.max(...widest)) + 2 + pad * 2
  const height = lineHeight * lines.length + pad * 2
  const context = newContext(width, height, fontOf(spec))

  if (!context) return null

  context.textBaseline = 'middle'

  lines.forEach((line, index) => {
    context.fillText(line, pad + 1, pad + lineHeight * (index + 0.5))
  })

  return context
}

function drawVertical(
  spec: TextSpec,
  lines: string[],
  pad: number,
): TextContext | null {
  const size = glyphSize(spec)
  const columnWidth = Math.ceil(size * LINE_GAP)
  const longest = Math.max(...lines.map(line => [...line].length))
  const width = columnWidth * lines.length + pad * 2
  const height = size * longest + 2 + pad * 2
  const context = newContext(width, height, fontOf(spec))

  if (!context) return null

  context.textAlign = 'center'
  context.textBaseline = 'middle'

  lines.forEach((line, column) => {
    const x = width - pad - columnWidth * (column + 0.5)

    ;[...line].forEach((letter, index) => {
      const y = pad + size * (index + 0.5) + 1

      context.save()
      context.translate(x, y)

      if (SIDEWAYS.test(letter)) context.rotate(Math.PI / 2)

      const nudge = CORNER.test(letter) ? size * 0.3 : 0

      context.fillText(letter, nudge, -nudge)
      context.restore()
    })
  })

  return context
}

function glyphMask(spec: TextSpec, pad: number): GlyphMask | null {
  const lines = spec.text.split('\n')
  const context = spec.isVertical
    ? drawVertical(spec, lines, pad)
    : drawHorizontal(spec, lines, pad)

  if (!context) return null

  const { width, height } = context.canvas
  const { data } = context.getImageData(0, 0, width, height)
  const mask = new Uint8Array(width * height)

  for (let index = 0; index < mask.length; index++) {
    if (data[index * 4 + 3] >= SOLID_ALPHA) mask[index] = 1
  }

  return { mask, width, height }
}

function renderText(
  spec: TextSpec,
  ink: number,
  isLayered: boolean,
  center: readonly [number, number],
): Floating | null {
  const hasEdge = spec.edge.style !== 'none'
  const edgeWidth = hasEdge
    ? Math.max(1, Math.round(spec.edge.width / spec.dot))
    : 0
  const glyphs = glyphMask(spec, edgeWidth + 1)

  if (!glyphs) return null

  const { mask, width, height } = glyphs
  const styled = styleGlyphs(
    mask,
    width,
    height,
    { ...spec.edge, width: edgeWidth },
    ink,
  )

  return new Floating(
    scaleDots(styled, width, height, spec.dot),
    width * spec.dot,
    height * spec.dot,
    center[0],
    center[1],
    isLayered,
  )
}

function showPreview(
  canvas: HTMLCanvasElement,
  floating: Floating | null,
  painter: FloatPainter,
): void {
  const context = canvas.getContext('2d')

  if (!floating || !context) return

  const { sourceWidth, sourceHeight, pixels } = floating

  canvas.width = sourceWidth
  canvas.height = sourceHeight

  const image = context.createImageData(sourceWidth, sourceHeight)
  const words = new Uint32Array(image.data.buffer)
  const colors = new Map<number, number>()

  pixels.forEach((value, index) => {
    if (value === 0) return

    const color = colors.get(value) ?? painter.colorOf(floating, value)

    colors.set(value, color)
    words[index] = color
  })

  context.putImageData(image, 0, 0)
}

export function openTextDialog(
  editor: Editor,
  initial?: TextSpec,
  editing?: Floating,
): void {
  const { meta } = editor.note
  const painter = new FloatPainter(editor)
  const inks = editor.inkValues()
  const spec: TextSpec = initial ?? {
    text: '',
    size: 24,
    font: BASIC_FONTS[0],
    isBold: true,
    isVertical: false,
    dot: 1,
    edge: { style: 'none', width: 2, second: KNOCKOUT_VALUE },
  }

  const preview = h('canvas', {
    class: 'text-preview',
    style: `background-color:${editor.paperColor()}`,
  })

  const center = (): readonly [number, number] =>
    editing?.center ?? [meta.width / 2, meta.height / 2]

  const draw = (): Floating | null =>
    renderText(spec, editor.inkValue, editor.usesLayeredValues, center())

  let refreshToken = 0

  const refresh = async (): Promise<void> => {
    const token = ++refreshToken

    if (!spec.text) return

    await prepareFont(spec.font, fontOf(spec))

    if (token === refreshToken) showPreview(preview, draw(), painter)
  }

  const change = (): void => {
    void refresh()
  }

  const input: HTMLTextAreaElement = h('textarea', {
    class: 'text-input text-area',
    rows: 3,
    maxlength: 200,
    'data-nav': true,
    'data-autofocus': true,
    'aria-label': t('text.input'),
    placeholder: t('text.placeholder'),
    onInput: () => {
      spec.text = input.value
      change()
    },
  })

  input.value = spec.text

  const fontButton = h('button', {
    class: 'font-button',
    type: 'button',
    'data-nav': true,
    onClick: () =>
      openFontPicker(spec.font, font => {
        spec.font = font
        renderFont()
        change()
      }),
  })

  const renderFont = (): void => {
    fill(
      fontButton,
      icon('text'),
      h('span', { class: 'font-button-name' }, fontLabel(spec.font)),
      icon('forward'),
    )
  }

  renderFont()

  const edge = edgePicker({
    label: t('text.edge'),
    edge: spec.edge,
    inks,
    ink: editor.inkValue,
    paper: editor.paperColor(),
    onChange: change,
  })

  const place = async (): Promise<void> => {
    const text = spec.text.replace(/\s+$/, '')

    dialog.close()

    if (!text) return

    const placed = { ...spec, text, edge: { ...spec.edge } }

    await prepareFont(placed.font, fontOf(placed))

    const floating = renderText(
      placed,
      editor.inkValue,
      editor.usesLayeredValues,
      center(),
    )

    if (!floating) return

    floating.retouch = () => openTextDialog(editor, placed, floating)

    if (editing) editor.discardFloating()

    editor.placeFloating(floating)
  }

  const dialog = openDialog({
    title: t('tool.text'),
    icon: 'text',
    isWide: true,
    body: [
      input,
      preview,
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, t('text.font')),
        fontButton,
      ),
      sliderRow(
        t('text.size'),
        spec.size,
        { min: SIZE_MIN, max: SIZE_MAX },
        value => {
          spec.size = value
          change()
        },
      ),
      sliderRow(t('text.dot'), spec.dot, { min: 1, max: DOT_MAX }, value => {
        spec.dot = value
        change()
      }),
      edge,
      toggleRow(t('text.bold'), spec.isBold, value => {
        spec.isBold = value
        change()
      }),
      toggleRow(t('text.vertical'), spec.isVertical, value => {
        spec.isVertical = value
        change()
      }),
    ],
    footer: key({
      icon: 'check',
      label: t('text.place'),
      variant: 'primary',
      onPress: () => void place(),
    }),
  })

  change()
}
