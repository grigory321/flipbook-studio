import type { Editor, SelectMode, WarpMode } from '../../app/editor.ts'
import {
  ERASER_SETS,
  PAINT_SETS,
  PEN_SETS,
  type PenSpec,
} from '../../app/pens.ts'
import type { Tool } from '../../app/tools.ts'
import {
  isMyPattern,
  removeMyPattern,
  removeMyShape,
} from '../../app/my-library.ts'
import { settings } from '../../app/settings.ts'
import { inkOf } from '../../core/frames.ts'
import { rgbCss } from '../../core/profile.ts'
import { Signal } from '../../core/signal.ts'
import { isMyShape, type ShapeKind, SHAPE_KINDS } from '../../draw/shapes.ts'
import { t, type MessageKey } from '../../i18n/index.ts'
import { registries } from '../../plugin/host.ts'
import {
  settingSlider,
  settingToggle,
  sliderRow,
  toggleRow,
} from '../controls.ts'
import { type Child, fill, h, icon, key, Scope } from '../dom.ts'
import { playSfx } from '../sfx.ts'
import { edgePicker } from './edge-picker.ts'
import { openPatternEditor } from './pattern-dialog.ts'
import { penPreview, patternPreview, shapePreview } from './previews.ts'

const SIZE_STEPS = [1, 2, 3, 5, 8, 12, 20, 32]
const PERCENT_RANGE = {
  min: 10,
  max: 100,
  step: 10,
  format: (value: number) => `${value}%`,
}
const DOT_STEPS = [1, 2, 4, 8, 16, 24, 32, 64]

type PenBox = 'basic' | 'pro' | 'art'

const BOX_LABELS: Readonly<Record<PenBox, MessageKey>> = {
  basic: 'pen.boxBasic',
  pro: 'pen.boxPro',
  art: 'pen.boxArt',
}

function boxOf(spec: PenSpec): PenBox {
  if (spec.isArt) return 'art'

  return spec.isPro ? 'pro' : 'basic'
}

const SELECT_MODES: readonly (readonly [SelectMode, string])[] = [
  ['rect', 'select'],
  ['lasso', 'lasso'],
  ['wand', 'wand'],
]

const WARP_MODES: readonly (readonly [WarpMode, string])[] = [
  ['push', 'hand'],
  ['swell', 'swell'],
  ['pinch', 'pinch'],
]

const foldedSections = new Set<MessageKey>([
  'pen.tips',
  'pen.edgeStyle',
  'pen.feel',
  'paint.how',
  'eraser.shape',
  'eraser.pattern',
])

function section(key: MessageKey, ...children: Child[]): HTMLElement {
  const fold = h(
    'details',
    {
      class: 'panel-section',
      open: !foldedSections.has(key),
      onToggle: () => {
        if (fold.open) foldedSections.delete(key)
        else foldedSections.add(key)
      },
    },
    h(
      'summary',
      { class: 'panel-title', 'data-nav': true },
      h('span', null, t(key)),
      icon('down', 'panel-fold'),
    ),
    children,
  )

  return fold
}

function choice(
  label: string,
  isSelected: boolean,
  onSelect: () => void,
  content: Child,
  className = '',
): HTMLButtonElement {
  return h(
    'button',
    {
      class: `choice ${className}`,
      type: 'button',
      'data-nav': true,
      title: label,
      'aria-label': label,
      'aria-pressed': String(isSelected),
      onClick: onSelect,
    },
    content,
  )
}

function shapeLabel(kind: ShapeKind): string {
  return isMyShape(kind) ? t('shape.mine') : t(`shape.${kind}`)
}

function penLabel(spec: PenSpec): string {
  const name = t(spec.nameKey)

  return spec.size ? `${name} ${spec.size}` : name
}

export class PenPanel {
  readonly element = h('div', { class: 'panel-body' })

  private readonly editor: Editor
  private readonly scope = new Scope()
  private readonly box = new Signal<PenBox>('basic')

  constructor(editor: Editor) {
    this.editor = editor

    const { toolId, ink, penId, eraserId, paintId, isBucket, patternId } =
      editor

    this.scope.effect(() => {
      toolId.value
      ink.value
      penId.value
      eraserId.value
      paintId.value
      isBucket.value
      patternId.value
      editor.size.value
      editor.shape.value
      editor.shapeFilled.value
      editor.overwrite.value
      editor.patternErase.value
      editor.selectMode.value
      editor.warpMode.value
      editor.dotSize.value
      editor.showsDotGrid.value
      editor.inksVersion.value
      editor.settingsVersion.value
      registries.patterns.version.value
      settings.myShapes.value
      editor.isTracingShape.value
      this.box.value
      this.render()
    })
  }

