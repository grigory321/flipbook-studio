import { ByteWriter, crc32 } from '../core/bytes.ts'

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_HEADER = 0x06054b50
const VERSION = 20
const UTF8_FLAG = 0x0800

export interface ZipEntry {
  name: string
  data: Blob
  crc: number
}

export async function zipEntry(name: string, data: Blob): Promise<ZipEntry> {
  return { name, data, crc: crc32(new Uint8Array(await data.arrayBuffer())) }
}

function writeCommon(
  out: ByteWriter,
  crc: number,
  size: number,
  nameLength: number,
): void {
  out.u16(VERSION)
  out.u16(UTF8_FLAG)
  out.u16(0)
  out.u16(0)
  out.u16(0x21)
  out.u32(crc)
  out.u32(size)
  out.u32(size)
  out.u16(nameLength)
  out.u16(0)
}

export function makeZip(entries: readonly ZipEntry[]): Blob {
  const parts: BlobPart[] = []
  const central = new ByteWriter(entries.length * 64)
  let offset = 0

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.name)
    const size = entry.data.size
    const local = new ByteWriter(30 + name.length)

    local.u32(LOCAL_HEADER)
    writeCommon(local, entry.crc, size, name.length)
    local.bytes(name)
    parts.push(local.finish(), entry.data)

    central.u32(CENTRAL_HEADER)
    central.u16(VERSION)
    writeCommon(central, entry.crc, size, name.length)
    central.u16(0)
    central.u16(0)
    central.u16(0)
    central.u32(0)
    central.u32(offset)
    central.bytes(name)

    offset += local.length + size
  }

  const end = new ByteWriter(22)

  end.u32(END_HEADER)
  end.u16(0)
  end.u16(0)
  end.u16(entries.length)
  end.u16(entries.length)
  end.u32(central.length)
  end.u32(offset)
  end.u16(0)

  parts.push(central.finish(), end.finish())

  return new Blob(parts, { type: 'application/zip' })
}
