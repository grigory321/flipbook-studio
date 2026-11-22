import { clearResume, readResume } from './app/resume.ts'
import { Session } from './app/session.ts'
import { settings, startSavingSettings } from './app/settings.ts'
import type { Note } from './core/note.ts'
import { loadStoredPlugins } from './plugin/loader.ts'
import type { PluginDefinition } from './plugin/host.ts'
import { App } from './ui/app.ts'
import { editorScene } from './ui/editor/scene.ts'
import { nav } from './ui/nav.ts'
import { installOverlays, toast } from './ui/overlay.ts'
import { homeScene } from './ui/scene-home.ts'
import { shouldSkipTitle, titleScene } from './ui/scene-title.ts'
import { applyLanguageSetting } from './ui/settings-dialog.ts'

declare global {
  interface Window {
    FlipBook: {
      version: string
      definePlugin: (definition: PluginDefinition) => void
    }
  }
}

async function start(): Promise<void> {
  const root = document.getElementById('app')

  if (!root) return

  applyLanguageSetting()
  startSavingSettings()
  nav.install()
  installOverlays()

  const session = new Session()
  const app = new App(session)

  app.mount(root)

  await session.start()

  session.host.connect({
    editor: () => session.editor,
    toast: message => toast(message),
  })

  window.FlipBook = {
    version: '1.0.0',
    definePlugin: definition => session.host.define(definition),
  }

  await loadStoredPlugins(session.host)

  const showHome = (): void => {
    void app.show(() => homeScene(app, openEditor))
  }

  const openEditor = (note: Note, page = 0): void => {
    void app.show(() => editorScene(app, note, showHome, page))
  }

  const resume = settings.titleEveryTime.peek() ? null : readResume()

  if (resume) {
    try {
      const note = await session.openNote(resume.id)
      const page = Math.max(0, Math.min(note.frames.count - 1, resume.page))

      await note.ensurePages(page, 1)
      openEditor(note, page)
      registerServiceWorker()

      return
    } catch (error) {
      console.error(error)
      clearResume()
    }
  }

  if (shouldSkipTitle()) showHome()
  else void app.show(() => titleScene({ onStart: showHome }))

  registerServiceWorker()
}

function registerServiceWorker(): void {
  const isServed =
    location.protocol === 'https:' || location.hostname === 'localhost'

  if (
    isServed &&
    'serviceWorker' in navigator &&
    !location.search.includes('dev')
  ) {
    void navigator.serviceWorker.register('sw.js').catch(() => {})
  }
}

void start()
