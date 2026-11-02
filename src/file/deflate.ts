const FORMAT = 'deflate-raw'

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  transform: GenericTransformStream,
): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(transform)

  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function deflate(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(bytes, new CompressionStream(FORMAT))
}

export function inflate(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  return pipe(bytes, new DecompressionStream(FORMAT))
}
