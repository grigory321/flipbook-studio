import { stillInBackground } from '../../app/background.ts'
import type { Editor } from '../../app/editor.ts'
import type { Session } from '../../app/session.ts'
import { settings } from '../../app/settings.ts'
import { PROFILES } from '../../core/profile.ts'
import { t } from '../../i18n/index.ts'
import { registries, type Exporter } from '../../plugin/host.ts'
import { saveFile } from '../app.ts'
import { fill, h, icon, key } from '../dom.ts'
import { openDialog, openProgress, toast } from '../overlay.ts'
import { toggleRow } from '../controls.ts'

function exporterLabel(exporter: Exporter, field: 'name' | 'detail'): string {
  const translationKey =
    field === 'name' ? exporter.nameKey : exporter.detailKey

  return translationKey ? t(translationKey) : (exporter[field] ?? '')
}

function checkRow(label: string, isOk: boolean): HTMLElement {
  return h(
    'li',
    { class: `check-row ${isOk ? 'is-ok' : 'is-warn'}` },
    icon(isOk ? 'check' : 'help'),
    label,
  )
}

function deviceChecks(editor: Editor, target: 'dsi' | '3ds'): HTMLElement {
  const { note } = editor
  const profile = PROFILES[target]
  const isSameKind = note.meta.profile === target
  const fitsPages = note.frames.count <= profile.maxPages

  return h(
    'ul',
    { class: 'check-list' },
    checkRow(
      isSameKind ? t('export.check.exact') : t('export.check.converted'),
      isSameKind,
    ),
    checkRow(
      t('export.check.pages', {
        n: note.frames.count,
        max: profile.maxPages,
      }),
      fitsPages,
    ),
  )
}

const EXPORT_SCALES = [1, 2, 4, 8]

export function openExportDialog(editor: Editor, session: Session): void {
  let scale = 1

  const scaleRow = h('div', { class: 'chip-row' })

  const renderScales = (): void => {
    fill(
      scaleRow,
      EXPORT_SCALES.map(value =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(value === scale),
            onClick: () => {
              scale = value
              renderScales()
            },
          },
          `×${value}`,
        ),
      ),
    )
  }

  renderScales()

  const run = async (exporter: Exporter): Promise<void> => {
    dialog.close()
    editor.dropFloating()

    const progress = openProgress(t('export.working'))

    try {
      const saved = await session.savedCopy(editor.note)
      const result = await exporter.run({
        note: editor.note,
        scale: exporter.isScalable ? scale : undefined,
        saved: saved ?? undefined,
        onProgress: ratio => progress.set(ratio),
      })

      progress.close()
      saveFile(result.blob, result.fileName)

      const warning = result.warnings?.find(
        item => item !== 'export.warn.converted',
      )

      toast(warning ? t(warning) : t('export.done'))
      session.scheduleSave(editor)
    } catch (error) {
      progress.close()
      console.error(error)
      toast(t('export.failed'), { isError: true })
    }
  }

  const exporters = registries.exporters
    .list()
    .sort((a, b) => a.order - b.order)

  const rows = exporters.map(exporter =>
    h(
      'button',
      {
        class: 'export-row',
        type: 'button',
        'data-nav': true,
        onClick: () => void run(exporter),
      },
      icon(exporter.icon, 'export-icon'),
      h(
        'span',
        { class: 'export-text' },
        h('b', null, exporterLabel(exporter, 'name')),
        h('small', null, exporterLabel(exporter, 'detail')),
      ),
      exporter.id === 'ppm' ? deviceChecks(editor, 'dsi') : null,
      exporter.id === 'kwz' ? deviceChecks(editor, '3ds') : null,
    ),
  )

  const dialog = openDialog({
    title: t('export.title'),
    icon: 'share',
    isWide: true,
    body: [
      h(
        'div',
        { class: 'field' },
        h('span', { class: 'field-label' }, t('export.scale')),
        scaleRow,
      ),
      h('div', { class: 'export-list' }, rows),
      key({
        icon: 'image',
        label: t('export.still'),
        onPress: () => void saveStill(),
      }),
    ],
  })

  const saveStill = async (): Promise<void> => {
    const page = editor.page.peek()
    const number = String(page + 1).padStart(3, '0')
    const name = editor.note.meta.title || 'flipbook'

    dialog.close()
    editor.dropFloating()

    const saved = await session.savedCopy(editor.note)

    saveFile(
      await stillInBackground(editor.note, saved, page, scale),
      `${name}_p${number}.png`,
    )
    toast(t('export.done'))
  }
}

