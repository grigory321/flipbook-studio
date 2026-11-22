import { exportSaved } from '../app/background.ts'
import { fillSampleNote } from '../app/sample.ts'
import type { Session } from '../app/session.ts'
import { settings, type ShelfSort } from '../app/settings.ts'
import { Compositor } from '../core/compositor.ts'
import {
  createId,
  Note,
  type NoteOptions,
  type PaperStyle,
} from '../core/note.ts'
import { PROFILES, type ProfileId, rgbCss } from '../core/profile.ts'
import type { NoteCard } from '../file/library.ts'
import { formatDate, formatRelative, plural, t } from '../i18n/index.ts'
import { type App, pickFile, saveFile, type Scene } from './app.ts'
import { fill, h, icon, key, Scope } from './dom.ts'
import { nav } from './nav.ts'
import {
  type DialogHandle,
  openDialog,
  openMenu,
  openProgress,
  toast,
} from './overlay.ts'
import { openAppSettings } from './settings-dialog.ts'

const PREVIEW_DELAY_MS = 160
const PREVIEW_BUDGET = 32 * 1024 * 1024
const FILE_TYPES = '.ugb,.ppm,.kwz'

class Preview {
  readonly canvas = h('canvas', { class: 'preview-canvas' })

  private readonly session: Session
  private timer = 0
  private frameRequest = 0
  private token = 0

  constructor(session: Session) {
    this.session = session
  }

  show(card: NoteCard | null): void {
    this.stop()

    if (!card) return

    const token = this.token

    this.timer = window.setTimeout(() => {
      void this.load(card.id, token)
    }, PREVIEW_DELAY_MS)
  }

  private async load(id: string, token: number): Promise<void> {
    const library = this.session.library

    if (!library) return

    const note = await library.loadNote(id, PREVIEW_BUDGET)

    if (token !== this.token) return

    await note.ensurePages(0, 32)

    if (token !== this.token) return

    this.play(note, token)
  }

  private play(note: Note, token: number): void {
    const { meta, frames, profile } = note
    const context = this.canvas.getContext('2d')

    if (!context) return

    this.canvas.width = meta.width
    this.canvas.height = meta.height
    this.canvas.style.setProperty('--ratio', String(meta.width / meta.height))

    const compositor = new Compositor(note)
    const image = new ImageData(
      new Uint8ClampedArray(compositor.pixels.buffer),
      meta.width,
      meta.height,
    )

    const started = performance.now()
    let shown = -1
    let isWaiting = false

    const loop = (now: number): void => {
      if (token !== this.token) return

      this.frameRequest = requestAnimationFrame(loop)

      if (isWaiting) return

      const page =
        Math.floor(((now - started) / 1000) * note.fps) % frames.count

      if (page === shown) return

      shown = page

      if (page % 32 === 0) {
        isWaiting = true
        void note.ensurePages(page, 32).then(() => {
          isWaiting = false
        })
      }

      try {
        const paper = profile.papers[frames.paper(page)] ?? profile.papers[0]

        this.canvas.style.background = rgbCss(paper)
        compositor.composePage(page)
        context.putImageData(image, 0, 0)
      } catch {}
    }

    this.frameRequest = requestAnimationFrame(loop)
  }

  stop(): void {
    this.token++
    clearTimeout(this.timer)
    cancelAnimationFrame(this.frameRequest)
  }
}

function profileLabel(profile: ProfileId): string {
  return t(`profile.${profile}`)
}

const SORT_LABELS: Readonly<Record<ShelfSort, string>> = {
  modified: 'home.sortModified',
  title: 'home.sortTitle',
  pages: 'home.sortPages',
}

const SORTS: readonly ShelfSort[] = ['modified', 'title', 'pages']

function isBookmarked(card: NoteCard): boolean {
  return settings.bookmarks.peek().includes(card.id)
}

function sortCards(cards: readonly NoteCard[], sort: ShelfSort): NoteCard[] {
  const collator = new Intl.Collator(undefined, { numeric: true })
  const order = (a: NoteCard, b: NoteCard): number => {
    if (sort === 'title') {
      return (
        collator.compare(
          a.title || t('home.untitled'),
          b.title || t('home.untitled'),
        ) || b.modified - a.modified
      )
    }

    if (sort === 'pages') return b.pages - a.pages || b.modified - a.modified

    return b.modified - a.modified
  }

  return [...cards].sort(
    (a, b) => Number(isBookmarked(b)) - Number(isBookmarked(a)) || order(a, b),
  )
}

