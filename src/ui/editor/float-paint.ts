import type { Editor } from '../../app/editor.ts'
import { type Floating, splitLayeredValue } from '../../app/floating.ts'
import {
  COVERAGE_FULL,
  KNOCKOUT_VALUE,
  valueCoverage,
  valueInk,
} from '../../core/ink.ts'
import { rgbaWord } from '../../core/profile.ts'

export class FloatPainter {
  private readonly editor: Editor
  private image: ImageData | null = null
  private words: Uint32Array | null = null

  constructor(editor: Editor) {
    this.editor = editor
  }

  colorOf(floating: Floating, value: number): number {
    const { note } = this.editor
    const { frames, meta, profile } = note
    const page = this.editor.page.peek()

    if (value === KNOCKOUT_VALUE) {
      return rgbaWord(profile.papers[frames.paper(page)] ?? profile.papers[0])
    }

    if (profile.id === 'free') {
      const color = meta.palette[valueInk(value) - 1] ?? meta.palette[0]
      const alpha = Math.round((valueCoverage(value) * 255) / COVERAGE_FULL)

      return ((rgbaWord(color) & 0xffffff) | (alpha << 24)) >>> 0
    }

    const [layer, ink] = floating.isLayered
      ? splitLayeredValue(value)
      : [this.editor.layer.peek(), value]
    const color = note.colorAt(page, layer, ink - 1)

    return color ? rgbaWord(color) : 0
  }

  private buffers(): { image: ImageData; words: Uint32Array } {
    const { width, height } = this.editor.note.meta

    if (!this.image || !this.words) {
      this.image = new ImageData(width, height)
      this.words = new Uint32Array(this.image.data.buffer)
    }

    return { image: this.image, words: this.words }
  }

  paint(context: CanvasRenderingContext2D, floating: Floating): void {
    const { width, height } = this.editor.note.meta
    const box = floating.bounds()
    const left = Math.max(0, box.left)
    const top = Math.max(0, box.top)
    const right = Math.min(width - 1, box.right)
    const bottom = Math.min(height - 1, box.bottom)

    if (right < left || bottom < top) return

    const { image, words } = this.buffers()
    const colors = new Map<number, number>()

    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        const value = floating.sample(x, y)
        let color = 0

        if (value !== 0) {
          color = colors.get(value) ?? this.colorOf(floating, value)
          colors.set(value, color)
        }

        words[y * width + x] = color
      }
    }

    context.putImageData(
      image,
      0,
      0,
      left,
      top,
      right - left + 1,
      bottom - top + 1,
    )
  }
}
