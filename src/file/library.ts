import { FrameTable } from '../core/frames.ts'
import { isList, isNumber, isRecord, isString } from '../core/guards.ts'
import {
  Note,
  type NoteMeta,
  type PaperStyle,
  type Sound,
} from '../core/note.ts'
import { isProfileId, type ProfileId } from '../core/profile.ts'
import { type SlabBackend, Store } from '../core/store.ts'
import { readResult, requestResult, transactionDone } from './idb.ts'
import { checkPages, isPaperStyle, readMeta } from './meta.ts'

const DB_NAME = 'flipbook'
const DB_VERSION = 1

export interface NoteCard {
  id: string
  title: string
  profile: ProfileId
  pages: number
  width: number
  height: number
  modified: number
  fps: number
  paperStyle: PaperStyle
  cover: Uint8Array | null
  trashed?: number
}

interface NoteRoot {
  id: string
  meta: NoteMeta
  frames: Uint8Array
  slabCount: number
  tail: Uint8Array
}

interface StoredSound extends Omit<Sound, 'samples'> {
  key: [string, string]
  samples: ArrayBuffer
}

async function readList(request: IDBRequest): Promise<readonly unknown[]> {
  const value = await readResult(request)

  return isList(value) ? value : []
}

function readCard(value: unknown): NoteCard | null {
  if (!isRecord(value)) return null

  const { id, title, profile, pages, width, height, modified, fps } = value

  if (
    !isString(id) ||
    !isString(title) ||
    !isProfileId(profile) ||
    !isNumber(pages) ||
    !isNumber(width) ||
    !isNumber(height) ||
    !isNumber(modified) ||
    !isNumber(fps)
  ) {
    return null
  }

  return {
    id,
    title,
    profile,
    pages,
    width,
    height,
    modified,
    fps,
    paperStyle: isPaperStyle(value.paperStyle) ? value.paperStyle : 'plain',
    cover: value.cover instanceof Uint8Array ? value.cover : null,
    trashed: isNumber(value.trashed) ? value.trashed : undefined,
  }
}

function readRoot(value: unknown): NoteRoot | null {
  if (!isRecord(value)) return null

  const { id, frames, slabCount, tail } = value

  if (
    !isString(id) ||
    !(frames instanceof Uint8Array) ||
    !isNumber(slabCount) ||
    !(tail instanceof Uint8Array)
  ) {
    return null
  }

  return { id, meta: readMeta(value.meta), frames, slabCount, tail }
}

function readSound(value: unknown): StoredSound | null {
  if (!isRecord(value)) return null

  const { key, id, name, rate, samples } = value

  if (
    !isList(key) ||
    !isString(key[0]) ||
    !isString(key[1]) ||
    !isString(id) ||
    !isString(name) ||
    !isNumber(rate) ||
    !(samples instanceof ArrayBuffer)
  ) {
    return null
  }

  return { key: [key[0], key[1]], id, name, rate, samples }
}

function present<T>(value: T | null): value is T {
  return value !== null
}

function samplesBuffer(samples: Int16Array<ArrayBuffer>): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = samples

  return byteOffset === 0 && byteLength === buffer.byteLength
    ? buffer
    : samples.slice().buffer
}

function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DB_NAME, DB_VERSION)

  request.onupgradeneeded = () => {
    const database = request.result

    database.createObjectStore('cards', { keyPath: 'id' })
    database.createObjectStore('roots', { keyPath: 'id' })
    database.createObjectStore('slabs')
    database.createObjectStore('sounds', { keyPath: 'key' })
  }

  return requestResult(request)
}

function keysOf(id: string): IDBKeyRange {
  return IDBKeyRange.bound([id], [id, []])
}

export class Library {
  private readonly database: IDBDatabase
  private readonly storedSounds = new Map<string, Set<string>>()

  private constructor(database: IDBDatabase) {
    this.database = database
  }

  private storedSoundsOf(id: string): Set<string> {
    let stored = this.storedSounds.get(id)

    if (!stored) {
      stored = new Set()
      this.storedSounds.set(id, stored)
    }

    return stored
  }

  static async open(): Promise<Library | null> {
    try {
      return new Library(await openDatabase())
    } catch {
      return null
    }
  }

  async listCards(): Promise<NoteCard[]> {
    const store = this.database.transaction('cards').objectStore('cards')
    const cards = (await readList(store.getAll())).map(readCard).filter(present)

    return cards
      .filter(card => !card.trashed)
      .sort((a, b) => b.modified - a.modified)
  }

  backendFor(id: string): SlabBackend {
    return {
      writeSlab: async (number, bytes) => {
        const transaction = this.database.transaction('slabs', 'readwrite')

        transaction.objectStore('slabs').put(bytes, [id, number])
        await transactionDone(transaction)
      },
      readSlab: async number => {
        const store = this.database.transaction('slabs').objectStore('slabs')
        const bytes = await readResult(store.get([id, number]))

        return bytes instanceof Uint8Array ? bytes : null
      },
    }
  }

