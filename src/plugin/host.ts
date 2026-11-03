import type { Note } from '../core/note.ts'
import type { Pattern } from '../core/patterns.ts'
import { Signal } from '../core/signal.ts'
import type { Store } from '../core/store.ts'
import type { SoundPreset } from '../audio/presets.ts'
import type { Editor } from '../app/editor.ts'
import type { Tool } from '../app/tools.ts'
import type { Saved } from '../worker/protocol.ts'

export interface ExportContext {
  scale?: number
  hasLines?: boolean
  note: Note
  saved?: Saved
  onProgress: (ratio: number) => void
}

export interface ExportResult {
  blob: Blob
  fileName: string
  warnings?: string[]
}

export interface Exporter {
  readonly id: string
  readonly nameKey?: string
  readonly name?: string
  readonly detailKey?: string
  readonly detail?: string
  readonly icon: string
  readonly order: number
  readonly isDevice?: boolean
  readonly isScalable?: boolean
  run(context: ExportContext): Promise<ExportResult>
}

export interface ImportTarget {
  store: Store
}

export interface Importer {
  readonly id: string
  readonly extensions: readonly string[]
  run(file: File, target: ImportTarget): Promise<Note>
}

export interface Command {
  readonly id: string
  readonly nameKey?: string
  readonly name?: string
  readonly icon: string
  run(editor: Editor): void | Promise<void>
}

export interface Panel {
  readonly id: string
  readonly nameKey?: string
  readonly name?: string
  readonly icon: string
  render(container: HTMLElement, editor: Editor): void | (() => void)
}

interface Identified {
  readonly id: string
}

export class Registry<T extends Identified> {
  readonly version = new Signal(0)
  private readonly items = new Map<string, T>()

  add(item: T): () => void {
    this.items.set(item.id, item)
    Signal.bump(this.version)

    return () => {
      if (this.items.get(item.id) === item) this.items.delete(item.id)

      Signal.bump(this.version)
    }
  }

  get(id: string): T | undefined {
    return this.items.get(id)
  }

  list(): T[] {
    return [...this.items.values()]
  }
}

export const registries = {
  tools: new Registry<Tool>(),
  patterns: new Registry<Pattern>(),
  sounds: new Registry<SoundPreset>(),
  exporters: new Registry<Exporter>(),
  importers: new Registry<Importer>(),
  commands: new Registry<Command>(),
  panels: new Registry<Panel>(),
}

export type HostEvent = 'note-open' | 'note-close' | 'page-change'

export interface PluginApi {
  readonly tools: { register(tool: Tool): void }
  readonly patterns: { register(pattern: Pattern): void }
  readonly sounds: { register(sound: SoundPreset): void }
  readonly exporters: { register(exporter: Exporter): void }
  readonly importers: { register(importer: Importer): void }
  readonly commands: { register(command: Command): void }
  readonly panels: { register(panel: Panel): void }
  editor(): Editor | null
  toast(message: string): void
  readData(): unknown
  writeData(value: unknown): void
  on(event: HostEvent, listener: (editor: Editor | null) => void): void
}

export interface PluginDefinition {
  readonly id: string
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly isCore?: boolean
  setup(api: PluginApi): void | (() => void)
}

interface LoadedPlugin {
  definition: PluginDefinition
  cleanups: (() => void)[]
}

export interface HostBridge {
  editor(): Editor | null
  toast(message: string): void
}

export class PluginHost {
  readonly version = new Signal(0)

  private readonly plugins = new Map<string, LoadedPlugin>()
  private readonly definitions = new Map<string, PluginDefinition>()
  private readonly listeners = new Map<
    HostEvent,
    Set<(editor: Editor | null) => void>
  >()
  private readonly isDisabled: (id: string) => boolean
  private bridge: HostBridge = { editor: () => null, toast: () => {} }

  constructor(isDisabled: (id: string) => boolean = () => false) {
    this.isDisabled = isDisabled
  }

  connect(bridge: HostBridge): void {
    this.bridge = bridge
  }

  define(definition: PluginDefinition): void {
    this.definitions.set(definition.id, definition)

    if (definition.isCore || !this.isDisabled(definition.id)) {
      this.enable(definition.id)
    }

    Signal.bump(this.version)
  }

  list(): PluginDefinition[] {
    return [...this.definitions.values()]
  }

  isEnabled(id: string): boolean {
    return this.plugins.has(id)
  }

  enable(id: string): void {
    const definition = this.definitions.get(id)

    if (!definition || this.plugins.has(id)) return

    const cleanups: (() => void)[] = []

    try {
      const cleanup = definition.setup(this.makeApi(definition.id, cleanups))

      if (cleanup) cleanups.push(cleanup)

      this.plugins.set(id, { definition, cleanups })
    } catch (error) {
      for (const dispose of cleanups) dispose()

      console.error(`プラグイン ${id} を開始できません`, error)
    }

    Signal.bump(this.version)
  }

  disable(id: string): void {
    const plugin = this.plugins.get(id)

    if (!plugin || plugin.definition.isCore) return

    for (const cleanup of plugin.cleanups) cleanup()

    this.plugins.delete(id)
    Signal.bump(this.version)
  }

  emit(event: HostEvent, editor: Editor | null): void {
    for (const listener of this.listeners.get(event) ?? []) listener(editor)
  }

  private makeApi(id: string, cleanups: (() => void)[]): PluginApi {
    const registrar = <T extends Identified>(registry: Registry<T>) => ({
      register: (item: T) => {
        cleanups.push(registry.add(item))
      },
    })

    return {
      tools: registrar(registries.tools),
      patterns: registrar(registries.patterns),
      sounds: registrar(registries.sounds),
      exporters: registrar(registries.exporters),
      importers: registrar(registries.importers),
      commands: registrar(registries.commands),
      panels: registrar(registries.panels),
      editor: () => this.bridge.editor(),
      toast: message => this.bridge.toast(message),
      readData: () => this.bridge.editor()?.note.meta.plugins[id],
      writeData: value => {
        const editor = this.bridge.editor()

        if (editor) editor.note.meta.plugins[id] = value
      },
      on: (event, listener) => {
        const set = this.listeners.get(event) ?? new Set()

        set.add(listener)
        this.listeners.set(event, set)
        cleanups.push(() => set.delete(listener))
      },
    }
  }
}
