import type { DotOptions } from '../app/image-dots.ts'
import {
  isBoolean,
  isList,
  isListOf,
  isNumber,
  isRecord,
  isString,
  oneOf,
} from '../core/guards.ts'
import type { Note } from '../core/note.ts'
import type { Rgb } from '../core/profile.ts'
import type { Store } from '../core/store.ts'
import type { ZipEntry } from '../export/zip.ts'

const EXPORT_FORMATS = [
  'ugb',
  'ppm',
  'kwz',
  'gif',
  'apng',
  'mp4',
  'png',
  'wav',
] as const

export type ExportFormat = (typeof EXPORT_FORMATS)[number]

const isExportFormat = oneOf(EXPORT_FORMATS)

const DOT_MODES = ['tone', 'line', 'color'] as const

export interface Saved {
  noteId: string
  budget: number
}

export type Job =
  | ({ kind: 'export'; format: ExportFormat; scale: number } & Saved)
  | ({
      kind: 'pages'
      first: number
      end: number
      digits: number
      scale: number
    } & Saved)
  | { kind: 'zip'; entries: ZipEntry[]; title: string }
  | ({ kind: 'still'; page: number; scale: number } & Saved)
  | ({ kind: 'import'; file: File } & Saved)
  | ({ kind: 'compact' } & Saved)
  | {
      kind: 'dots'
      rgba: Uint8ClampedArray
      width: number
      height: number
      options: DotOptions
      ink: number
      palette: Rgb[]
    }

export interface ExportFile {
  blob: Blob
  fileName: string
  warnings: string[]
}

export type JobResult =
  | ({ kind: 'file' } & ExportFile)
  | { kind: 'entries'; entries: ZipEntry[] }
  | { kind: 'blob'; blob: Blob }
  | { kind: 'note'; noteId: string | null }
  | { kind: 'dots'; pixels: Uint8Array }

export interface Request {
  id: number
  job: Job
}

export type Reply =
  | { id: number; type: 'progress'; ratio: number }
  | { id: number; type: 'done'; result: JobResult }
  | { id: number; type: 'failed'; message: string }

export interface JobRunner {
  run(job: Job, onProgress: (ratio: number) => void): Promise<JobResult>
  exportNote(
    note: Note,
    format: ExportFormat,
    scale: number,
    onProgress: (ratio: number) => void,
  ): Promise<ExportFile>
  stillOf(note: Note, page: number, scale: number): Promise<Blob>
  readNoteFile(file: File, store: Store): Promise<Note>
}

declare global {
  var flipbookJobs: JobRunner | undefined
}

function isEntry(value: unknown): value is ZipEntry {
  return (
    isRecord(value) &&
    isString(value.name) &&
    value.data instanceof Blob &&
    isNumber(value.crc)
  )
}

function isRgb(value: unknown): value is Rgb {
  return isList(value) && value.length === 3 && value.every(isNumber)
}

function readDotOptions(value: unknown): DotOptions | undefined {
  if (!isRecord(value)) return undefined

  const { mode, level, dithers } = value

  return oneOf(DOT_MODES)(mode) && isNumber(level) && isBoolean(dithers)
    ? { mode, level, dithers }
    : undefined
}

function readSaved(value: Record<string, unknown>): Saved | undefined {
  const { noteId, budget } = value

  return isString(noteId) && isNumber(budget) ? { noteId, budget } : undefined
}

function readJob(value: unknown): Job | undefined {
  if (!isRecord(value)) return undefined

  const saved = readSaved(value)

  switch (value.kind) {
    case 'export': {
      const { format, scale } = value

      return saved && isExportFormat(format) && isNumber(scale)
        ? { kind: 'export', format, scale, ...saved }
        : undefined
    }

    case 'pages': {
      const { first, end, digits, scale } = value

      return saved &&
        isNumber(first) &&
        isNumber(end) &&
        isNumber(digits) &&
        isNumber(scale)
        ? { kind: 'pages', first, end, digits, scale, ...saved }
        : undefined
    }

    case 'zip':
      return isListOf(value.entries, isEntry) && isString(value.title)
        ? { kind: 'zip', entries: value.entries, title: value.title }
        : undefined

    case 'still': {
      const { page, scale } = value

      return saved && isNumber(page) && isNumber(scale)
        ? { kind: 'still', page, scale, ...saved }
        : undefined
    }

    case 'import':
      return saved && value.file instanceof File
        ? { kind: 'import', file: value.file, ...saved }
        : undefined

    case 'compact':
      return saved ? { kind: 'compact', ...saved } : undefined

    case 'dots': {
      const { rgba, width, height, ink, palette } = value
      const options = readDotOptions(value.options)

      return rgba instanceof Uint8ClampedArray &&
        isNumber(width) &&
        isNumber(height) &&
        rgba.length === width * height * 4 &&
        options &&
        isNumber(ink) &&
        isListOf(palette, isRgb)
        ? { kind: 'dots', rgba, width, height, options, ink, palette }
        : undefined
    }
  }

  return undefined
}

function readResult(value: unknown): JobResult | undefined {
  if (!isRecord(value)) return undefined

  switch (value.kind) {
    case 'file': {
      const { blob, fileName, warnings } = value

      return blob instanceof Blob &&
        isString(fileName) &&
        isListOf(warnings, isString)
        ? { kind: 'file', blob, fileName, warnings }
        : undefined
    }

    case 'entries':
      return isListOf(value.entries, isEntry)
        ? { kind: 'entries', entries: value.entries }
        : undefined

    case 'blob':
      return value.blob instanceof Blob
        ? { kind: 'blob', blob: value.blob }
        : undefined

    case 'note': {
      const { noteId } = value

      return noteId === null || isString(noteId)
        ? { kind: 'note', noteId }
        : undefined
    }

    case 'dots':
      return value.pixels instanceof Uint8Array
        ? { kind: 'dots', pixels: value.pixels }
        : undefined
  }

  return undefined
}

export function readRequest(value: unknown): Request | undefined {
  if (!isRecord(value) || !isNumber(value.id)) return undefined

  const job = readJob(value.job)

  return job ? { id: value.id, job } : undefined
}

export function readReply(value: unknown): Reply | undefined {
  if (!isRecord(value) || !isNumber(value.id)) return undefined

  const { id } = value

  switch (value.type) {
    case 'progress':
      return isNumber(value.ratio)
        ? { id, type: 'progress', ratio: value.ratio }
        : undefined

    case 'done': {
      const result = readResult(value.result)

      return result ? { id, type: 'done', result } : undefined
    }

    case 'failed':
      return isString(value.message)
        ? { id, type: 'failed', message: value.message }
        : undefined
  }

  return undefined
}

export function transferOf(result: JobResult): Transferable[] {
  if (result.kind !== 'dots') return []

  const { buffer } = result.pixels

  return buffer instanceof ArrayBuffer ? [buffer] : []
}
