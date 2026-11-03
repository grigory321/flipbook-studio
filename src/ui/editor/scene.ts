import { Editor } from '../../app/editor.ts'
import { Player } from '../../app/player.ts'
import { settings } from '../../app/settings.ts'
import type { Note } from '../../core/note.ts'
import { Signal } from '../../core/signal.ts'
import { t } from '../../i18n/index.ts'
import { registries, type Panel } from '../../plugin/host.ts'
import type { Tool } from '../../app/tools.ts'
import type { App, Scene } from '../app.ts'
import type { SaveState } from '../../app/session.ts'
import { eventElement, fill, h, icon, key, Scope, setPressed } from '../dom.ts'
import { nav } from '../nav.ts'
import { type MenuItem, openMenu, toast } from '../overlay.ts'
import { openAppSettings } from '../settings-dialog.ts'
import { playSfx } from '../sfx.ts'
import {
  openExportDialog,
  openNoteSettings,
  openShortcuts,
  openTips,
} from './dialogs.ts'
import { openImageImport } from './image-dialog.ts'
import {
  openAddPagesDialog,
  openJumpDialog,
  openPathDialog,
  openRangeDialog,
  openWobbleDialog,
} from './make-dialogs.ts'
import { openTextDialog } from './text-dialog.ts'
import { LayerPanel, PenPanel, updateColorChip } from './panels.ts'
import { openSoundPicker } from './sound-panel.ts'
import { Stage } from './stage.ts'
import { PageStrip } from './strip.ts'

const BUILTIN_TABS = ['pen', 'layers'] as const

const TAB_ICONS: Readonly<Record<string, string>> = {
  pen: 'pen',
  layers: 'layers',
}

const SAVE_ICONS: Readonly<Record<SaveState, string>> = {
  saved: 'check',
  saving: 'saving',
  failed: 'alert',
}

const PHONE_LAYOUT_QUERY = '(max-width: 559px)'
const ONE_BAR_QUERY = '(max-height: 520px) and (min-width: 560px)'
const MORE_TOOLS_FROM = 60
const TOOL_GROUP = 10
const SHEET_QUERY = '(max-width: 1080px), (max-height: 520px)'
const STRIP_CLOSED_QUERY =
  '(max-height: 520px), (min-width: 721px) and (max-width: 1180px), (min-width: 721px) and (pointer: coarse)'

interface PanelView {
  element: HTMLElement
  dispose(): void
}