  private render(): void {
    const scrollTop = this.element.scrollTop

    fill(
      this.element,
      this.sectionsFor(registries.tools.get(this.editor.toolId.peek())),
    )
    this.element.scrollTop = scrollTop
  }

  private sectionsFor(tool: Tool | undefined): Child[] {
    switch (tool?.options) {
      case 'pen':
        return [
          this.colors(),
          this.strength('pen'),
          this.penTips(),
          this.penEdge(),
          this.feel(),
        ]
      case 'paint':
        return [
          this.colors(),
          this.strength('paint'),
          this.patterns(),
          this.paintTips(),
        ]
      case 'eraser':
        return [
          this.strength('eraser'),
          this.eraserList(),
          this.eraserPattern(),
        ]
      case 'fill':
        return [
          this.colors(),
          this.strength('fill'),
          this.toolHint('fill.hint'),
        ]
      case 'shape':
        return [
          this.colors(),
          this.strength('pen'),
          this.shapeKinds(),
          this.penTips(),
          this.feel(),
        ]
      case 'dot':
        return [this.colors(), this.strength('fill'), this.dotOptions()]
      case 'select':
        return [this.selectModes()]
      case 'warp':
        return [this.warpOptions()]
    }

    if (tool?.id === 'move') return [this.toolHint('move.hint')]
    if (tool?.id === 'path') return [this.toolHint('path.hint')]

    return [this.colors()]
  }
  private colors(): HTMLElement {
    const editor = this.editor
    const { profile, meta } = editor.note
    const selected = editor.ink.peek()

    const swatches = editor.inkChoices().map(choiceItem =>
      h('button', {
        class: 'swatch',
        type: 'button',
        'data-nav': true,
        title: rgbCss(choiceItem.color),
        'aria-label': t('pen.colorNumber', { n: choiceItem.code }),
        'aria-pressed': String(choiceItem.code === selected),
        style: `--swatch:${rgbCss(choiceItem.color)}`,
        onClick: () => editor.pickInk(choiceItem.code),
      }),
    )

    const extras: Child[] = []

    if (profile.id === 'free') {
      const input: HTMLInputElement = h('input', {
        class: 'color-input',
        type: 'color',
        'data-nav': true,
        'aria-label': t('pen.editColor'),
        value: toHex(meta.palette[selected - 1] ?? [0, 0, 0]),
        onInput: () => {
          meta.palette[selected - 1] = fromHex(input.value)
          editor.touchSettings()
        },
      })

      extras.push(
        h(
          'label',
          { class: 'color-edit' },
          icon('picker'),
          h('span', null, t('pen.editColor')),
          input,
        ),
      )
    }

    return section(
      'pen.color',
      h('div', { class: `swatches is-${profile.id}` }, swatches),
      extras,
    )
  }

  private percentRow(label: MessageKey, signal: Signal<number>): HTMLElement {
    return sliderRow(
      t(label),
      Math.round(signal.peek() * 100),
      PERCENT_RANGE,
      value => {
        signal.value = value / 100
      },
    )
  }

  private sizeChips(): HTMLElement {
    const editor = this.editor
    const current = editor.size.peek()

    return h(
      'div',
      { class: 'size-row' },
      SIZE_STEPS.map(size =>
        choice(
          t('pen.sizeNumber', { n: size }),
          size === current,
          () => {
            editor.size.value = size
          },
          h('span', {
            class: 'size-dot',
            style: `--dot:${Math.min(22, Math.max(3, size))}px`,
          }),
          'size-choice',
        ),
      ),
    )
  }

  private strength(
    kind: 'pen' | 'paint' | 'eraser' | 'fill',
  ): HTMLElement | null {
    const editor = this.editor
    const isFree = editor.note.profile.id === 'free'

    if (kind === 'eraser') {
      return isFree
        ? section(
            'eraser.size',
            sliderRow(
              t('pen.size'),
              editor.eraserSize.peek(),
              { min: 1, max: 48 },
              value => {
                editor.eraserSize.value = value
              },
            ),
            this.percentRow('eraser.strength', editor.eraserStrength),
          )
        : null
    }

    const hasSize =
      kind === 'pen'
        ? editor.currentPen().engine === 'free'
        : kind === 'paint' && isFree && !editor.isBucket.peek()

    if (!hasSize && !isFree) return null

    return section(
      hasSize && isFree ? 'pen.strength' : hasSize ? 'pen.size' : 'pen.opacity',
      hasSize ? this.sizeChips() : null,
      isFree ? this.percentRow('pen.opacity', editor.opacity) : null,
    )
  }

