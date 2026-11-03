import type { Note } from '../core/note.ts'
import type { Rgb } from '../core/profile.ts'
import type { Store } from '../core/store.ts'
import {
  type ExportFile,
  type ExportFormat,
  type Job,
  type JobResult,
  type JobRunner,
  readReply,
  type Saved,
} from '../worker/protocol.ts'
import type { DotOptions } from './image-dots.ts'

declare const WORKER_SOURCE: string | undefined

const IDLE_MS = 30_000
const MAX_WORKERS = 4
const PAGES_PER_WORKER = 24
const MIN_BUDGET = 32 * 1024 * 1024

const source = typeof WORKER_SOURCE === 'string' ? WORKER_SOURCE : null
let sourceUrl: string | null = null

function workerUrl(): string | null {
  if (!source) return null

  sourceUrl ??= URL.createObjectURL(
    new Blob([source], { type: 'text/javascript' }),
  )

  return sourceUrl
}

class WorkerLost extends Error {}

interface Pending {
  resolve(result: JobResult): void
  reject(error: Error): void
  onProgress(ratio: number): void
}

class Lane {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private readonly onClose: (lane: Lane) => void
  private idleTimer = 0

  constructor(url: string, onClose: (lane: Lane) => void) {
    this.onClose = onClose
    this.worker = new Worker(url, { type: 'module' })
    this.worker.onmessage = event => this.receive(event.data)
    this.worker.onerror = event => {
      event.preventDefault()
      this.close(new WorkerLost(event.message))
    }
  }

  get load(): number {
    return this.pending.size
  }

  run(
    id: number,
    job: Job,
    onProgress: (ratio: number) => void,
  ): Promise<JobResult> {
    clearTimeout(this.idleTimer)

    return new Promise<JobResult>((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress })
      this.worker.postMessage({ id, job })
    })
  }

  close(error: Error): void {
    clearTimeout(this.idleTimer)
    this.worker.terminate()

    for (const pending of this.pending.values()) pending.reject(error)

    this.pending.clear()
    this.onClose(this)
  }

  private receive(data: unknown): void {
    const reply = readReply(data)
    const pending = reply && this.pending.get(reply.id)

    if (!reply || !pending) return

    if (reply.type === 'progress') {
      pending.onProgress(reply.ratio)

      return
    }

    this.pending.delete(reply.id)

    if (reply.type === 'done') pending.resolve(reply.result)
    else pending.reject(new Error(reply.message))

    if (this.pending.size === 0) {
      this.idleTimer = window.setTimeout(
        () => this.close(new WorkerLost('idle')),
        IDLE_MS,
      )
    }
  }
}

const lanes: Lane[] = []
let nextId = 1
let isBroken = false

function poolSize(): number {
  const cores = navigator.hardwareConcurrency || 2

  return Math.max(1, Math.min(MAX_WORKERS, cores - 1))
}

function canUseWorkers(): boolean {
  return !isBroken && workerUrl() !== null
}

function laneFor(): Lane | null {
  const url = workerUrl()

  if (isBroken || !url) return null

  const free = lanes.find(lane => lane.load === 0)

  if (free) return free

  if (lanes.length < poolSize()) {
    try {
      const lane = new Lane(url, closed => {
        lanes.splice(lanes.indexOf(closed), 1)
      })

      lanes.push(lane)

      return lane
    } catch {
      isBroken = true

      return null
    }
  }

  return lanes.reduce((best, lane) => (lane.load < best.load ? lane : best))
}

let local: Promise<JobRunner> | null = null

function localRunner(): Promise<JobRunner> {
  local ??= (async () => {
    const url = workerUrl()

    if (!url) throw new Error('背景処理のコードがありません')

    await import(url)

    const runner = globalThis.flipbookJobs

    if (!runner) throw new Error('背景処理を読みこめません')

    return runner
  })()

  return local
}

const REPEATABLE: ReadonlySet<Job['kind']> = new Set([
  'export',
  'pages',
  'zip',
  'still',
  'dots',
])