export function editorScene(app: App, note: Note, onExit: () => void): Scene {
  const session = app.session
  const scope = new Scope()
  const editor = new Editor(note, {
    onChange: () => session.scheduleSave(editor),
  })

  editor.patternSource = () => registries.patterns.list()

  const quickTool = (
    id: string,
    order: number,
    activate: () => void,
    letter?: string,
  ): Tool => ({
    id,
    icon: id,
    nameKey: `tool.${id}`,
    key: letter,
    order,
    options: 'none',
    usesSurface: false,
    activate,
    down: () => null,
    move: () => {},
    up: () => {},
  })

  scope.add(
    registries.tools.add(
      quickTool('text', 60, () => openTextDialog(editor), 't'),
    ),
  )
  scope.add(
    registries.tools.add(
      quickTool('image', 61, () => void openImageImport(editor)),
    ),
  )

  session.editor = editor

  const isSheetOpen = new Signal(false)
  const activeTab = new Signal<string>('pen')
  const sheetQuery = matchMedia(SHEET_QUERY)
  const phoneQuery = matchMedia(PHONE_LAYOUT_QUERY)
  const oneBarQuery = matchMedia(ONE_BAR_QUERY)
  const isPhone = (): boolean => phoneQuery.matches
  const isOneBar = (): boolean => oneBarQuery.matches
  const isSheet = (): boolean =>
    sheetQuery.matches || settings.panelFolded.peek()

  const compactView = matchMedia(STRIP_CLOSED_QUERY)
  const stripShown = new Signal(!compactView.matches)
  const soundRowsShown = new Signal(false)

  const onViewChange = (event: MediaQueryListEvent): void => {
    stripShown.value = !event.matches
  }

  compactView.addEventListener('change', onViewChange)
  scope.add(() => compactView.removeEventListener('change', onViewChange))

  const toggleSoundRows = (): void => {
    const isShown = stripShown.peek() && soundRowsShown.peek()

    stripShown.value = true
    soundRowsShown.value = !isShown
  }

  const toolFor = () => registries.tools.get(editor.toolId.peek())

  const showError = (): void => playSfx('error')

  const undo = (): void => {
    if (!editor.history.canUndo) {
      showError()

      return
    }

    editor.undo()
    playSfx('back')
  }

  const redo = (): void => {
    if (!editor.history.canRedo) {
      showError()

      return
    }

    editor.redo()
    playSfx('move')
  }

  const stage = new Stage(editor, toolFor, {
    undo,
    redo,
    path: () => selectTool('path'),
  })

  const strip = new PageStrip(editor, {
    onAddPage: () => addPages(),
    onPickTrack: track => openSoundPicker(editor, session, track),
  })

  const player = new Player(note, editor.compositor, session.mixer, {
    present: (region, page) => stage.present(region, page),
    onPage: page => {
      editor.page.value = page
    },
    onEnded: page => stopPlaying(page),
  })

  const startPlaying = (): void => {
    editor.dropFloating()
    editor.isPlaying.value = true

    void session.mixer.ready().then(() => {
      if (editor.isPlaying.peek()) player.start(editor.page.peek())
    })
  }

  const stopPlaying = (page = editor.page.peek()): void => {
    if (player.running) player.stop()

    editor.isPlaying.value = false
    editor.restorePlanes(page)
  }

  const togglePlay = (): void => {
    if (editor.isPlaying.peek()) stopPlaying()
    else startPlaying()
  }

  const stepPage = (delta: number): void => {
    if (editor.isPlaying.peek()) return

    const count = editor.pageCount
    const next = editor.page.peek() + delta

    if (next === count) {
      addPages()

      return
    }

    if (next < 0 || next > count) {
      showError()

      return
    }

    playSfx('page')
    void editor.goTo(next).then(() => {
      if (settings.stepSounds.peek()) session.mixer.playMarks(note, next)
    })
  }

  const addPages = (count = 1): void => {
    if (editor.addPages(count)) playSfx('page')
    else toast(t('page.full'), { isError: true })
  }

  const duplicatePage = (): void => {
    if (editor.duplicatePage()) playSfx('page')
    else toast(t('page.full'), { isError: true })
  }

  const deletePage = (): void => {
    editor.deletePage()
    toast(t('page.deleted'), {
      actionLabel: t('common.undo'),
      onAction: undo,
    })
  }

  const openPageMenu = (anchor: HTMLElement): void => {
    const commands: MenuItem[] = registries.commands.list().map(command => ({
      label: command.nameKey
        ? t(command.nameKey)
        : (command.name ?? command.id),
      icon: command.icon,
      onSelect: () => void command.run(editor),
    }))

    const isHidden = (element: HTMLElement): boolean =>
      element.offsetWidth === 0
    const hiddenItems: MenuItem[] = [
      ...(isHidden(speedMeter)
        ? [
            {
              label: t('play.slower'),
              icon: 'turtle',
              isDisabled: note.meta.speed === 0,
              onSelect: () => setSpeed(note.meta.speed - 1),
            },
            {
              label: t('play.faster'),
              icon: 'rabbit',
              isDisabled: note.meta.speed === note.profile.speeds.length - 1,
              onSelect: () => setSpeed(note.meta.speed + 1),
            },
          ]
        : []),
      ...(isHidden(loopButton)
        ? [
            {
              label: t('play.loop'),
              icon: note.meta.loop ? 'check' : 'loop',
              onSelect: () => editor.setLoop(!note.meta.loop),
            },
          ]
        : []),
      ...(isHidden(onionButton)
        ? [
            {
              label: t('play.onion'),
              icon: editor.onion.peek() ? 'check' : 'onion',
              onSelect: () => {
                editor.onion.value = !editor.onion.peek()
              },
            },
          ]
        : []),
      ...(isHidden(soundRowsButton)
        ? [
            {
              label: t('page.soundRows'),
              icon: soundRowsShown.peek() ? 'check' : 'music',
              onSelect: toggleSoundRows,
            },
          ]
        : []),
    ]
    const narrowItems: (MenuItem | null)[] = hiddenItems.length
      ? [...hiddenItems, null]
      : []

    openMenu(anchor, [
      ...narrowItems,
      {
        label: t('page.addMany'),
        icon: 'plus',
        onSelect: () => openAddPagesDialog(editor, addPages),
      },
      {
        label: t('page.duplicate'),
        icon: 'pages',
        hint: 'D',
        onSelect: duplicatePage,
      },
      {
        label: t('page.copy'),
        icon: 'copy',
        hint: 'Ctrl+C',
        onSelect: () => {
          editor.copyPage()
          pastesPicture = false
          toast(t('page.copied'))
        },
      },
      {
        label: t('page.paste'),
        icon: 'paste',
        hint: 'Ctrl+V',
        isDisabled: !editor.hasPageClipboard,
        onSelect: () => {
          editor.pastePage()
        },
      },
      null,
      {
        label: t('wobble.title'),
        icon: 'wobble',
        onSelect: () => openWobbleDialog(editor),
      },
      {
        label: t('range.title'),
        icon: 'pages',
        onSelect: () => openRangeDialog(editor),
      },
      {
        label: t('page.clearLayer'),
        icon: 'eraser',
        onSelect: () => editor.clearLayer(),
      },
      ...commands,
      null,
      {
        label: t('page.delete'),
        icon: 'trash',
        hint: 'Del',
        isDanger: true,
        onSelect: deletePage,
      },
    ])
  }

  const openMainMenu = (anchor: HTMLElement): void => {
    openMenu(anchor, [
      {
        label: t('menu.note'),
        icon: 'note',
        onSelect: () => openNoteSettings(editor, () => renderTitle()),
      },
      {
        label: t(isTouchInput() ? 'gesture.title' : 'menu.keys'),
        icon: isTouchInput() ? 'help' : 'keyboard',
        onSelect: () => openShortcuts(isTouchInput()),
      },
      {
        label: t('menu.tips'),
        icon: 'help',
        onSelect: () => openTips(nav.inputKind === 'touch'),
      },
      null,
      {
        label: t('settings.title'),
        icon: 'gear',
        onSelect: () => openAppSettings(app),
      },
    ])
  }

  const exit = (): void => {
    if (editor.isPlaying.peek()) stopPlaying()

    editor.dropFloating()

    if (note.dropUnusedSounds() > 0) session.scheduleSave(editor)

    void session
      .flushSave()
      .then(() => session.compactNote(note))
      .catch(error => console.error('回収に失敗しました', error))
      .then(onExit)
  }

  const titleText = h('span', { class: 'top-title-text' })

  const renderTitle = (): void => {
    fill(titleText, note.meta.title || t('home.untitled'))
  }

  renderTitle()

  const saveMark = h('span', { class: 'save-mark', role: 'status' })
  let shownSave: SaveState = 'saved'

  scope.effect(() => {
    const state = session.saveState.value

    saveMark.className = `save-mark is-${state}`
    fill(saveMark, icon(SAVE_ICONS[state]))
    saveMark.title = t(`save.${state}`)
    saveMark.setAttribute('aria-label', t(`save.${state}`))

    if (state === 'failed' && shownSave !== 'failed') {
      toast(t('save.failed'), { isError: true })
    }

    shownSave = state
  })

  const undoButton = key({
    icon: 'undo',
    title: t('common.undo'),
    onPress: undo,
  })
  const redoButton = key({
    icon: 'redo',
    title: t('common.redo'),
    class: 'top-redo',
    onPress: redo,
  })

  scope.effect(() => {
    editor.historyVersion.value
    undoButton.disabled = !editor.history.canUndo
    redoButton.disabled = !editor.history.canRedo
  })

  const backKey = key({
    icon: 'back',
    title: t('common.back'),
    class: 'top-back',
    onPress: exit,
  })
  const titleButton = h(
    'button',
    {
      class: 'top-title',
      type: 'button',
      'data-nav': true,
      onClick: () => openNoteSettings(editor, renderTitle),
    },
    titleText,
  )
  const topGap = h('span', { class: 'top-gap' })
  const panelKey = key({
    icon: 'sidebar',
    title: t('panel.fold'),
    class: 'top-panel',
    onPress: () => setFolded(!settings.panelFolded.peek()),
  })
  const menuKey = key({
    icon: 'more',
    title: t('common.more'),
    class: 'top-menu',
    onPress: openMainMenu,
  })
  const exportKey = key({
    icon: 'share',
    label: t('export.short'),
    variant: 'primary',
    class: 'top-export',
    onPress: () => openExportDialog(editor, session),
  })

  const topBar = h('header', { class: 'ed-top' })

  const toolButtons = new Map<string, HTMLButtonElement>()

  const selectTool = (id: string): void => {
    const tool = registries.tools.get(id)

    if (tool?.activate) {
      tool.activate()

      return
    }

    if (id !== 'path') editor.dropFloating()
    else toast(t('path.hint'))

    editor.toolId.value = id
    activeTab.value = 'pen'
  }

  const toolName = (tool: Tool): string =>
    tool.nameKey ? t(tool.nameKey) : (tool.name ?? tool.id)

  const usableTools = (): Tool[] =>
    registries.tools
      .list()
      .filter(tool => tool.id !== 'picker' || note.profile.id === 'free')
      .sort((a, b) => a.order - b.order)

  const isInRail = (tool: Tool): boolean =>
    tool.order < MORE_TOOLS_FROM && !toolButtons.get(tool.id)?.hidden

  const openToolMenu = (anchor: HTMLElement): void => {
    const items: (MenuItem | null)[] = []
    let group = -1

    for (const tool of usableTools()) {
      if (isInRail(tool)) continue

      const next =
        tool.order < MORE_TOOLS_FROM ? 0 : Math.floor(tool.order / TOOL_GROUP)

      if (group >= 0 && next !== group) items.push(null)

      group = next
      items.push({
        label: toolName(tool),
        icon: tool.icon,
        onSelect: () => selectTool(tool.id),
      })
    }

    openMenu(anchor, items)
  }

  const moreToolKey = h('button', {
    class: 'tool-key',
    type: 'button',
    'data-nav': true,
    onClick: () => openToolMenu(moreToolKey),
  })

  const showMoreTool = (): void => {
    const current = registries.tools.get(editor.toolId.peek())
    const isInside = !!current && !isInRail(current)
    const label = isInside ? toolName(current) : t('tool.more')

    moreToolKey.title = label
    moreToolKey.setAttribute('aria-label', label)
    setPressed(moreToolKey, isInside)
    fill(
      moreToolKey,
      icon(isInside ? current.icon : 'more'),
      h('span', { class: 'tool-label' }, label),
    )
  }

  const toolList = (): HTMLElement[] => {
    toolButtons.clear()

    const buttons = usableTools()
      .filter(tool => tool.order < MORE_TOOLS_FROM)
      .map(tool => {
        const label = toolName(tool)
        const button = h(
          'button',
          {
            class: 'tool-key',
            type: 'button',
            'data-nav': true,
            title: label,
            'aria-label': label,
            onClick: () => {
              const wasSelected = editor.toolId.peek() === tool.id

              selectTool(tool.id)

              if (wasSelected && isSheet()) openTab('pen')
            },
          },
          icon(tool.icon),
          h('span', { class: 'tool-label' }, label),
        )

        toolButtons.set(tool.id, button)

        return button
      })

    return [...buttons, moreToolKey]
  }

  const colorChip = h(
    'button',
    {
      class: 'color-chip',
      type: 'button',
      'data-nav': true,
      'aria-label': t('pen.color'),
      title: t('pen.color'),
      onClick: () => {
        activeTab.value = 'pen'
        isSheetOpen.value = !isSheetOpen.peek()
      },
    },
    h('span', { class: 'color-chip-dot' }),
  )

  const tools = h('nav', { class: 'ed-tools', 'aria-label': t('tool.box') })

  const fitTools = (): void => {
    const hideable = [
      colorChip,
      ...[...toolButtons.values()].slice(1).reverse(),
    ]

    for (const item of hideable) item.hidden = false

    for (const item of hideable) {
      if (tools.scrollHeight <= tools.clientHeight + 1) break

      item.hidden = true
    }

    showMoreTool()
  }

  scope.effect(() => {
    registries.tools.version.value
    fill(tools, toolList(), h('span', { class: 'tools-gap' }), colorChip)
    fitTools()
  })

  const toolsSize = new ResizeObserver(fitTools)

  toolsSize.observe(tools)
  scope.add(() => toolsSize.disconnect())

  scope.effect(() => {
    const current = editor.toolId.value

    registries.tools.version.value

    for (const [id, button] of toolButtons) setPressed(button, id === current)

    showMoreTool()
  })

  scope.effect(() => {
    editor.ink.value
    editor.page.value
    editor.layer.value
    editor.settingsVersion.value
    updateColorChip(colorChip, editor)
  })

  const panelHost = h('div', { class: 'panel-host' })
  const tabRow = h('div', { class: 'panel-tabs', role: 'tablist' })
  let panelView: PanelView | null = null

  const makePanel = (id: string): PanelView => {
    if (id === 'pen') return new PenPanel(editor)
    if (id === 'layers') return new LayerPanel(editor)

    return pluginPanelView(registries.panels.get(id), editor)
  }

  const tabLabel = (id: string): string => {
    const panel = registries.panels.get(id)

    if (panel) return panel.nameKey ? t(panel.nameKey) : (panel.name ?? id)

    return t(`panel.${id}`)
  }

  const tabIds = (): string[] => [
    ...BUILTIN_TABS,
    ...registries.panels.list().map(panel => panel.id),
  ]

  const setFolded = (isFolded: boolean): void => {
    isSheetOpen.value = false
    settings.panelFolded.value = isFolded
  }

  const renderTabs = (): void => {
    const current = activeTab.peek()

    fill(
      tabRow,
      tabIds().map(id =>
        h(
          'button',
          {
            class: 'panel-tab',
            type: 'button',
            role: 'tab',
            'data-nav': true,
            'aria-selected': String(id === current),
            onClick: () => {
              activeTab.value = id
              isSheetOpen.value = true
            },
          },
          icon(TAB_ICONS[id] ?? registries.panels.get(id)?.icon ?? 'plugin'),
          h('span', { class: 'panel-tab-label' }, tabLabel(id)),
        ),
      ),
    )
  }

  scope.effect(() => {
    const id = activeTab.value

    registries.panels.version.value
    panelView?.dispose()
    panelView = makePanel(id)
    fill(panelHost, panelView.element)
    renderTabs()
  })

  const sheetTitle = h('h2', { class: 'sheet-title' })

  const side = h(
    'aside',
    {
      class: 'ed-side',
      'aria-label': t('panel.title'),
      onClick: event => {
        if (!isSheet() || activeTab.peek() !== 'pen') return

        if (eventElement(event)?.closest('.choice, .swatch')) {
          isSheetOpen.value = false
        }
      },
    },
    h(
      'div',
      { class: 'sheet-head' },
      sheetTitle,
      key({
        icon: 'close',
        title: t('common.close'),
        variant: 'ghost',
        onPress: () => {
          isSheetOpen.value = false
        },
      }),
    ),
    tabRow,
    panelHost,
  )

  const sideTabs = h('div', {
    class: 'side-tabs',
    role: 'tablist',
    'aria-label': t('panel.title'),
  })

  const openTab = (id: string): void => {
    const isShown = isSheetOpen.peek() && activeTab.peek() === id

    activeTab.value = id
    isSheetOpen.value = !isShown
  }

  scope.effect(() => {
    const isOpen = isSheetOpen.value
    const current = activeTab.value

    registries.panels.version.value
    side.classList.toggle('is-open', isOpen)
    sheetTitle.textContent = tabLabel(current)
    fill(
      sideTabs,
      tabIds().map(id =>
        h(
          'button',
          {
            class: 'side-tab',
            type: 'button',
            role: 'tab',
            'data-nav': true,
            title: tabLabel(id),
            'aria-label': tabLabel(id),
            'aria-selected': String(isOpen && id === current),
            onClick: () => openTab(id),
          },
          icon(TAB_ICONS[id] ?? registries.panels.get(id)?.icon ?? 'plugin'),
        ),
      ),
    )
  })

  const playButton = key({
    icon: 'play',
    title: t('play.play'),
    variant: 'primary',
    class: 'play-key',
    onPress: togglePlay,
  })

  scope.effect(() => {
    const isPlaying = editor.isPlaying.value

    fill(playButton, icon(isPlaying ? 'pause' : 'play'))
    playButton.setAttribute(
      'aria-label',
      t(isPlaying ? 'play.stop' : 'play.play'),
    )
    side.inert = isPlaying
  })

  const pageNumber = h('b', { class: 'lcd-page' })
  const pageTotal = h('span', { class: 'lcd-total' })
  const nextKey = key({
    icon: 'next',
    title: t('play.next'),
    onPress: () => stepPage(1),
  })

  scope.effect(() => {
    editor.pagesVersion.value

    const page = editor.page.value
    const isLast = page === editor.pageCount - 1
    const nextTitle = t(isLast ? 'play.nextNew' : 'play.next')

    pageNumber.textContent = String(page + 1).padStart(3, '0')
    pageTotal.textContent = String(editor.pageCount).padStart(3, '0')
    nextKey.title = nextTitle
    nextKey.setAttribute('aria-label', nextTitle)
  })

  const speedCells = h('span', { class: 'speed-cells' })

  const setSpeed = (speed: number): void => {
    const speeds = note.profile.speeds
    const next = Math.max(0, Math.min(speeds.length - 1, speed))

    if (next === note.meta.speed) return

    const wasPlaying = editor.isPlaying.peek()

    if (wasPlaying) stopPlaying()

    editor.setSpeed(next)
    playSfx('move')

    if (wasPlaying) startPlaying()
  }

  scope.effect(() => {
    editor.settingsVersion.value

    const count = note.profile.speeds.length

    fill(
      speedCells,
      Array.from({ length: count }, (_, index) =>
        h('button', {
          class: `speed-cell ${index <= note.meta.speed ? 'is-on' : ''}`,
          type: 'button',
          'aria-label': t('play.speedNumber', { n: index + 1 }),
          onClick: () => setSpeed(index),
        }),
      ),
    )
  })

  const speedMeter = h(
    'div',
    { class: 'speed', role: 'group', 'aria-label': t('play.speed') },
    key({
      icon: 'turtle',
      title: t('play.slower'),
      variant: 'ghost',
      onPress: () => setSpeed(note.meta.speed - 1),
    }),
    speedCells,
    key({
      icon: 'rabbit',
      title: t('play.faster'),
      variant: 'ghost',
      onPress: () => setSpeed(note.meta.speed + 1),
    }),
  )

  const loopButton = key({
    icon: 'loop',
    title: t('play.loop'),
    variant: 'ghost',
    class: 'wide-only loop-key',
    onPress: () => editor.setLoop(!note.meta.loop),
  })

  const onionButton = key({
    icon: 'onion',
    title: t('play.onion'),
    variant: 'ghost',
    class: 'wide-only onion-key',
    onPress: () => {
      editor.onion.value = !editor.onion.peek()
    },
  })

  scope.effect(() => {
    editor.settingsVersion.value
    setPressed(loopButton, note.meta.loop)
  })

  scope.effect(() => setPressed(onionButton, editor.onion.value))

  const stripButton = key({
    icon: 'film',
    title: t('page.strip'),
    variant: 'ghost',
    onPress: () => {
      stripShown.value = !stripShown.peek()
      soundRowsShown.value = false
    },
  })

  const soundRowsButton = key({
    icon: 'music',
    title: t('page.soundRows'),
    variant: 'ghost',
    class: 'roomy-only sound-rows-key',
    onPress: toggleSoundRows,
  })

  const transport = h(
    'div',
    { class: 'transport' },
    key({
      icon: 'first',
      title: t('play.first'),
      variant: 'ghost',
      class: 'desk-only',
      onPress: () => void editor.goTo(0),
    }),
    key({
      icon: 'prev',
      title: t('play.previous'),
      onPress: () => stepPage(-1),
    }),
    playButton,
    nextKey,
    key({
      icon: 'last',
      title: t('play.last'),
      variant: 'ghost',
      class: 'desk-only',
      onPress: () => void editor.goTo(editor.pageCount - 1),
    }),
    h(
      'button',
      {
        class: 'lcd',
        type: 'button',
        'data-nav': true,
        title: t('jump.title'),
        'aria-label': t('jump.title'),
        onClick: () => openJumpDialog(editor),
      },
      pageNumber,
      h('span', { class: 'lcd-slash' }, '/'),
      pageTotal,
    ),
    speedMeter,
    loopButton,
    onionButton,
    h('span', { class: 'transport-gap' }),
    stripButton,
    soundRowsButton,
    key({
      icon: 'plus',
      label: t('page.add'),
      variant: 'soft',
      class: 'add-page',
      onPress: () => addPages(),
    }),
    key({
      icon: 'more',
      title: t('page.menu'),
      class: 'page-menu',
      onPress: openPageMenu,
    }),
  )

  const placeTopKeys = (): void => {
    if (isOneBar()) {
      transport.prepend(backKey, saveMark, menuKey, undoButton, redoButton)
      transport.append(exportKey)
    } else {
      topBar.append(
        backKey,
        titleButton,
        saveMark,
        topGap,
        undoButton,
        redoButton,
        panelKey,
        menuKey,
        exportKey,
      )
    }
  }

  const bottom = h('section', { class: 'ed-bottom' }, transport, strip.element)

  const hint = h('p', { class: 'stage-hint' }, t('stage.hint'))

  scope.effect(() => {
    editor.pagesVersion.value
    editor.page.value

    const isBlank =
      editor.pageCount === 1 && note.celRefs(0).every(cel => cel === 0)

    hint.hidden = !isBlank
  })

  stage.addOverlay(hint)

  const element = h(
    'div',
    { class: 'scene editor' },
    topBar,
    tools,
    h('main', { class: 'ed-stage' }, stage.element),
    side,
    sideTabs,
    bottom,
  )

  scope.effect(() => {
    element.dataset.hand = settings.hand.value
  })

  const showPanelLayout = (): void => {
    element.classList.toggle('is-sheet', isSheet())
    element.classList.toggle('is-tool-tabs', isSheet() && !isPhone())
    element.classList.toggle('is-phone', isPhone())
    element.classList.toggle('is-one-bar', isOneBar())
    panelKey.hidden = sheetQuery.matches
    placeTopKeys()
  }

  scope.effect(() => {
    const isFolded = settings.panelFolded.value
    const title = t(isFolded ? 'panel.pin' : 'panel.fold')

    panelKey.title = title
    panelKey.setAttribute('aria-label', title)
    setPressed(panelKey, !isFolded)
    showPanelLayout()
  })

  for (const query of [sheetQuery, phoneQuery, oneBarQuery]) {
    query.addEventListener('change', showPanelLayout)
    scope.add(() => query.removeEventListener('change', showPanelLayout))
  }

  scope.effect(() => {
    element.classList.toggle('has-floating', editor.floating.value !== null)
  })

  let wasTracing = false

  scope.effect(() => {
    const isTracing = editor.isTracingShape.value

    if (isTracing) toast(t('shape.traceHint'))
    else if (wasTracing) toast(t('shape.registered'))

    wasTracing = isTracing
  })

  scope.effect(() => {
    const isOpen = stripShown.value
    const hasLanes = isOpen && soundRowsShown.value

    setPressed(stripButton, isOpen)
    setPressed(soundRowsButton, hasLanes)
    strip.setOpen(isOpen)
    strip.setSoundRows(hasLanes)
    element.classList.toggle('is-strip-closed', !isOpen)
  })

  const closeSheetOnOutside = (event: PointerEvent): void => {
    if (!isSheetOpen.peek() || !isSheet()) return

    const target = eventElement(event)

    const keepers =
      '.ed-side, .side-tabs, .color-chip, .overlay-layer, .tool-key[aria-pressed="true"]'

    if (target?.closest(keepers)) return

    isSheetOpen.value = false

    if (target?.closest('.ed-stage') && !target.closest('button')) {
      event.stopPropagation()
    }
  }

  scope.listen(window, 'pointerdown', closeSheetOnOutside, { capture: true })

  let pastesPicture = false

  const pickKeyTool = (letter: string): boolean => {
    const tool = registries.tools
      .list()
      .find(item => item.key === letter.toLowerCase())

    if (!tool) return false

    selectTool(tool.id)

    return true
  }

  const onKey = (event: KeyboardEvent): void => {
    const target = eventElement(event)

    if (target?.matches('input:not([type="range"])')) return

    if (target?.closest('.overlay-layer')) return

    if (document.querySelector('.dialog-backdrop, .menu-backdrop')) return

    if (handleKey(event)) event.preventDefault()
  }

  const copySelection = (): void => {
    if (editor.floating.peek()) {
      editor.copyFloating()
      pastesPicture = true
      toast(t('select.copied'))
    } else {
      editor.copyPage()
      pastesPicture = false
    }
  }

  const paste = (): void => {
    if (pastesPicture) editor.pasteFloating()
    else editor.pastePage()
  }

  const handleFloatingKey = (event: KeyboardEvent): boolean => {
    const floating = editor.floating.peek()
    const step = event.shiftKey ? 10 : 1
    const moves: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const move = moves[event.key]

    if (!floating) return false

    if (move) {
      floating.moveBy(move[0], move[1])
      editor.touchFloating()
    } else if (event.key === 'Enter') {
      editor.dropFloating()
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      editor.deleteFloating()
    } else {
      return false
    }

    return true
  }

  const handleKey = (event: KeyboardEvent): boolean => {
    const isCommand = event.ctrlKey || event.metaKey
    const letter = event.key.toLowerCase()

    if (isCommand) {
      if (letter === 'z') {
        if (event.shiftKey) redo()
        else undo()
      } else if (letter === 'y') redo()
      else if (letter === 'c') copySelection()
      else if (letter === 'v') paste()
      else if (letter === 'x' && editor.floating.peek()) {
        editor.copyFloating()
        pastesPicture = true
        editor.deleteFloating()
      } else if (letter === 'a') {
        editor.toolId.value = 'select'
        editor.liftAll()
      } else return false

      return true
    }

    if (handleFloatingKey(event)) return true

    switch (event.key) {
      case 'ArrowLeft':
      case 'PageUp':
      case 'q':
        stepPage(-1)

        return true
      case 'ArrowRight':
      case 'PageDown':
      case 'w':
        stepPage(1)

        return true
      case 'Enter':
      case 'Start':
        if (nav.isKeyFocus) return false

        togglePlay()

        return true
      case 'n':
        addPages()

        return true
      case 'd':
        duplicatePage()

        return true
      case 'Delete':
        deletePage()

        return true
      case 'o':
        editor.onion.value = !editor.onion.peek()

        return true
      case '0':
        stage.fit()

        return true
      case 'h':
        if (sheetQuery.matches) return false

        setFolded(!settings.panelFolded.peek())

        return true
      case ' ':
        return !nav.isKeyFocus
      case 'Tab':
        return false
    }

    return pickKeyTool(event.key)
  }

  scope.listen(window, 'keydown', onKey)

  scope.listen(window, 'pagehide', () => {
    void session.flushSave()
  })

  scope.effect(() => {
    const path = editor.tracedPath.value

    if (!path) return

    editor.tracedPath.value = null
    openPathDialog(editor, path, stage.pictureCanvas, () => selectTool('pen'))
  })

  const onCancel = (): void => {
    if (editor.floating.peek()) editor.discardFloating()
    else if (isSheetOpen.peek() && isSheet()) {
      isSheetOpen.value = false
    } else exit()
  }

  session.host.emit('note-open', editor)

  if (!settings.seenTips.peek()) {
    setTimeout(() => openTips(nav.inputKind === 'touch'), 500)
  }

  return {
    element,
    usesArrows: false,
    onCancel,
    initialFocus: () => null,
    guide: () => [
      { button: 'start', label: t('play.play') },
      { button: 'shoulder', label: t('guide.page') },
      { button: 'cancel', label: t('guide.back') },
    ],
    touchGuide: () => [
      { fingers: 2, label: t('guide.undo') },
      { fingers: 3, label: t('guide.redo') },
    ],
    dispose: () => {
      session.editor = null
      session.host.emit('note-close', null)
      player.stop()
      panelView?.dispose()
      stage.dispose()
      strip.dispose()
      scope.dispose()
    },
  }
}

function isTouchInput(): boolean {
  return nav.inputKind === 'touch' || nav.inputKind === 'pen'
}

function pluginPanelView(panel: Panel | undefined, editor: Editor): PanelView {
  const element = h('div', { class: 'panel-body' })
  const cleanup = panel?.render(element, editor)

  return {
    element,
    dispose: () => {
      cleanup?.()
    },
  }
}