function coverCanvas(card: NoteCard): HTMLCanvasElement {
  const canvas = h('canvas', { class: 'card-thumb', width: 80, height: 60 })

  if (card.cover) {
    const pixels = new Uint8ClampedArray(card.cover.slice().buffer)

    canvas.getContext('2d')?.putImageData(new ImageData(pixels, 80, 60), 0, 0)
  }

  return canvas
}

export function homeScene(app: App, openEditor: (note: Note) => void): Scene {
  const session = app.session
  const scope = new Scope()
  const preview = new Preview(session)
  const titleLine = h('h2', { class: 'info-title' })
  const detailLine = h('p', { class: 'info-detail' })
  const clock = h('span', { class: 'clock' })
  const grid = h('div', { class: 'shelf-grid', role: 'listbox' })
  const sortButton = key({
    icon: 'sort',
    label: t(SORT_LABELS[settings.shelfSort.peek()]),
    class: 'shelf-sort',
    title: t('home.sort'),
    onPress: button => showSortMenu(button),
  })
  const sortLabel = sortButton.querySelector('.key-label')
  const viewButton = key({
    icon: 'list',
    class: 'shelf-view',
    onPress: () => {
      settings.shelfView.value =
        settings.shelfView.peek() === 'grid' ? 'list' : 'grid'
      renderView()
    },
  })
  const previewFrame = h('div', { class: 'preview-frame' }, preview.canvas)
  const infoActions = h('div', { class: 'info-actions' })
  let cards: NoteCard[] = []
  let selected: NoteCard | null = null
  let armedId: string | null = null
  let newButton: HTMLButtonElement | null = null

  const open = async (card: NoteCard): Promise<void> => {
    preview.stop()

    const progress = openProgress(t('home.opening'))

    try {
      const note = await session.openNote(card.id)

      progress.close()
      openEditor(note)
    } catch (error) {
      progress.close()
      console.error(error)
      toast(t('home.openFailed'), { isError: true })
    }
  }

  const select = (card: NoteCard): void => {
    if (selected?.id === card.id) return

    selected = card

    fill(titleLine, card.title || t('home.untitled'))
    fill(
      detailLine,
      h('span', { class: 'badge' }, profileLabel(card.profile)),
      ' ',
      plural('common.pages', card.pages),
      ' · ',
      formatDate(card.modified),
    )

    for (const element of grid.children) {
      element.classList.toggle(
        'is-selected',
        element.getAttribute('data-id') === card.id,
      )
    }

    preview.show(card)
    renderInfoActions(card)
  }

  const renderInfoActions = (card: NoteCard): void => {
    fill(
      infoActions,
      key({
        icon: 'play',
        label: t('home.open'),
        variant: 'primary',
        class: 'info-open',
        onPress: () => void open(card),
      }),
      key({
        icon: 'more',
        title: t('common.more'),
        onPress: button => showCardMenu(card, button),
      }),
    )
  }

  const renderView = (): void => {
    const isList = settings.shelfView.peek() === 'list'
    const label = t(isList ? 'home.viewGrid' : 'home.viewList')

    grid.classList.toggle('is-list', isList)
    fill(viewButton, icon(isList ? 'grid' : 'list'))
    viewButton.title = label
    viewButton.setAttribute('aria-label', label)
  }

  const showSortMenu = (anchor: HTMLElement): void => {
    openMenu(
      anchor,
      SORTS.map(sort => ({
        label: t(SORT_LABELS[sort]),
        icon: sort === settings.shelfSort.peek() ? 'check' : undefined,
        onSelect: () => {
          settings.shelfSort.value = sort
          if (sortLabel) sortLabel.textContent = t(SORT_LABELS[sort])
          renderGrid()
          scrollToSelected()
        },
      })),
    )
  }

  const toggleBookmark = (card: NoteCard): void => {
    const marks = settings.bookmarks.peek()

    settings.bookmarks.value = marks.includes(card.id)
      ? marks.filter(id => id !== card.id)
      : [...marks, card.id]
    renderGrid()
    scrollToSelected()
  }

  const scrollToSelected = (): void => {
    grid
      .querySelector<HTMLElement>('.card.is-selected')
      ?.scrollIntoView({ block: 'nearest' })
  }

  const showCardMenu = (card: NoteCard, anchor: HTMLElement): void => {
    openMenu(anchor, [
      {
        label: t(isBookmarked(card) ? 'home.unbookmark' : 'home.bookmark'),
        icon: 'bookmark',
        onSelect: () => toggleBookmark(card),
      },
      {
        label: t('home.duplicate'),
        icon: 'pages',
        onSelect: () => void duplicate(card),
      },
      {
        label: t('home.saveFile'),
        icon: 'download',
        onSelect: () => void exportFile(card),
      },
      null,
      {
        label: t('home.delete'),
        icon: 'trash',
        isDanger: true,
        onSelect: () => void remove(card),
      },
    ])
  }

  const duplicate = async (card: NoteCard): Promise<void> => {
    const library = session.library

    if (!library) return

    const title = t('home.copyOf', { title: card.title })

    await library.duplicateNote(card.id, createId(), title)
    await refresh()
  }

  const exportFile = async (card: NoteCard): Promise<void> => {
    const progress = openProgress(t('home.saving'))

    try {
      const file = await exportSaved(
        session.savedAs(card.id),
        'ugb',
        1,
        false,
        ratio => progress.set(ratio),
      )

      saveFile(file.blob, file.fileName)
    } finally {
      progress.close()
    }
  }

  const remove = async (card: NoteCard): Promise<void> => {
    const library = session.library

    if (!library) return

    await library.trashNote(card.id, true)
    await refresh()

    toast(t('home.deleted'), {
      actionLabel: t('common.undo'),
      onAction: () => {
        void library.trashNote(card.id, false).then(refresh)
      },
    })
  }

  const renderGrid = (): void => {
    const now = Date.now()

    cards = sortCards(cards, settings.shelfSort.peek())
    fill(
      grid,
      cards.map(card =>
        h(
          'button',
          {
            class: `card${selected?.id === card.id ? ' is-selected' : ''}`,
            'data-kind': card.profile,
            type: 'button',
            'data-nav': true,
            'data-id': card.id,
            role: 'option',
            'aria-label': card.title || t('home.untitled'),
            onFocus: () => select(card),
            onClick: (event: MouseEvent) => {
              const isKeyPress = event.detail === 0

              if (
                armedId === card.id ||
                (isKeyPress && selected?.id === card.id)
              ) {
                void open(card)

                return
              }

              select(card)
              armedId = card.id
            },
          },
          h('span', { class: 'card-title' }, card.title || t('home.untitled')),
          h(
            'span',
            { class: 'card-picture', 'data-paper': card.paperStyle },
            coverCanvas(card),
          ),
          h(
            'span',
            { class: 'card-meta' },
            t('home.meta', {
              pages: plural('common.pages', card.pages),
              when: formatRelative(card.modified, now),
            }),
          ),
          isBookmarked(card)
            ? h('span', { class: 'card-ribbon', 'aria-hidden': 'true' })
            : null,
        ),
      ),
    )
  }

  const renderEmpty = (): void => {
    preview.stop()
    fill(titleLine, t('home.emptyTitle'))
    fill(detailLine)
    fill(infoActions)
    fill(grid, h('p', { class: 'shelf-empty' }, t('home.emptyDetail')))
    selected = null
  }

  const refresh = async (): Promise<void> => {
    cards = await session.listCards()

    if (cards.length === 0) {
      renderEmpty()

      return
    }

    renderGrid()

    const next = cards.find(card => card.id === selected?.id) ?? cards[0]

    selected = null
    select(next)
  }

  const createAndOpen = async (options: NoteOptions): Promise<void> => {
    preview.stop()

    const note = await session.createNote(options)

    openEditor(note)
  }

  const loadFile = async (file: File): Promise<void> => {
    const progress = openProgress(t('home.importing'))

    try {
      const note = await session.importFile(file)

      progress.close()
      toast(t('home.imported'))
      openEditor(note)
    } catch (error) {
      progress.close()
      console.error(error)
      toast(t('home.importFailed'), { isError: true })
    }
  }

  const importFile = async (): Promise<void> => {
    const file = await pickFile(FILE_TYPES)

    if (file) await loadFile(file)
  }

  scope.listen(window, 'dragover', event => event.preventDefault())

  scope.listen(window, 'drop', event => {
    const file = event.dataTransfer?.files[0]

    event.preventDefault()

    if (file) void loadFile(file)
  })

  newButton = key({
    icon: 'plus',
    label: t('home.new'),
    variant: 'primary',
    class: 'action-new',
    onPress: () => openNewNoteDialog(createAndOpen),
  })

  const actions = h(
    'div',
    { class: 'home-actions' },
    newButton,
    key({
      icon: 'upload',
      title: t('home.import'),
      onPress: () => void importFile(),
    }),
    key({
      icon: 'gear',
      title: t('settings.title'),
      onPress: () => openAppSettings(app),
    }),
  )

  const element = h(
    'div',
    { class: 'scene home' },
    h(
      'header',
      { class: 'statusbar' },
      h('span', { class: 'statusbar-logo' }, t('app.name')),
      h('span', { class: 'statusbar-gap' }),
      clock,
    ),
    h(
      'main',
      { class: 'home-screens' },
      h(
        'section',
        { class: 'screen screen-preview' },
        previewFrame,
        h('div', { class: 'preview-info' }, titleLine, detailLine, infoActions),
      ),
      h(
        'section',
        { class: 'screen screen-shelf' },
        h(
          'div',
          { class: 'shelf-head' },
          h('h2', { class: 'screen-heading' }, t('home.shelf')),
          sortButton,
          viewButton,
        ),
        grid,
        actions,
      ),
    ),
  )

  const updateClock = (): void => {
    fill(
      clock,
      new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    )
  }

  updateClock()
  renderView()

  const clockTimer = window.setInterval(updateClock, 20_000)

  scope.add(() => clearInterval(clockTimer))
  scope.add(() => preview.stop())

  const prepare = async (): Promise<void> => {
    const isFirstRun = !localStorage.getItem('flipbook.started')

    if (isFirstRun && session.library) {
      localStorage.setItem('flipbook.started', '1')

      const note = await session.createNote({
        title: t('home.sampleTitle'),
        profile: 'free',
        paperStyle: 'ruled',
      })

      fillSampleNote(note)
      await session.saveNote(note)
    }

    await refresh()
    nav.focusFirst(grid.querySelector<HTMLElement>('.card') ?? newButton)
  }

  void prepare()

  return {
    element,
    initialFocus: () => grid.querySelector<HTMLElement>('.card') ?? newButton,
    guide: () => [
      { button: 'confirm', label: t('guide.select') },
      { button: 'cancel', label: t('guide.back') },
    ],
    touchGuide: () => [
      { fingers: 1, label: t('guide.tapSelect') },
      { fingers: 0, label: t('guide.tapAgain') },
    ],
    dispose: () => scope.dispose(),
  }
}