  private feel(): HTMLElement | null {
    if (this.editor.currentPen().engine !== 'free') return null

    return section(
      'pen.feel',
      this.editor.note.profile.id === 'free'
        ? settingToggle(t('pen.smooth'), settings.smoothLines)
        : null,
      settingToggle(t('pen.pressure'), settings.penPressure),
    )
  }
  private penEdge(): HTMLElement {
    const editor = this.editor

    return section(
      'pen.edgeStyle',
      edgePicker({
        edge: editor.penEdge,
        inks: editor.edgeInks(),
        ink: editor.inkValue,
        paper: editor.paperColor(),
        onChange: () => {},
      }),
    )
  }
  private dotOptions(): HTMLElement {
    const editor = this.editor
    const current = editor.dotSize.peek()

    return section(
      'dot.size',
      h(
        'div',
        { class: 'size-row' },
        DOT_STEPS.map(size =>
          choice(
            t('pen.sizeNumber', { n: size }),
            size === current,
            () => {
              editor.dotSize.value = size
            },
            h('span', {
              class: 'size-cell',
              style: `--cell:${Math.round(4 + Math.log2(size) * 3)}px`,
            }),
            'size-choice',
          ),
        ),
      ),
      toggleRow(t('dot.grid'), editor.showsDotGrid.peek(), value => {
        editor.showsDotGrid.value = value
      }),
      h('p', { class: 'panel-hint' }, t('dot.hint')),
    )
  }

  private toolHint(message: MessageKey): HTMLElement {
    return h('p', { class: 'panel-hint' }, t(message))
  }

