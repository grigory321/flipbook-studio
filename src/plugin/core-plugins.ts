import { exportInBackground, readNoteFileHere } from '../app/background.ts'
import { restoreMyLibrary } from '../app/my-library.ts'
import { builtinTools } from '../app/tools.ts'
import { SOUND_PRESETS } from '../audio/presets.ts'
import { DEVICE_PATTERNS, patternFromRows } from '../core/patterns.ts'
import type { ExportFormat } from '../worker/protocol.ts'
import type { Exporter, Importer, PluginDefinition } from './host.ts'

function coreExporter(
  format: ExportFormat,
  fields: Omit<Exporter, 'id' | 'run'>,
): Exporter {
  return {
    id: format,
    ...fields,
    run: ({ note, scale, saved, onProgress }) =>
      exportInBackground(note, saved ?? null, format, scale ?? 1, onProgress),
  }
}

export const CORE_IMPORTERS: readonly Importer[] = [
  {
    id: 'ugb',
    extensions: ['.ugb'],
    run: (file, { store }) => readNoteFileHere(file, store),
  },
  {
    id: 'flipnote',
    extensions: ['.ppm', '.kwz'],
    run: (file, { store }) => readNoteFileHere(file, store),
  },
]

const EXTRA_TONES: readonly (readonly [string, string, readonly number[]])[] = [
  ['pattern.sand', 'sand', [0x80, 0x04, 0x20, 0x01, 0x10, 0x82, 0x08, 0x40]],
  ['pattern.wave', 'wave', [0x00, 0x18, 0x24, 0xc3, 0x00, 0x18, 0x24, 0xc3]],
  ['pattern.brick', 'brick', [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08]],
  ['pattern.star', 'star', [0x10, 0x10, 0x7c, 0x38, 0x6c, 0x00, 0x00, 0x00]],
  ['pattern.heart', 'heart', [0x66, 0xff, 0xff, 0x7e, 0x3c, 0x18, 0x00, 0x00]],
  ['pattern.scale', 'scale', [0x81, 0x42, 0x3c, 0x00, 0x18, 0x24, 0xc3, 0x00]],
  ['pattern.rain', 'rain', [0x80, 0x80, 0x00, 0x08, 0x08, 0x00, 0x00, 0x00]],
  [
    'pattern.flower',
    'flower',
    [0x18, 0x7e, 0x66, 0xdb, 0xdb, 0x66, 0x7e, 0x18],
  ],
]

export const CORE_PLUGIN: PluginDefinition = {
  id: 'core.basics',
  name: 'うごくノート',
  version: '1.0.0',
  isCore: true,

  setup(api) {
    for (const tool of builtinTools()) api.tools.register(tool)
    for (const pattern of DEVICE_PATTERNS) api.patterns.register(pattern)

    for (const sound of SOUND_PRESETS) api.sounds.register(sound)

    restoreMyLibrary()

    const exporters: Exporter[] = [
      coreExporter('ugb', {
        nameKey: 'export.ugb',
        detailKey: 'export.ugbDetail',
        icon: 'note',
        order: 10,
      }),
      coreExporter('ppm', {
        nameKey: 'export.ppm',
        detailKey: 'export.ppmDetail',
        icon: 'console',
        order: 20,
        isDevice: true,
      }),
      coreExporter('kwz', {
        nameKey: 'export.kwz',
        detailKey: 'export.kwzDetail',
        icon: 'console',
        order: 30,
        isDevice: true,
      }),
      coreExporter('gif', {
        nameKey: 'export.gif',
        detailKey: 'export.gifDetail',
        icon: 'image',
        order: 40,
        isScalable: true,
      }),
      coreExporter('apng', {
        nameKey: 'export.apng',
        detailKey: 'export.apngDetail',
        icon: 'image',
        order: 45,
        isScalable: true,
      }),
      coreExporter('png', {
        nameKey: 'export.png',
        detailKey: 'export.pngDetail',
        icon: 'pages',
        order: 60,
        isScalable: true,
      }),
      coreExporter('wav', {
        nameKey: 'export.wav',
        detailKey: 'export.wavDetail',
        icon: 'music',
        order: 70,
      }),
    ]

    if (typeof VideoEncoder !== 'undefined') {
      exporters.push(
        coreExporter('mp4', {
          nameKey: 'export.mp4',
          detailKey: 'export.mp4Detail',
          icon: 'video',
          order: 50,
        }),
      )
    }

    for (const exporter of exporters) api.exporters.register(exporter)
    for (const importer of CORE_IMPORTERS) api.importers.register(importer)
  },
}

export const TONE_PLUGIN: PluginDefinition = {
  id: 'core.tones',
  name: 'もようパック',
  version: '1.0.0',
  description: 'plugin.tonesDetail',

  setup(api) {
    for (const [nameKey, id, rows] of EXTRA_TONES) {
      api.patterns.register(patternFromRows(`tone.${id}`, nameKey, rows))
    }
  },
}
