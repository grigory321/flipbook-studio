const STEPS = new Int32Array([
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230,
  253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963,
  1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327,
  3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
  11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794,
  32767,
])

const INDEX_4BIT = new Int32Array([
  -1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8,
])

const INDEX_2BIT = new Int32Array([-1, 2, -1, 2])

const DSI_INDEX_MAX = 88
const N3DS_INDEX_MAX = 79
const N3DS_START_INDEX = 40
const N3DS_SHORT_BELOW = 18
const N3DS_SAMPLE_MIN = -2048
const N3DS_SAMPLE_MAX = 2047

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value
}

function delta4(code: number, step: number): number {
  let delta = step >> 3

  if (code & 1) delta += step >> 2
  if (code & 2) delta += step >> 1
  if (code & 4) delta += step
  if (code & 8) delta = -delta

  return delta
}

function delta2(code: number, step: number): number {
  let delta = step >> 3

  if (code & 1) delta += step
  if (code & 2) delta = -delta

  return delta
}

export function encodeDsiAdpcm(pcm: Int16Array): Uint8Array {
  if (pcm.length === 0) return new Uint8Array(0)

  const out = new Uint8Array(4 + Math.ceil(pcm.length / 2))
  let predicted = pcm[0]
  let index = startingIndex(pcm)

  out[0] = predicted & 0xff
  out[1] = (predicted >> 8) & 0xff
  out[2] = index

  let position = 4
  let isLowNibble = true

  for (let sample = 0; sample < pcm.length; sample++) {
    const target = pcm[sample]
    const step = STEPS[index]
    let bestCode = 0
    let bestError = Infinity
    let bestValue = predicted

    for (let code = 0; code < 16; code++) {
      const value = clamp(predicted + delta4(code, step), -32768, 32767)
      const error = Math.abs(target - value)

      if (error < bestError) {
        bestError = error
        bestCode = code
        bestValue = value
      }
    }

    predicted = bestValue
    index = clamp(index + INDEX_4BIT[bestCode], 0, DSI_INDEX_MAX)

    if (isLowNibble) {
      out[position] = bestCode
    } else {
      out[position++] |= bestCode << 4
    }

    isLowNibble = !isLowNibble
  }

  return out
}

function startingIndex(pcm: Int16Array): number {
  const inspected = Math.min(pcm.length - 1, 96)
  let total = 0

  for (let sample = 1; sample <= inspected; sample++) {
    total += Math.abs(pcm[sample] - pcm[sample - 1])
  }

  const average = inspected > 0 ? total / inspected : 0
  let index = 0

  while (index < DSI_INDEX_MAX && STEPS[index] < average * 0.8) index++

  return index
}

export function decodeDsiAdpcm(track: Uint8Array): Int16Array<ArrayBuffer> {
  if (track.length < 4) return new Int16Array(0)

  let predicted = ((track[0] | (track[1] << 8)) << 16) >> 16
  let index = clamp(track[2], 0, DSI_INDEX_MAX)
  const body = track.subarray(4)
  const out = new Int16Array(body.length * 2)

  for (let sample = 0; sample < out.length; sample++) {
    const byte = body[sample >> 1]
    const code = sample & 1 ? byte >> 4 : byte & 0xf

    predicted = clamp(predicted + delta4(code, STEPS[index]), -32768, 32767)
    index = clamp(index + INDEX_4BIT[code], 0, DSI_INDEX_MAX)
    out[sample] = predicted
  }

  return out
}

export function encodeN3dsAdpcm(pcm: Int16Array): Uint8Array {
  const out = new Uint8Array(pcm.length + 8)
  let predicted = 0
  let index = N3DS_START_INDEX
  let byte = 0
  let bitPosition = 0
  let position = 0

  for (let sample = 0; sample < pcm.length; sample++) {
    const target = clamp(pcm[sample] >> 4, N3DS_SAMPLE_MIN, N3DS_SAMPLE_MAX)
    const isShort = index < N3DS_SHORT_BELOW || bitPosition > 4
    const codes = isShort ? 4 : 16
    const step = STEPS[index]
    let bestCode = 0
    let bestError = Infinity
    let bestValue = predicted

    for (let code = 0; code < codes; code++) {
      const delta = isShort ? delta2(code, step) : delta4(code, step)
      const value = clamp(predicted + delta, N3DS_SAMPLE_MIN, N3DS_SAMPLE_MAX)
      const error = Math.abs(target - value)

      if (error < bestError) {
        bestError = error
        bestCode = code
        bestValue = value
      }
    }

    const table = isShort ? INDEX_2BIT : INDEX_4BIT

    predicted = bestValue
    index = clamp(index + table[bestCode], 0, N3DS_INDEX_MAX)
    byte |= bestCode << bitPosition
    bitPosition += isShort ? 2 : 4

    if (bitPosition >= 8) {
      out[position++] = byte
      byte = 0
      bitPosition = 0
    }
  }

  if (bitPosition > 0) out[position++] = byte

  return out.subarray(0, position)
}

export function decodeN3dsAdpcm(source: Uint8Array): Int16Array<ArrayBuffer> {
  const out = new Int16Array(source.length * 4)
  let predicted = 0
  let index = N3DS_START_INDEX
  let written = 0

  for (let position = 0; position < source.length; position++) {
    let byte = source[position]
    let bit = 0

    while (bit < 8) {
      const isShort = index < N3DS_SHORT_BELOW || bit > 4
      const step = STEPS[index]

      if (isShort) {
        const code = byte & 3

        predicted += delta2(code, step)
        index += INDEX_2BIT[code]
        byte >>= 2
        bit += 2
      } else {
        const code = byte & 0xf

        predicted += delta4(code, step)
        index += INDEX_4BIT[code]
        byte >>= 4
        bit += 4
      }

      predicted = clamp(predicted, N3DS_SAMPLE_MIN, N3DS_SAMPLE_MAX)
      index = clamp(index, 0, N3DS_INDEX_MAX)
      out[written++] = predicted * 16
    }
  }

  return out.subarray(0, written)
}