async function runJob(
  job: Job,
  onProgress: (ratio: number) => void = () => {},
): Promise<JobResult> {
  const lane = laneFor()

  if (lane) {
    try {
      return await lane.run(nextId++, job, onProgress)
    } catch (error) {
      if (error instanceof WorkerLost && error.message !== 'idle') {
        isBroken = true
      }

      if (!REPEATABLE.has(job.kind) && !(error instanceof WorkerLost)) {
        throw error
      }

      console.warn('背景処理に失敗したので、ここで続けます', error)
    }
  }

  return (await localRunner()).run(job, onProgress)
}

function fileOf(result: JobResult): ExportFile {
  if (result.kind !== 'file') throw new Error('書き出しの結果が違います')

  return result
}

async function exportPagesInParallel(
  saved: Saved,
  title: string,
  count: number,
  scale: number,
  hasLines: boolean,
  onProgress: (ratio: number) => void,
): Promise<ExportFile> {
  const parts = Math.min(poolSize(), Math.ceil(count / PAGES_PER_WORKER))
  const size = Math.ceil(count / parts)
  const digits = String(count).length
  const budget = Math.max(MIN_BUDGET, saved.budget / parts)
  const done = new Array<number>(parts).fill(0)

  const results = await Promise.all(
    Array.from({ length: parts }, (_, part) => {
      const first = part * size
      const end = Math.min(count, first + size)

      return runJob(
        {
          kind: 'pages',
          first,
          end,
          digits,
          scale,
          hasLines,
          ...saved,
          budget,
        },
        ratio => {
          done[part] = ratio * (end - first)
          onProgress(
            (done.reduce((sum, value) => sum + value, 0) / count) * 0.95,
          )
        },
      )
    }),
  )

  const entries = results.flatMap(result =>
    result.kind === 'entries' ? result.entries : [],
  )

  if (entries.length !== count) throw new Error('ページの数が合いません')

  const file = fileOf(await runJob({ kind: 'zip', entries, title }))

  onProgress(1)

  return file
}

export async function exportInBackground(
  note: Note,
  saved: Saved | null,
  format: ExportFormat,
  scale: number,
  hasLines: boolean,
  onProgress: (ratio: number) => void,
): Promise<ExportFile> {
  if (!saved || format === 'mp4') {
    return (await localRunner()).exportNote(
      note,
      format,
      scale,
      hasLines,
      onProgress,
    )
  }

  const count = note.frames.count

  if (format === 'png' && canUseWorkers() && count >= PAGES_PER_WORKER * 2) {
    return exportPagesInParallel(
      saved,
      note.meta.title,
      count,
      scale,
      hasLines,
      onProgress,
    )
  }

  return exportSaved(saved, format, scale, hasLines, onProgress)
}

export async function exportSaved(
  saved: Saved,
  format: ExportFormat,
  scale: number,
  hasLines: boolean,
  onProgress: (ratio: number) => void,
): Promise<ExportFile> {
  return fileOf(
    await runJob(
      { kind: 'export', format, scale, hasLines, ...saved },
      onProgress,
    ),
  )
}

export async function stillInBackground(
  note: Note,
  saved: Saved | null,
  page: number,
  scale: number,
  hasLines: boolean,
): Promise<Blob> {
  if (!saved) {
    return (await localRunner()).stillOf(note, page, scale, hasLines)
  }

  const result = await runJob({
    kind: 'still',
    page,
    scale,
    hasLines,
    ...saved,
  })

  if (result.kind !== 'blob') throw new Error('画像を作れません')

  return result.blob
}

export async function importInBackground(
  file: File,
  saved: Saved,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const result = await runJob({ kind: 'import', file, ...saved }, onProgress)

  if (result.kind !== 'note') throw new Error('読みこめません')
}

export async function readNoteFileHere(
  file: File,
  store: Store,
): Promise<Note> {
  return (await localRunner()).readNoteFile(file, store)
}

export async function compactInBackground(
  saved: Saved,
): Promise<string | null> {
  const result = await runJob({ kind: 'compact', ...saved })

  if (result.kind !== 'note') throw new Error('整理できません')

  return result.noteId
}

export async function dotsInBackground(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
  options: DotOptions,
  ink: number,
  palette: readonly Rgb[],
): Promise<Uint8Array> {
  const result = await runJob({
    kind: 'dots',
    rgba,
    width,
    height,
    options: { ...options },
    ink,
    palette: [...palette],
  })

  if (result.kind !== 'dots') throw new Error('画像を変換できません')

  return result.pixels
}
