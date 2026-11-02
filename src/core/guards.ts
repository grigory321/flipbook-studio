export type Guard<T> = (value: unknown) => value is T

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isListOf<T>(value: unknown, guard: Guard<T>): value is T[] {
  return isList(value) && value.every(guard)
}

export function oneOf<const T>(choices: readonly T[]): Guard<T> {
  return (value): value is T => choices.some(choice => choice === value)
}

export type Parse<T> = (value: unknown) => T | undefined

export function parseWith<T>(guard: Guard<T>): Parse<T> {
  return value => (guard(value) ? value : undefined)
}

export function parseListOf<T>(guard: Guard<T>): Parse<T[]> {
  return value => (isList(value) ? value.filter(guard) : undefined)
}
