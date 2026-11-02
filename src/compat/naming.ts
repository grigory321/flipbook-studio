const KWZ_ALPHABET = 'cwmfjordvegbalksnthpyxquiz012345'
const PPM_CHECK_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const NINTENDO_EPOCH = 946684800

export function toNintendoTime(unixSeconds: number): number {
  const seconds = Math.floor(unixSeconds)
  const offset = new Date(seconds * 1000).getTimezoneOffset() * 60
  const local = seconds - offset - NINTENDO_EPOCH

  return local < 0 ? 0 : local >>> 0
}

export function fromNintendoTime(time: number): number {
  const local = (time >>> 0) + NINTENDO_EPOCH

  return local + new Date(local * 1000).getTimezoneOffset() * 60
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '')
  const out = new Uint8Array(clean.length >> 1)

  for (let index = 0; index < out.length; index++) {
    out[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16)
  }

  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  let text = ''

  for (const byte of bytes) text += byte.toString(16).padStart(2, '0')

  return text.toUpperCase()
}

export function randomHex(length: number): string {
  const values = crypto.getRandomValues(new Uint8Array(length))
  let text = ''

  for (const value of values) text += '0123456789ABCDEF'[value & 15]

  return text
}

function encodeBase32(source: Uint8Array): string {
  let text = ''
  let value = 0
  let bits = 0

  for (const byte of source) {
    value = ((value << 8) | byte) & 0xffff
    bits += 8

    while (bits >= 5) {
      text += KWZ_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }

  if (bits > 0) text += KWZ_ALPHABET[(value << (5 - bits)) & 31]

  return text
}

export function makeKwzFileName(
  authorHex: string,
  createdUnix: number,
  editedUnix: number,
): string {
  const bytes = new Uint8Array(17)
  const author = hexToBytes(authorHex)
  const view = new DataView(bytes.buffer)

  bytes.set(author.subarray(0, 9))
  view.setUint32(9, toNintendoTime(createdUnix), true)
  view.setUint32(13, toNintendoTime(editedUnix), true)

  return encodeBase32(bytes)
}

export function formatPpmFileName(
  mac: string,
  random: string,
  edits: number,
): string {
  const macPart = mac
    .replace(/[^0-9A-Fa-f]/g, '')
    .toUpperCase()
    .padEnd(6, '0')
    .slice(0, 6)

  const randomPart = random
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '0')
    .padEnd(13, '0')
    .slice(0, 13)

  const count = Math.max(0, Math.min(999, edits | 0))

  return `${macPart}_${randomPart}_${String(count).padStart(3, '0')}`
}

export function ppmLocalFileName(name: string): string {
  let sum = parseInt(name.slice(0, 2), 16)

  if (!Number.isFinite(sum)) sum = 0

  for (let index = 1; index < 16; index++) {
    sum = (sum + name.charCodeAt(index)) & 0xff
  }

  return PPM_CHECK_DIGITS[sum % 36] + name.slice(1)
}

export function packPpmFileName(
  mac: string,
  random: string,
  edits: number,
): Uint8Array {
  const out = new Uint8Array(18)

  out.set(hexToBytes(mac.padEnd(6, '0').slice(0, 6)))

  const text = random.toUpperCase().padEnd(13, '0').slice(0, 13)

  for (let index = 0; index < 13; index++) {
    out[3 + index] = text.charCodeAt(index) & 0x7f
  }

  out[16] = edits & 0xff
  out[17] = (edits >> 8) & 0xff

  return out
}

export interface PpmFileName {
  mac: string
  random: string
  edits: number
}

export function unpackPpmFileName(bytes: Uint8Array): PpmFileName {
  let random = ''

  for (let index = 0; index < 13; index++) {
    const code = bytes[3 + index]

    random += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : '0'
  }

  return {
    mac: bytesToHex(bytes.subarray(0, 3)),
    random,
    edits: bytes[16] | (bytes[17] << 8),
  }
}
