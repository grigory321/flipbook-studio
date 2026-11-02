import { toDots } from '../app/image-dots.ts'
import { exportKwz, exportPpm } from '../compat/export.ts'
import { importFlipnote } from '../compat/import.ts'
import { createId, type Note } from '../core/note.ts'
import { Store } from '../core/store.ts'
import { encodeApng, PagePngEncoder } from '../export/apng.ts'
import { encodeGif } from '../export/gif.ts'
import { encodeMp4 } from '../export/mp4.ts'
import { encodeWav } from '../export/wav.ts'
import { makeZip, zipEntry, type ZipEntry } from '../export/zip.ts'
import { makeCard } from '../file/card.ts'
import { shouldCompact } from '../file/compaction.ts'
import { Library } from '../file/library.ts'
import { readUgb, writeUgb } from '../file/ugb.ts'
import type {
  ExportFile,
  ExportFormat,
  Job,
  JobResult,
  JobRunner,
} from './protocol.ts'

type Progress = (ratio: number) => void

function safeFileName(title: string, extension: string): string {
  const name = title.replace(/[\\/:*?"<>|]/g, '').trim() || 'flipbook'

  return `${name}${extension}`
}

async function encodeJpeg(
  rgba: Uint32Array<ArrayBuffer>,
  width: number,
  height: number,
): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context) throw new Error('JPEG を作れません')

  const pixels = new Uint8ClampedArray(rgba.buffer)

  context.putImageData(new ImageData(pixels, width, height), 0, 0)

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.85,
  })

  return new Uint8Array(await blob.arrayBuffer())
}

function pageName(page: number, digits: number): string {
  return `${String(page + 1).padStart(digits, '0')}.png`
}

async function pageEntries(
  note: Note,
  first: number,
  end: number,
  digits: number,
  scale: number,
  onProgress: Progress,
): Promise<ZipEntry[]> {
  const encoder = new PagePngEncoder(note, scale)
  const entries: ZipEntry[] = []

  for (let page = first; page < end; page++) {
    const name = pageName(page, digits)

    entries.push(await zipEntry(name, await encoder.encode(page)))
    onProgress((page + 1 - first) / (end - first))
  }

  return entries
}

export async function exportNote(
  note: Note,
  format: ExportFormat,
  scale: number,
  onProgress: Progress,
): Promise<ExportFile> {
  const { title } = note.meta
  const named = (blob: Blob, extension: string): ExportFile => ({
    blob,
    fileName: safeFileName(title, extension),
    warnings: [],
  })
  const progressOf = (done: number, total: number): void =>
    onProgress(done / total)

  switch (format) {
    case 'ugb':
      return named(await writeUgb(note, { onProgress: progressOf }), '.ugb')

    case 'ppm': {
      const file = await exportPpm(note, { onProgress: progressOf })

      return {
        blob: new Blob([file.bytes]),
        fileName: file.fileName,
        warnings: file.warnings.map(warning => `export.warn.${warning}`),
      }
    }

    case 'kwz': {
      const file = await exportKwz(note, {
        encodeJpeg,
        onProgress: progressOf,
      })

      return {
        blob: new Blob([file.bytes]),
        fileName: file.fileName,
        warnings: file.warnings.map(warning => `export.warn.${warning}`),
      }
    }

    case 'gif':
      return named(await encodeGif(note, scale, onProgress), '.gif')

    case 'apng':
      return named(await encodeApng(note, scale, onProgress), '.png')

    case 'mp4':
      return named(await encodeMp4(note, onProgress), '.mp4')

    case 'png': {
      const count = note.frames.count
      const digits = String(count).length
      const entries = await pageEntries(
        note,
        0,
        count,
        digits,
        scale,
        onProgress,
      )

      return named(makeZip(entries), '.zip')
    }

    case 'wav':
      return named(await encodeWav(note, onProgress), '.wav')
  }
}

export function stillOf(
  note: Note,
  page: number,
  scale: number,
): Promise<Blob> {
  return new PagePngEncoder(note, scale).encode(page)
}

export async function readNoteFile(file: File, store: Store): Promise<Note> {
  if (file.name.toLowerCase().endsWith('.ugb')) {
    return (await readUgb(file, { store })).note
  }

  return importFlipnote(new Uint8Array(await file.arrayBuffer()), {
    fallbackTitle: file.name.replace(/\.[^.]+$/, ''),
    store,
  })
}

let opening: Promise<Library | null> | null = null

async function library(): Promise<Library> {
  opening ??= Library.open()

  const opened = await opening

  if (!opened) throw new Error('ノート棚を開けません')

  return opened
}

function storeFor(shelf: Library, noteId: string, budget: number): Store {
  return new Store({ backend: shelf.backendFor(noteId), budget })
}

async function saveNew(shelf: Library, note: Note): Promise<void> {
  await note.ensurePages(0, 1)
  note.meta.modified = Date.now()
  await shelf.saveNote(note, makeCard(note))
}

async function compact(noteId: string, budget: number): Promise<string | null> {
  const shelf = await library()
  const note = await shelf.loadNote(noteId, budget)
  const blob = await writeUgb(note)

  if (!shouldCompact(note.store.writtenBytes, blob.size)) return null

  const id = createId()
  const { note: compacted } = await readUgb(blob, {
    store: storeFor(shelf, id, budget),
  })

  compacted.meta.id = id
  await saveNew(shelf, compacted)
  await shelf.deleteNote(noteId)

  return id
}

export async function run(job: Job, onProgress: Progress): Promise<JobResult> {
  switch (job.kind) {
    case 'export': {
      const note = await (await library()).loadNote(job.noteId, job.budget)
      const file = await exportNote(note, job.format, job.scale, onProgress)

      return { kind: 'file', ...file }
    }

    case 'pages': {
      const note = await (await library()).loadNote(job.noteId, job.budget)
      const { first, end, digits, scale } = job
      const entries = await pageEntries(
        note,
        first,
        end,
        digits,
        scale,
        onProgress,
      )

      return { kind: 'entries', entries }
    }

    case 'zip':
      return {
        kind: 'file',
        blob: makeZip(job.entries),
        fileName: safeFileName(job.title, '.zip'),
        warnings: [],
      }

    case 'still': {
      const note = await (await library()).loadNote(job.noteId, job.budget)

      return { kind: 'blob', blob: await stillOf(note, job.page, job.scale) }
    }

    case 'import': {
      const shelf = await library()
      const store = storeFor(shelf, job.noteId, job.budget)
      const note = await readNoteFile(job.file, store)

      note.meta.id = job.noteId
      await saveNew(shelf, note)

      return { kind: 'note', noteId: job.noteId }
    }

    case 'compact':
      return { kind: 'note', noteId: await compact(job.noteId, job.budget) }

    case 'dots': {
      const { rgba, width, height, options, ink, palette } = job
      const pixels = toDots(rgba, width, height, options, ink, palette)

      return { kind: 'dots', pixels }
    }
  }
}

export const runner: JobRunner = { run, exportNote, stillOf, readNoteFile }