function wideIndex(profile: ProfileId): number {
  return Math.max(
    0,
    PROFILES[profile].sizes.findIndex(size => size.id === 'wide'),
  )
}

function openNewNoteDialog(
  create: (options: NoteOptions) => Promise<void>,
): void {
  const choice: {
    profile: ProfileId
    size: number
    paper: number
    paperStyle: PaperStyle
  } = {
    profile: 'free',
    size: wideIndex('free'),
    paper: 0,
    paperStyle: 'plain',
  }

  const details = h('div', { class: 'new-details' })
  let dialog: DialogHandle | null = null

  const start = (): void => {
    const profile = PROFILES[choice.profile]
    const size = profile.sizes[choice.size]

    dialog?.close()

    void create({
      title: t('home.defaultTitle'),
      profile: choice.profile,
      width: size.width,
      height: size.height,
      paper: choice.paper,
      paperStyle: choice.paperStyle,
    })
  }

  const kindCards = (['free', 'dsi', '3ds'] as const).map(profile => {
    const card = h(
      'button',
      {
        class: 'kind-card',
        'data-kind': profile,
        type: 'button',
        'data-nav': true,
        'aria-pressed': String(profile === choice.profile),
        onClick: () => {
          choice.profile = profile
          choice.size = wideIndex(profile)
          choice.paper = 0
          choice.paperStyle = 'plain'

          for (const other of kindCards) {
            other.setAttribute('aria-pressed', String(other === card))
          }

          renderDetails()
        },
      },
      icon(profile === 'free' ? 'note' : 'console'),
      h('b', { class: 'kind-name' }, profileLabel(profile)),
      h('span', { class: 'kind-detail' }, t(`profile.${profile}.detail`)),
    )

    return card
  })

  const renderDetails = (): void => {
    const profile = PROFILES[choice.profile]

    if (profile.sizes.length === 1) {
      fill(details)

      return
    }

    fill(
      details,
      h('h3', { class: 'field-label' }, t('new.size')),
      h(
        'div',
        { class: 'chip-row' },
        profile.sizes.map((size, index) =>
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'data-nav': true,
              'aria-pressed': String(index === choice.size),
              onClick: () => {
                choice.size = index
                renderDetails()
              },
            },
            t(`size.${size.id}`),
          ),
        ),
      ),
      h('h3', { class: 'field-label' }, t('new.paper')),
      h(
        'div',
        { class: 'chip-row' },
        (['plain', 'ruled', 'grid', 'dots'] as const).map(style =>
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'data-nav': true,
              'aria-pressed': String(style === choice.paperStyle),
              onClick: () => {
                choice.paperStyle = style
                renderDetails()
              },
            },
            t(`paper.${style}`),
          ),
        ),
      ),
    )
  }

  renderDetails()

  dialog = openDialog({
    title: t('home.new'),
    icon: 'note',
    isWide: true,
    body: [h('div', { class: 'kind-row' }, kindCards), details],
    footer: key({
      icon: 'pen',
      label: t('new.start'),
      variant: 'primary',
      onPress: start,
    }),
  })
}