  private boxTabs(boxes: readonly PenBox[]): HTMLElement {
    const current = this.box.peek()

    return h(
      'div',
      { class: 'box-tabs' },
      boxes.map(box =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(box === current),
            onClick: () => {
              this.box.value = box
            },
          },
          t(BOX_LABELS[box]),
        ),
      ),
    )
  }

  private penTips(): HTMLElement {
    const editor = this.editor
    const set = PEN_SETS[editor.note.profile.id]
    const selectedId = editor.penId.peek()
    const box = this.box.peek()
    const boxes = [...new Set(set.map(boxOf))]
    const visible = set.filter(spec => boxOf(spec) === box)
    const size = editor.size.peek()

    return section(
      'pen.tips',
      boxes.length > 1 ? this.boxTabs(boxes) : null,
      h(
        'div',
        { class: 'pen-grid' },
        visible.map(spec =>
          choice(
            penLabel(spec),
            spec.id === selectedId,
            () => {
              editor.penId.value = spec.id
            },
            [penPreview(spec, 'pen', size), h('span', null, penLabel(spec))],
            'pen-choice',
          ),
        ),
      ),
    )
  }
  private patterns(): HTMLElement {
    const editor = this.editor
    const selected = editor.patternId.peek()
    const phase = editor.note.profile.patternPhase

    return section(
      'pen.pattern',
      h(
        'div',
        { class: 'pattern-grid' },
        registries.patterns.list().map(pattern =>
          choice(
            pattern.nameKey ? t(pattern.nameKey) : (pattern.name ?? pattern.id),
            pattern.id === selected,
            () => {
              editor.patternId.value = pattern.id
            },
            patternPreview(pattern, phase),
            'pattern-choice',
          ),
        ),
      ),
      h(
        'div',
        { class: 'panel-actions' },
        key({
          icon: 'plus',
          label: t('pattern.make'),
          onPress: () => openPatternEditor(editor),
        }),
        isMyPattern(selected)
          ? key({
              icon: 'trash',
              title: t('pattern.delete'),
              onPress: () => {
                removeMyPattern(selected)
                editor.patternId.value = 'checker'
              },
            })
          : null,
      ),
      toggleRow(t('pen.overwrite'), editor.overwrite.peek(), value => {
        editor.overwrite.value = value
      }),
    )
  }

  private paintTips(): HTMLElement {
    const editor = this.editor
    const profile = editor.note.profile.id
    const isBucket = editor.isBucket.peek()
    const selectedId = editor.paintId.peek()

    const tips = PAINT_SETS[profile].map(spec =>
      choice(
        t(spec.nameKey),
        !isBucket && spec.id === selectedId,
        () => {
          editor.paintId.value = spec.id
          editor.isBucket.value = false
        },
        [
          penPreview(spec, 'paint', editor.size.peek()),
          h('span', null, t(spec.nameKey)),
        ],
        'pen-choice',
      ),
    )

    const bucket = choice(
      t('paint.bucket'),
      isBucket,
      () => {
        editor.isBucket.value = true
      },
      [icon('bucket'), h('span', null, t('paint.bucket'))],
      'pen-choice',
    )

    return section('paint.how', h('div', { class: 'pen-grid' }, tips, bucket))
  }

  private eraserList(): HTMLElement {
    const editor = this.editor
    const profile = editor.note.profile.id
    const selectedId = editor.eraserId.peek()
    const size = editor.eraserSize.peek()

    return section(
      'eraser.shape',
      h(
        'div',
        { class: 'pen-grid' },
        ERASER_SETS[profile].map(spec =>
          choice(
            penLabel(spec),
            spec.id === selectedId,
            () => {
              editor.eraserId.value = spec.id
            },
            [penPreview(spec, 'eraser', size), h('span', null, penLabel(spec))],
            'pen-choice',
          ),
        ),
      ),
    )
  }

  private eraserPattern(): HTMLElement {
    const editor = this.editor
    const isOn = editor.patternErase.peek()

    return section(
      'eraser.pattern',
      toggleRow(t('eraser.patternOnly'), isOn, value => {
        editor.patternErase.value = value
      }),
      isOn ? this.patterns() : null,
    )
  }

  private shapeKinds(): HTMLElement {
    const editor = this.editor
    const current = editor.shape.peek()
    const kinds: readonly ShapeKind[] = [
      ...SHAPE_KINDS,
      ...settings.myShapes.peek().map(shape => shape.id),
    ]

    return section(
      'shape.kind',
      h(
        'div',
        { class: 'shape-grid' },
        kinds.map(kind =>
          choice(
            shapeLabel(kind),
            kind === current,
            () => {
              editor.isTracingShape.value = false
              editor.shape.value = kind
            },
            shapePreview(kind),
            'shape-choice',
          ),
        ),
      ),
      h('p', { class: 'panel-hint' }, shapeLabel(current)),
      h(
        'div',
        { class: 'panel-actions' },
        key({
          icon: 'plus',
          label: t('shape.register'),
          variant: editor.isTracingShape.peek() ? 'primary' : 'plain',
          onPress: () => {
            editor.isTracingShape.value = !editor.isTracingShape.peek()
          },
        }),
        isMyShape(current)
          ? key({
              icon: 'trash',
              title: t('shape.delete'),
              onPress: () => {
                removeMyShape(current)
                editor.shape.value = 'line'
              },
            })
          : null,
      ),
      current !== 'line'
        ? toggleRow(t('shape.filled'), editor.shapeFilled.peek(), value => {
            editor.shapeFilled.value = value
          })
        : null,
    )
  }

  private selectModes(): HTMLElement {
    const editor = this.editor
    const current = editor.selectMode.peek()

    return section(
      'select.mode',
      h(
        'div',
        { class: 'icon-row' },
        SELECT_MODES.map(([mode, iconName]) =>
          choice(
            t(`select.${mode}`),
            mode === current,
            () => {
              editor.selectMode.value = mode
            },
            [icon(iconName), h('span', null, t(`select.${mode}`))],
            'icon-choice',
          ),
        ),
      ),
      h('p', { class: 'panel-hint' }, t(`select.hint.${current}`)),
      h(
        'div',
        { class: 'panel-actions' },
        key({
          icon: 'select',
          label: t('select.all'),
          onPress: () => {
            if (editor.liftAll()) playSfx('error')
          },
        }),
        key({
          icon: 'paste',
          label: t('select.paste'),
          isDisabled: !editor.hasFloatClipboard,
          onPress: () => editor.pasteFloating(),
        }),
      ),
    )
  }

  private warpOptions(): HTMLElement {
    const editor = this.editor
    const current = editor.warpMode.peek()

    return section(
      'warp.mode',
      h(
        'div',
        { class: 'icon-row' },
        WARP_MODES.map(([mode, iconName]) =>
          choice(
            t(`warp.${mode}`),
            mode === current,
            () => {
              editor.warpMode.value = mode
            },
            [icon(iconName), h('span', null, t(`warp.${mode}`))],
            'icon-choice',
          ),
        ),
      ),
      settingSlider(t('warp.size'), editor.warpSize, { min: 8, max: 80 }),
      settingSlider(t('warp.strength'), editor.warpStrength, {
        min: 5,
        max: 100,
      }),
    )
  }

  dispose(): void {
    this.scope.dispose()
  }
}

