import { isRecord, isString, parseListOf } from '../core/guards.ts'
import type { PluginApi, PluginDefinition, PluginHost } from './host.ts'

const STORAGE_KEY = 'flipbook.plugins'

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? '[]',
    )

    return parseListOf(isString)(parsed) ?? []
  } catch {
    return []
  }
}

function writeStored(sources: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sources))
  } catch {}
}

export function pluginFromModule(module: unknown): PluginDefinition {
  const definition = isRecord(module) ? module.default : null

  if (!isRecord(definition)) throw new Error('プラグインの形が正しくありません')

  const { id, name, version, description, setup } = definition

  if (!isString(id) || typeof setup !== 'function') {
    throw new Error('プラグインの形が正しくありません')
  }

  return {
    id,
    name: isString(name) ? name : id,
    version: isString(version) ? version : '',
    description: isString(description) ? description : undefined,
    setup: (api: PluginApi) => {
      const cleanup: unknown = Reflect.apply(setup, definition, [api])

      if (typeof cleanup !== 'function') return

      return () => {
        Reflect.apply(cleanup, undefined, [])
      }
    },
  }
}

async function evaluate(source: string): Promise<PluginDefinition> {
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)

  try {
    return pluginFromModule(await import(url))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function definePluginFromFile(
  file: File,
  host: PluginHost,
): Promise<void> {
  const source = await file.text()

  host.define(await evaluate(source))

  const sources = readStored()

  if (!sources.includes(source)) writeStored([...sources, source])
}

export async function loadStoredPlugins(host: PluginHost): Promise<void> {
  for (const source of readStored()) {
    try {
      host.define(await evaluate(source))
    } catch (error) {
      console.error('プラグインを読み込めません', error)
    }
  }
}