export function openNoteSettings(editor: Editor, onChange: () => void): void {
  const { note } = editor
  const { meta, profile } = note

  const titleInput: HTMLInputElement = h('input', {
    class: 'text-input',
    type: 'text',
    maxlength: 40,
    value: meta.title,
    'data-nav': true,
    'aria-label': t('noteSettings.name'),
    onInput: () => {
      editor.setTitle(titleInput.value)
      onChange()
    },
  })

  const styles = ['plain', 'ruled', 'grid', 'dots'] as const
  const styleRow = h('div', { class: 'chip-row' })

  const renderStyles = (): void => {
    fill(
      styleRow,
      styles.map(style =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(style === meta.paperStyle),
            onClick: () => {
              meta.paperStyle = style
              renderStyles()
              editor.touchSettings()
            },
          },
          t(`paper.${style}`),
        ),
      ),
    )
  }

  renderStyles()

  const facts = [
    [t('noteSettings.kind'), t(`profile.${profile.id}`)],
    [t('noteSettings.size'), `${meta.width} × ${meta.height}`],
    [t('noteSettings.pages'), String(note.frames.count)],
    [t('noteSettings.data'), formatBytes(note.store.writtenBytes)],
  ]

  const isThreeDs = profile.id === '3ds'

  openDialog({
    title: t('noteSettings.title'),
    icon: 'note',
    body: [
      h(
        'label',
        { class: 'field' },
        h('span', { class: 'field-label' }, t('noteSettings.name')),
        titleInput,
      ),
      h('h3', { class: 'field-label' }, t('new.paper')),
      styleRow,
      isThreeDs
        ? h(
            'div',
            { class: 'field' },
            toggleRow(t('noteSettings.advanced'), !meta.oneSheet, isOn =>
              editor.setOneSheet(!isOn),
            ),
          )
        : null,
      h(
        'dl',
        { class: 'facts' },
        facts.map(([term, value]) => [
          h('dt', null, term),
          h('dd', null, value),
        ]),
      ),
    ],
  })
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }

  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}

export function openTips(isTouch: boolean): void {
  const steps = isTouch
    ? ['tips.touch1', 'tips.touch2', 'tips.touch3']
    : ['tips.mouse1', 'tips.mouse2', 'tips.mouse3']

  const dialog = openDialog({
    title: t('tips.title'),
    icon: 'help',
    body: h(
      'ul',
      { class: 'tips' },
      steps.map(step => h('li', null, t(step))),
    ),
    onClose: () => {
      settings.seenTips.value = true
    },
    footer: key({
      label: t('tips.ok'),
      variant: 'primary',
      onPress: () => dialog.close(),
    }),
  })
}

const SHORTCUTS: readonly (readonly [string, string])[] = [
  ['← →', 'keys.page'],
  ['Enter', 'keys.play'],
  ['N', 'keys.add'],
  ['D', 'keys.duplicate'],
  ['Delete', 'keys.delete'],
  ['O', 'keys.onion'],
  ['P B E L S M T', 'keys.tools'],
  ['Ctrl + Z', 'keys.undo'],
  ['Ctrl + Y', 'keys.redo'],
  ['Ctrl + C / X / V', 'keys.copy'],
  ['Ctrl + A', 'keys.selectAll'],
  ['Enter / Esc', 'keys.confirmPick'],
  ['↑ ↓ ← →', 'keys.nudge'],
  ['Space', 'keys.pan'],
  ['0', 'keys.fit'],
  ['H', 'keys.panel'],
]

const GESTURES: readonly (readonly [number, string])[] = [
  [2, 'gesture.undo'],
  [3, 'gesture.redo'],
  [2, 'gesture.zoom'],
  [2, 'gesture.move'],
  [1, 'gesture.reorder'],
  [1, 'gesture.slide'],
]

export function openShortcuts(isTouch: boolean): void {
  openDialog({
    title: t(isTouch ? 'gesture.title' : 'keys.title'),
    icon: isTouch ? 'help' : 'keyboard',
    isWide: true,
    body: isTouch ? gestureList() : keyList(),
  })
}

function keyList(): HTMLElement {
  return h(
    'dl',
    { class: 'shortcuts' },
    SHORTCUTS.map(([keys, label]) => [
      h('dt', null, h('kbd', null, keys)),
      h('dd', null, t(label)),
    ]),
  )
}

function gestureList(): HTMLElement {
  return h(
    'dl',
    { class: 'shortcuts' },
    GESTURES.map(([fingers, label]) => [
      h(
        'dt',
        { class: 'guide-fingers' },
        Array.from({ length: fingers }, () =>
          h('i', { class: 'guide-finger' }),
        ),
      ),
      h('dd', null, t(label)),
    ]),
  )
}
