const MIB = 1024 * 1024

export const COMPACT_MIN_BYTES = 8 * MIB

const COMPACT_RATIO = 3

export function shouldCompact(
  writtenBytes: number,
  fileBytes: number,
): boolean {
  return (
    writtenBytes >= COMPACT_MIN_BYTES &&
    writtenBytes > fileBytes * COMPACT_RATIO
  )
}