  async saveNote(note: Note, card: NoteCard): Promise<void> {
    await note.store.settled()

    const { id } = note.meta
    const snapshot = note.store.snapshot()
    const names = ['cards', 'roots', 'sounds']
    const transaction = this.database.transaction(names, 'readwrite')

    const root: NoteRoot = {
      id,
      meta: note.meta,
      frames: note.frames.toBytes(),
      slabCount: snapshot.slabCount,
      tail: snapshot.tail,
    }

    transaction.objectStore('roots').put(root)
    transaction.objectStore('cards').put(card)

    const sounds = transaction.objectStore('sounds')
    const stored = this.storedSoundsOf(id)
    const used = note.usedSounds()
    const usedIds = new Set(used.map(sound => sound.id))
    const written: string[] = []
    const removed: string[] = []

    for (const sound of used) {
      if (stored.has(sound.id)) continue

      const record: StoredSound = {
        key: [id, sound.id],
        id: sound.id,
        name: sound.name,
        rate: sound.rate,
        samples: samplesBuffer(sound.samples),
      }

      sounds.put(record)
      written.push(sound.id)
    }

    for (const soundId of stored) {
      if (usedIds.has(soundId)) continue

      sounds.delete([id, soundId])
      removed.push(soundId)
    }

    await transactionDone(transaction)

    for (const soundId of written) stored.add(soundId)
    for (const soundId of removed) stored.delete(soundId)
  }

  async hasNote(id: string): Promise<boolean> {
    const store = this.database.transaction('roots').objectStore('roots')

    return (await requestResult(store.count(id))) > 0
  }

  async loadNote(id: string, budget: number): Promise<Note> {
    const names = ['roots', 'sounds']
    const transaction = this.database.transaction(names)
    const rootRequest = transaction.objectStore('roots').get(id)
    const soundRequest = transaction.objectStore('sounds').getAll(keysOf(id))
    const root = readRoot(await readResult(rootRequest))
    const sounds = (await readList(soundRequest)).map(readSound).filter(present)

    if (!root) throw new Error('ノートが見つかりません')

    const store = new Store({
      backend: this.backendFor(id),
      budget,
      slabCount: root.slabCount,
      tail: root.tail,
    })

    const table = FrameTable.fromBytes(root.meta.layers.length, root.frames)

    checkPages(root.meta, table.count)

    const note = new Note(root.meta, table, store)
    const usedIds = new Set(note.meta.tracks.map(track => track.soundId))

    for (const { id: soundId, name, rate, samples } of sounds) {
      if (!usedIds.has(soundId)) continue

      note.sounds.set(soundId, {
        id: soundId,
        name,
        rate,
        samples: new Int16Array(samples),
      })
    }

    this.storedSounds.set(id, new Set(sounds.map(sound => sound.id)))

    return note
  }

  async trashNote(id: string, isTrashed: boolean): Promise<void> {
    const transaction = this.database.transaction('cards', 'readwrite')
    const store = transaction.objectStore('cards')
    const card = readCard(await readResult(store.get(id)))

    if (card) {
      card.trashed = isTrashed ? Date.now() : undefined
      store.put(card)
    }

    await transactionDone(transaction)
  }

  async purgeTrash(): Promise<void> {
    const store = this.database.transaction('cards').objectStore('cards')
    const cards = (await readList(store.getAll())).map(readCard)

    for (const card of cards) {
      if (card?.trashed) await this.deleteNote(card.id)
    }
  }

  async deleteNote(id: string): Promise<void> {
    const names = ['cards', 'roots', 'slabs', 'sounds']
    const transaction = this.database.transaction(names, 'readwrite')

    transaction.objectStore('cards').delete(id)
    transaction.objectStore('roots').delete(id)
    transaction.objectStore('slabs').delete(keysOf(id))
    transaction.objectStore('sounds').delete(keysOf(id))

    await transactionDone(transaction)
    this.storedSounds.delete(id)
  }

  async duplicateNote(id: string, newId: string, title: string): Promise<void> {
    const names = ['cards', 'roots', 'slabs', 'sounds']
    const transaction = this.database.transaction(names, 'readwrite')
    const cards = transaction.objectStore('cards')
    const roots = transaction.objectStore('roots')
    const slabs = transaction.objectStore('slabs')
    const sounds = transaction.objectStore('sounds')

    const card = readCard(await readResult(cards.get(id)))
    const root = readRoot(await readResult(roots.get(id)))
    const slabKeys = await requestResult(slabs.getAllKeys(keysOf(id)))
    const soundList = (await readList(sounds.getAll(keysOf(id))))
      .map(readSound)
      .filter(present)

    if (!card || !root) throw new Error('ノートが見つかりません')

    cards.put({ ...card, id: newId, title, modified: Date.now() })
    roots.put({
      ...root,
      id: newId,
      meta: { ...root.meta, id: newId, title },
    })

    for (const key of slabKeys) {
      const number = isList(key) ? key[1] : null

      if (!isNumber(number)) continue

      slabs.put(await readResult(slabs.get(key)), [newId, number])
    }

    for (const sound of soundList) {
      sounds.put({ ...sound, key: [newId, sound.id] })
    }

    await transactionDone(transaction)
  }

  async updateCard(card: NoteCard): Promise<void> {
    const transaction = this.database.transaction('cards', 'readwrite')

    transaction.objectStore('cards').put(card)
    await transactionDone(transaction)
  }
}
