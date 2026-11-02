import type { Editor } from '../../app/editor.ts'
import { addMyPattern } from '../../app/my-library.ts'
import { t } from '../../i18n/index.ts'
import { h, key } from '../dom.ts'
import { openDialog } from '../overlay.ts'

const SIZE = 8
const PREVIEW_TILES = 4
const PREVIEW_DOT = 4

export function openPatternEditor(editor: Editor): void {
  const bits = new Array<number>(SIZE * SIZE).fill(0)
  const preview = h('canvas', {
    class: 'pattern-tile-preview',
    width: SIZE * PREVIEW_TILES * PREVIEW_DOT,
    height: SIZE * PREVIEW_TILES * PREVIEW_DOT,
    style: `background-color:${editor.paperColor()}`,
  })
  const context = preview.getContext('2d')
  const ink = `rgb(${editor.currentInkColor().join(' ')})`

  const showPreview = (): void => {
    if (!context) return

    context.clearRect(0, 0, preview.width, preview.height)
    context.fillStyle = ink

    for (let y = 0; y < SIZE * PREVIEW_TILES; y++) {
      for (let x = 0; x < SIZE * PREVIEW_TILES; x++) {
        if (!bits[(y % SIZE) * SIZE + (x % SIZE)]) continue

        context.fillRect(
          x * PREVIEW_DOT,
          y * PREVIEW_DOT,
          PREVIEW_DOT,
          PREVIEW_DOT,
        )
      }
    }
  }

  let brush: number | null = null

  const paint = (cell: HTMLElement, index: number, value: number): void => {
    bits[index] = value
    cell.setAttribute('aria-pressed', String(value === 1))
    showPreview()
  }

  const cells = bits.map((_, index) => {
    const cell: HTMLButtonElement = h('button', {
      class: 'dot-cell',
      type: 'button',
      'data-nav': true,
      'aria-label': t('pattern.dot', { n: index + 1 }),
      'aria-pressed': 'false',
      onPointerDown: event => {
        brush = bits[index] ? 0 : 1
        cell.releasePointerCapture(event.pointerId)
        paint(cell, index, brush)
      },
      onPointerEnter: () => {
        if (brush !== null) paint(cell, index, brush)
      },
      onClick: event => {
        if (event.detail === 0) paint(cell, index, bits[index] ? 0 : 1)
      },
    })

    return cell
  })

  const stopPainting = (): void => {
    brush = null
  }

  window.addEventListener('pointerup', stopPainting)

  const dialog = openDialog({
    title: t('pattern.make'),
    icon: 'pattern',
    isWide: true,
    onClose: () => window.removeEventListener('pointerup', stopPainting),
    body: h(
      'div',
      { class: 'pattern-editor' },
      h('div', { class: 'dot-grid' }, cells),
      preview,
    ),
    footer: key({
      icon: 'check',
      label: t('pattern.save'),
      variant: 'primary',
      onPress: () => {
        dialog.close()

        if (bits.includes(1)) {
          editor.patternId.value = addMyPattern(bits, SIZE, SIZE)
        }
      },
    }),
  })

  showPreview()
}
