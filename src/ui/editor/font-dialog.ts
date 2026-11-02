import {
  addFontFile,
  BASIC_FONTS,
  canListDeviceFonts,
  deviceFonts,
  type FontChoice,
  fileFonts,
  isFontInstalled,
  removeFontFile,
} from '../../app/fonts.ts'
import { t } from '../../i18n/index.ts'
import { pickFile } from '../app.ts'
import { type Child, fill, h, icon, key } from '../dom.ts'
import { openDialog, toast } from '../overlay.ts'

const FONT_TYPES = '.ttf,.otf,.woff,.woff2'
const LIST_LIMIT = 200

let knownDeviceFonts: FontChoice[] = []

export function fontLabel(font: FontChoice): string {
  return font.nameKey ? t(font.nameKey) : font.name
}

export function openFontPicker(
  current: FontChoice,
  onPick: (font: FontChoice) => void,
): void {
  const list = h('div', { class: 'font-list' })
  let files: FontChoice[] = []

  const pick = (font: FontChoice): void => {
    dialog.close()
    onPick(font)
  }

  const row = (font: FontChoice): HTMLElement => {
    const isCurrent = font.family === current.family

    return h(
      'div',
      { class: 'font-row' },
      h(
        'button',
        {
          class: 'font-pick',
          type: 'button',
          'data-nav': true,
          'aria-pressed': String(isCurrent),
          style: font.isFile
            ? ''
            : `font-family:${font.family.replaceAll('"', "'")}`,
          onClick: () => pick(font),
        },
        isCurrent ? icon('check') : null,
        h('span', { class: 'font-name' }, fontLabel(font)),
      ),
      font.isFile
        ? key({
            icon: 'trash',
            title: t('font.delete'),
            variant: 'ghost',
            onPress: () => void removeFile(font),
          })
        : null,
    )
  }

  const group = (title: string, fonts: readonly FontChoice[]): Child =>
    fonts.length > 0 && [
      h('h3', { class: 'field-label' }, title),
      fonts.map(row),
    ]

  const render = (): void => {
    const word = search.value.trim()
    const lower = word.toLowerCase()
    const matches = (font: FontChoice): boolean =>
      fontLabel(font).toLowerCase().includes(lower)
    const device = knownDeviceFonts.filter(matches).slice(0, LIST_LIMIT)
    const found = [...BASIC_FONTS, ...files, ...device].some(matches)
    const canTypeName = word.length > 0 && !found && isFontInstalled(word)

    fill(
      list,
      canTypeName ? row({ name: word, family: `"${word}"` }) : null,
      group(t('font.basic'), BASIC_FONTS.filter(matches)),
      group(t('font.files'), files.filter(matches)),
      group(t('font.device'), device),
    )
  }

  const search: HTMLInputElement = h('input', {
    class: 'text-input',
    type: 'search',
    'data-nav': true,
    'aria-label': t('font.search'),
    placeholder: t('font.search'),
    onInput: render,
  })

  const removeFile = async (font: FontChoice): Promise<void> => {
    await removeFontFile(font)
    files = files.filter(item => item !== font)
    render()
  }

  const addFile = async (): Promise<void> => {
    const file = await pickFile(FONT_TYPES)

    if (!file) return

    try {
      pick(await addFontFile(file))
    } catch {
      toast(t('font.failed'), { isError: true })
    }
  }

  const listDevice = async (): Promise<void> => {
    try {
      knownDeviceFonts = await deviceFonts()
      render()
    } catch {
      toast(t('font.deviceFailed'), { isError: true })
    }
  }

  const dialog = openDialog({
    title: t('font.title'),
    icon: 'text',
    isWide: true,
    body: [search, list],
    footer: [
      canListDeviceFonts()
        ? key({
            icon: 'search',
            label: t('font.listDevice'),
            onPress: () => void listDevice(),
          })
        : null,
      key({
        icon: 'upload',
        label: t('font.addFile'),
        onPress: () => void addFile(),
      }),
    ],
  })

  render()

  void fileFonts().then(names => {
    files = names
    render()
  })
}
