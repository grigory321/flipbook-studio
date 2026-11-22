import { isNumber, isRecord, isString } from '../core/guards.ts'

const STORAGE_KEY = 'flipbook.resume'

export interface ResumePoint {
  id: string
  page: number
}

export function readResume(): ResumePoint | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    )

    if (!isRecord(parsed)) return null

    const { id, page } = parsed

    return isString(id) && isNumber(page) ? { id, page } : null
  } catch {
    return null
  }
}

export function saveResume(point: ResumePoint): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(point))
  } catch {
    return
  }
}

export function clearResume(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    return
  }
}
