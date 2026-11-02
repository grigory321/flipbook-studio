import { KWZ_SIGNING_KEY, PPM_SIGNING_KEY } from './keys.ts'

const ALGORITHM = 'RSASSA-PKCS1-v1_5'

export const PPM_SIGNATURE_BYTES = 128
export const KWZ_SIGNATURE_BYTES = 256

const keyCache = new Map<string, Promise<CryptoKey | null>>()

export function canSign(): boolean {
  return !!globalThis.crypto?.subtle
}

function importKey(
  base64: string,
  hash: 'SHA-1' | 'SHA-256',
): Promise<CryptoKey | null> {
  const cached = keyCache.get(hash)

  if (cached) return cached

  const imported = decodeKey(base64, hash)

  keyCache.set(hash, imported)

  return imported
}

async function decodeKey(
  base64: string,
  hash: string,
): Promise<CryptoKey | null> {
  if (!crypto.subtle) return null

  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: ALGORITHM, hash },
    false,
    ['sign'],
  )
}

async function sign(
  key: CryptoKey | null,
  body: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  if (!key) return new Uint8Array(length)

  const data = body.slice().buffer
  const signature = await crypto.subtle.sign(ALGORITHM, key, data)

  return new Uint8Array(signature)
}

export async function signPpm(body: Uint8Array): Promise<Uint8Array> {
  const key = await importKey(PPM_SIGNING_KEY, 'SHA-1')

  return sign(key, body, PPM_SIGNATURE_BYTES)
}

export async function signKwz(body: Uint8Array): Promise<Uint8Array> {
  const key = await importKey(KWZ_SIGNING_KEY, 'SHA-256')

  return sign(key, body, KWZ_SIGNATURE_BYTES)
}
