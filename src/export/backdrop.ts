import { blendOver } from '../core/ink.ts'
import type { Note, PaperStyle } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'

const LINES_PER_PAGE = 16

function tint(red: number, green: number, blue: number, alpha: number): number {
  return (
    ((Math.round(alpha * 255) << 24) | (blue << 16) | (green << 8) | red) >>> 0
  )
}

const RULE = tint(92, 136, 196, 0.34)
const RULE_DOT = tint(72, 116, 182, 0.62)
const GRID = tint(92, 136, 196, 0.24)
const DOT = tint(96, 120, 160, 0.46)
const MARKS = [RULE, RULE_DOT, GRID, DOT]

function linePattern(
  width: number,
  height: number,
  style: PaperStyle,
): Uint32Array | null {
  if (style === 'plain') return null

  const pattern = new Uint32Array(width * height)
  const gap = height / LINES_PER_PAGE
  const mark = (x: number, y: number, word: number): void => {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      pattern[y * width + x] = word
    }
  }
  const blot = (x: number, y: number, word: number): void => {
    mark(x - 1, y - 1, word)
    mark(x, y - 1, word)
    mark(x - 1, y, word)
    mark(x, y, word)
  }

  if (style === 'ruled') {
    for (let line = 1; line <= LINES_PER_PAGE; line++) {
      const y = Math.round(line * gap) - 1

      for (let x = 0; x < width; x++) mark(x, y, RULE)

      for (let x = gap * 0.75; x < width; x += gap * 1.5) {
        blot(Math.round(x), y, RULE_DOT)
      }
    }
  }

  if (style === 'grid') {
    for (let row = 0; row < height; row += gap) {
      for (let x = 0; x < width; x++) mark(x, Math.round(row), GRID)
    }

    for (let column = 0; column < width; column += gap) {
      for (let y = 0; y < height; y++) mark(Math.round(column), y, GRID)
    }
  }

  if (style === 'dots') {
    for (let y = gap / 2; y < height; y += gap) {
      for (let x = gap / 2; x < width; x += gap) {
        blot(Math.round(x), Math.round(y), DOT)
      }
    }
  }

  return pattern
}

export class Backdrop {
  private readonly note: Note
  private readonly lines: Uint32Array | null
  private readonly made = new Map<number, Uint32Array>()

  constructor(note: Note, hasLines: boolean) {
    const { width, height, paperStyle } = note.meta

    this.note = note
    this.lines = hasLines ? linePattern(width, height, paperStyle) : null
  }

  of(page: number): Uint32Array {
    const paper = this.note.frames.paper(page)
    const known = this.made.get(paper)

    if (known) return known

    const { width, height } = this.note.meta
    const word = this.paperWord(paper)
    const backdrop = new Uint32Array(width * height)
    const lines = this.lines

    if (lines) {
      for (let index = 0; index < backdrop.length; index++) {
        backdrop[index] = blendOver(lines[index], word)
      }
    } else {
      backdrop.fill(word)
    }

    this.made.set(paper, backdrop)

    return backdrop
  }

  colors(): number[] {
    const { papers } = this.note.profile

    return papers.flatMap((_, index) => {
      const word = this.paperWord(index)

      return this.lines
        ? [word, ...MARKS.map(mark => blendOver(mark, word))]
        : [word]
    })
  }

  private paperWord(index: number): number {
    const { papers } = this.note.profile

    return rgbaWord(papers[index] ?? papers[0] ?? [255, 255, 255])
  }
}
