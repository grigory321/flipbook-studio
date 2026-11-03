import { createId, Note, type NoteOptions } from '../core/note.ts'
import { Signal } from '../core/signal.ts'
import { Store } from '../core/store.ts'
import { Mixer } from '../audio/mixer.ts'
import { makeCard } from '../file/card.ts'
import { COMPACT_MIN_BYTES } from '../file/compaction.ts'
import { Library, type NoteCard } from '../file/library.ts'
import { PluginHost, registries } from '../plugin/host.ts'
import {
  CORE_IMPORTERS,
  CORE_PLUGIN,
  TONE_PLUGIN,
} from '../plugin/core-plugins.ts'
import type { Saved } from '../worker/protocol.ts'
import { compactInBackground, importInBackground } from './background.ts'
import { settings } from './settings.ts'
import type { Editor } from './editor.ts'

const AUTOSAVE_DELAY_MS = 1200
const MIB = 1024 * 1024

declare global {
  interface Navigator {
    readonly deviceMemory?: number
  }
}

function memoryBudget(): number {
  const device = navigator.deviceMemory ?? 4

  return Math.max(64, Math.min(512, device * 32)) * MIB
}

export type SaveState = 'saved' | 'saving' | 'failed'

export class Session {
  readonly mixer = new Mixer()
  readonly host: PluginHost
  readonly saveState = new Signal<SaveState>('saved')
  readonly cardsVersion = new Signal(0)
  library: Library | null = null
  editor: Editor | null = null

  private saveTimer = 0
  private saveTarget: Editor | null = null
  private saving: Promise<void> | null = null

  constructor() {
    this.host = new PluginHost(id =>
      settings.disabledPlugins.peek().includes(id),
    )
  }

  async start(): Promise<void> {
    this.library = await Library.open()

    if (!this.library) this.saveState.value = 'failed'

    this.host.define(CORE_PLUGIN)
    this.host.define(TONE_PLUGIN)
    await this.library?.purgeTrash()
  }

  private newStore(id: string): Store {
    return new Store({
      backend: this.library?.backendFor(id) ?? null,
      budget: memoryBudget(),
    })
  }

  listCards(): Promise<NoteCard[]> {
    return this.library?.listCards() ?? Promise.resolve([])
  }

  async createNote(options: NoteOptions): Promise<Note> {
    const id = createId()
    const note = Note.create(options, this.newStore(id))

    note.meta.id = id
    await this.saveNote(note)

    return note
  }

  async openNote(id: string): Promise<Note> {
    if (!this.library) throw new Error('ノート棚を開けません')

    const note = await this.library.loadNote(id, memoryBudget())

    await note.ensurePages(0, 1)

    return note
  }

  async importFile(file: File): Promise<Note> {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    const importer = registries.importers
      .list()
      .find(item => item.extensions.includes(extension))

    if (!importer) throw new RangeError('unsupported')

    const id = createId()

    if (this.library && CORE_IMPORTERS.includes(importer)) {
      await importInBackground(file, this.savedAs(id))
      Signal.bump(this.cardsVersion)

      return this.openNote(id)
    }

    const note = await importer.run(file, { store: this.newStore(id) })

    note.meta.id = id
    await this.saveNote(note)

    return note
  }

  async saveNote(note: Note): Promise<void> {
    if (!this.library) return

    await note.ensurePages(0, 1)
    note.meta.modified = Date.now()
    await this.library.saveNote(note, makeCard(note))
    Signal.bump(this.cardsVersion)
  }

  savedAs(noteId: string): Saved {
    return { noteId, budget: memoryBudget() }
  }

  async savedCopy(note: Note): Promise<Saved | null> {
    await this.flushSave()

    return this.library && this.saveState.peek() === 'saved'
      ? this.savedAs(note.meta.id)
      : null
  }

  async compactNote(note: Note): Promise<void> {
    if (!this.library || note.store.writtenBytes < COMPACT_MIN_BYTES) return

    if (await compactInBackground(this.savedAs(note.meta.id))) {
      Signal.bump(this.cardsVersion)
    }
  }

  scheduleSave(editor: Editor): void {
    if (!this.library) return

    this.saveTarget = editor
    this.saveState.value = 'saving'
    clearTimeout(this.saveTimer)
    this.saveTimer = window.setTimeout(
      () => void this.flushSave(),
      AUTOSAVE_DELAY_MS,
    )
  }

  async flushSave(): Promise<void> {
    clearTimeout(this.saveTimer)

    while (this.saving) await this.saving

    const editor = this.saveTarget

    if (!editor) return

    this.saveTarget = null
    this.saving = this.writeSave(editor)
    await this.saving
    this.saving = null
  }

  private async writeSave(editor: Editor): Promise<void> {
    try {
      await this.saveNote(editor.note)
      this.saveState.value = this.saveTarget ? 'saving' : 'saved'
    } catch (error) {
      console.error('保存に失敗しました', error)
      this.saveState.value = 'failed'
    }
  }
}
