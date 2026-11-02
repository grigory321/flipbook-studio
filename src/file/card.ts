import { Compositor, shrinkPixels } from '../core/compositor.ts'
import type { Note } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'
import type { NoteCard } from './library.ts'

const COVER_WIDTH = 80
const COVER_HEIGHT = 60

const coverCompositors = new WeakMap<Note, Compositor>()

export function makeCard(note: Note): NoteCard {
  const { meta, frames, profile } = note
  const compositor = coverCompositors.get(note) ?? new Compositor(note)
  const paper = profile.papers[frames.paper(0)] ?? profile.papers[0]
  const cover = new Uint32Array(COVER_WIDTH * COVER_HEIGHT)

  coverCompositors.set(note, compositor)
  compositor.invalidate()
  compositor.composePage(0)
  shrinkPixels(
    compositor.pixels,
    meta.width,
    meta.height,
    rgbaWord(paper),
    cover,
    COVER_WIDTH,
    COVER_HEIGHT,
  )

  return {
    id: meta.id,
    title: meta.title,
    profile: meta.profile,
    pages: frames.count,
    width: meta.width,
    height: meta.height,
    modified: meta.modified,
    fps: note.fps,
    cover: new Uint8Array(cover.buffer),
  }
}
