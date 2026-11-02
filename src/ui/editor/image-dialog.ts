import { dotsInBackground } from '../../app/background.ts'
import type { Editor } from '../../app/editor.ts'
import { Floating } from '../../app/floating.ts'
import type { DotMode, DotOptions } from '../../app/image-dots.ts'
import { rgbaWord } from '../../core/profile.ts'
import { t } from '../../i18n/index.ts'
import { pickFile } from '../app.ts'
import { fill, h, key } from '../dom.ts'
import { openDialog, toast } from '../overlay.ts'
import { sliderRow, toggleRow } from '../controls.ts'

const DEFAULT_LEVEL = 50
const DEFAULT_SIZE = 100

export async function openImageImport(editor: Editor): Promise<void> {
  const file = await pickFile('image/*')

  if (!file) return

  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(file)
  } catch {
    toast(t('image.failed'), { isError: true })

    return
  }

  openImageDialog(editor, bitmap)
}

function openImageDialog(editor: Editor, bitmap: ImageBitmap): void {
  const { meta, profile } = editor.note
  const isFree = profile.id === 'free'
  const options: DotOptions = {
    mode: 'tone',
    level: DEFAULT_LEVEL,
    dithers: true,
  }
  let sizePercent = DEFAULT_SIZE

  const preview = h('canvas', {
    class: 'motion-preview',
    style: `background-color:${editor.paperColor()}`,
  })

  const convert = async (): Promise<{
    pixels: Uint8Array
    width: number
    height: number
  }> => {
    const fit = Math.min(meta.width / bitmap.width, meta.height / bitmap.height)
    const scale = (fit * sizePercent) / 100
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d', { willReadFrequently: true })

    if (!context) return { pixels: new Uint8Array(0), width: 0, height: 0 }

    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)

    const { data } = context.getImageData(0, 0, width, height)
    const pixels = await dotsInBackground(
      data,
      width,
      height,
      options,
      editor.inkValue,
      meta.palette,
    )

    return { pixels, width, height }
  }

  let isConverting = false
  let isStale = false

  const draw = (): void => {
    if (isConverting) {
      isStale = true

      return
    }

    isConverting = true
    void convert()
      .then(paint)
      .catch(error => console.error(error))
      .finally(() => {
        isConverting = false

        if (isStale) {
          isStale = false
          draw()
        }
      })
  }

  const paint = ({
    pixels,
    width,
    height,
  }: {
    pixels: Uint8Array
    width: number
    height: number
  }): void => {
    const context = preview.getContext('2d')

    preview.width = width
    preview.height = height

    if (!context || width === 0) return

    const image = context.createImageData(width, height)
    const words = new Uint32Array(image.data.buffer)
    const color = rgbaWord(editor.currentInkColor())

    pixels.forEach((value, index) => {
      if (value === 0) return

      words[index] = isFree
        ? rgbaWord(meta.palette[value - 1] ?? meta.palette[0])
        : color
    })

    context.putImageData(image, 0, 0)
  }

  const modes: readonly (readonly [DotMode, string])[] = [
    ['tone', t('image.tone')],
    ['line', t('image.line')],
    ...(isFree ? [['color', t('image.color')] as const] : []),
  ]

  const modeRow = h('div', { class: 'chip-row' })

  const renderModes = (): void => {
    fill(
      modeRow,
      modes.map(([mode, label]) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(mode === options.mode),
            onClick: () => {
              options.mode = mode
              renderModes()
              draw()
            },
          },
          label,
        ),
      ),
    )
  }

  renderModes()

  const place = async (): Promise<void> => {
    dialog.close()

    const { pixels, width, height } = await convert()

    if (!pixels.some(value => value !== 0)) {
      toast(t('image.empty'))

      return
    }

    const floating = new Floating(
      pixels,
      width,
      height,
      meta.width / 2,
      meta.height / 2,
      editor.usesLayeredValues,
    )

    if (!editor.placeFloating(floating)) toast(t('stage.layerLocked'))
  }

  const dialog = openDialog({
    title: t('tool.image'),
    icon: 'image',
    isWide: true,
    onClose: () => bitmap.close(),
    body: [
      preview,
      modeRow,
      sliderRow(
        t('image.level'),
        options.level,
        { min: 0, max: 100 },
        value => {
          options.level = value
          draw()
        },
      ),
      sliderRow(t('image.size'), sizePercent, { min: 10, max: 100 }, value => {
        sizePercent = value
        draw()
      }),
      toggleRow(t('image.dither'), options.dithers, value => {
        options.dithers = value
        draw()
      }),
    ],
    footer: key({
      icon: 'check',
      label: t('image.place'),
      variant: 'primary',
      onPress: () => void place(),
    }),
  })

  draw()
}
