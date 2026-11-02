import { Compositor, shrinkPixels } from '../core/compositor.ts'
import type { Note } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'

const THUMB_WIDTH = 80

const CACHE_LIMIT = 160

export interface Thumbnail {
  key: string
  pixels: Uint32Array<ArrayBuffer>
}

export class ThumbnailCache {
  readonly width = THUMB_WIDTH
  readonly height: number

  private readonly note: Note
  private readonly compositor: Compositor
  private readonly cache = new Map<string, Uint32Array<ArrayBuffer>>()
  private composedPalette = ''

  constructor(note: Note) {
    this.note = note
    this.compositor = new Compositor(note)
    this.height = Math.max(
      1,
      Math.round((THUMB_WIDTH * note.meta.height) / note.meta.width),
    )
  }

  private paletteKey(): string {
    return this.note.meta.palette.join(';')
  }

  keyOf(page: number): string {
    const { frames, meta } = this.note
    const parts = [frames.inks(page), frames.paper(page), frames.depths(page)]

    for (let layer = 0; layer < frames.layers; layer++) {
      parts.push(frames.cel(page, layer))
    }

    const visible = meta.layers.map(layer => +layer.visible).join('')

    return `${parts.join(':')}:${visible}:${this.paletteKey()}`
  }

  cached(key: string): Thumbnail | null {
    const pixels = this.cache.get(key)

    if (!pixels) return null

    this.cache.delete(key)
    this.cache.set(key, pixels)

    return { key, pixels }
  }

  async get(
    page: number,
    isWanted: () => boolean = () => true,
  ): Promise<Thumbnail | null> {
    const known = this.cached(this.keyOf(page))

    if (known) return known

    await this.note.ensurePages(page, 1)

    if (!isWanted() || page >= this.note.frames.count) return null

    return this.cached(this.keyOf(page)) ?? this.draw(page)
  }

  private draw(page: number): Thumbnail {
    const { frames, meta, profile } = this.note
    const key = this.keyOf(page)
    const pixels = new Uint32Array(this.width * this.height)
    const paper = profile.papers[frames.paper(page)] ?? profile.papers[0]
    const palette = this.paletteKey()

    if (palette !== this.composedPalette) {
      this.compositor.invalidate()
      this.composedPalette = palette
    }

    try {
      this.compositor.composePage(page)
    } catch (error) {
      this.compositor.invalidate()
      throw error
    }

    shrinkPixels(
      this.compositor.pixels,
      meta.width,
      meta.height,
      rgbaWord(paper),
      pixels,
      this.width,
      this.height,
    )

    this.cache.set(key, pixels)

    for (const oldest of this.cache.keys()) {
      if (this.cache.size <= CACHE_LIMIT) break

      this.cache.delete(oldest)
    }

    return { key, pixels }
  }
}
