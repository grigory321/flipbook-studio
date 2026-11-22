const KANA = /^[ぁ-ゟー]+$/
const TRAILING = /^[、。，．！？!?）」』】〕…・:：〜ー]+$/
const OPENING = /[（「『【〔]$/
const STOP = /[、。！？]$/
const NUMBER = /[0-9０-９×]$/

export function phrases(text: string, language: string): string[] {
  if (language !== 'ja') return [text.replace(/ ([—–])/g, ' $1')]

  if (typeof Intl.Segmenter !== 'function') return [text]

  const out: string[] = []
  let isGlued = false

  for (const { segment } of new Intl.Segmenter('ja', {
    granularity: 'word',
  }).segment(text)) {
    const previous = out.at(-1)

    if (/^\s+$/.test(segment)) {
      if (previous === undefined) continue

      out[out.length - 1] = `${previous} `
      isGlued = true
      continue
    }

    const joins =
      previous !== undefined &&
      (isGlued ||
        NUMBER.test(previous) ||
        TRAILING.test(segment) ||
        (KANA.test(segment) && !STOP.test(previous)))

    if (joins) out[out.length - 1] = previous + segment
    else out.push(segment)

    isGlued = OPENING.test(segment)
  }

  return out
}