function toHex(color: readonly number[]): string {
  return `#${color.map(value => value.toString(16).padStart(2, '0')).join('')}`
}

function fromHex(value: string): [number, number, number] {
  const number = parseInt(value.slice(1), 16)

  return [(number >> 16) & 255, (number >> 8) & 255, number & 255]
}

export class LayerPanel {
  readonly element = h('div', { class: 'panel-body' })

  private readonly editor: Editor
  private readonly scope = new Scope()

  constructor(editor: Editor) {
    this.editor = editor

    this.scope.effect(() => {
      editor.layer.value
      editor.inksVersion.value
      editor.settingsVersion.value
      this.render()
    })
  }

  private render(): void {
    const editor = this.editor
    const { meta, profile, frames } = editor.note
    const page = editor.page.peek()
    const active = editor.layer.peek()
    const isFree = profile.id === 'free'
    const isOneSheet = profile.id === '3ds' && meta.oneSheet

    const rows = meta.layers.map((layer, index) => {
      const inks = frames.inks(page)
      const colors: Child[] = []

      for (let slot = 0; slot < profile.inkSlots; slot++) {
        const code = inkOf(inks, index, slot)
        const color = editor.note.colorAt(page, index, slot)

        colors.push(
          h('span', {
            class: 'layer-ink',
            title: String(code),
            style: `--swatch:${color ? rgbCss(color) : 'transparent'}`,
          }),
        )
      }

      return h(
        'div',
        { class: `layer-row ${index === active ? 'is-active' : ''}` },
        h(
          'button',
          {
            class: 'layer-pick',
            type: 'button',
            'data-nav': true,
            disabled: isOneSheet,
            'aria-pressed': String(index === active),
            onClick: () => {
              editor.layer.value = index
              editor.touchSettings()
            },
          },
          h('b', { class: 'layer-name' }, layer.name),
          colors,
        ),
        key({
          icon: layer.visible ? 'eye' : 'eyeOff',
          title: t(layer.visible ? 'layer.hide' : 'layer.show'),
          variant: 'ghost',
          onPress: () => {
            layer.visible = !layer.visible
            editor.touchSettings()
          },
        }),
        key({
          icon: layer.locked ? 'lock' : 'unlock',
          title: t(layer.locked ? 'layer.unlock' : 'layer.lock'),
          variant: 'ghost',
          onPress: () => {
            layer.locked = !layer.locked
            editor.touchSettings()
          },
        }),
        isFree
          ? key({
              icon: 'up',
              title: t('layer.moveUp'),
              variant: 'ghost',
              isDisabled: index === 0,
              onPress: () => editor.moveLayer(index, -1),
            })
          : null,
      )
    })

    fill(
      this.element,
      section(
        'layer.title',
        h('p', { class: 'panel-hint' }, t('layer.topFirst')),
        h('div', { class: 'layer-list' }, rows),
        isFree
          ? h(
              'div',
              { class: 'panel-actions' },
              key({
                icon: 'plus',
                label: t('layer.add'),
                isDisabled: frames.layers >= profile.maxLayers,
                onPress: () => editor.addLayer(),
              }),
              key({
                icon: 'trash',
                label: t('layer.remove'),
                isDisabled: frames.layers <= profile.minLayers,
                onPress: () => editor.removeLayer(),
              }),
            )
          : null,
        isOneSheet
          ? h('p', { class: 'panel-hint' }, t('layer.oneSheetHint'))
          : null,
      ),
      this.paper(),
    )
  }

  private paper(): HTMLElement {
    const editor = this.editor
    const { profile, frames } = editor.note
    const page = editor.page.peek()
    const current = frames.paper(page)

    return section(
      'layer.paper',
      h(
        'div',
        { class: 'swatches is-paper' },
        profile.papers.map((paper, index) =>
          h('button', {
            class: 'swatch',
            type: 'button',
            'data-nav': true,
            title: t('layer.paperNumber', { n: index + 1 }),
            'aria-label': t('layer.paperNumber', { n: index + 1 }),
            'aria-pressed': String(index === current),
            style: `--swatch:${rgbCss(paper)}`,
            onClick: () => editor.setPaper(index),
          }),
        ),
      ),
      key({
        icon: 'pages',
        label: t('layer.paperAll'),
        onPress: () => editor.setPaper(current, true),
      }),
    )
  }

  dispose(): void {
    this.scope.dispose()
  }
}

export function updateColorChip(chip: HTMLElement, editor: Editor): void {
  chip.style.setProperty('--swatch', rgbCss(editor.currentInkColor()))
}
