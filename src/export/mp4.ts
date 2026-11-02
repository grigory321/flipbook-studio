import { ByteWriter } from '../core/bytes.ts'
import { blendOver } from '../core/ink.ts'
import { Compositor } from '../core/compositor.ts'
import type { Note } from '../core/note.ts'
import { rgbaWord } from '../core/profile.ts'
import { Yielder } from '../core/yielder.ts'
import { BlobBuilder } from './blob-builder.ts'
import { Mixdown } from './wav.ts'

const TIMESCALE = 90000
const AUDIO_CHUNK = 1024
const TARGET_HEIGHT = 720
const VIDEO_BITRATE = 4_000_000
const AUDIO_BITRATE = 128_000
const KEY_INTERVAL = 60
const QUEUE_LIMIT = 8

const CODECS = ['avc1.640028', 'avc1.4D0028', 'avc1.42001F', 'avc1.42E01F']

interface Sample {
  size: number
  isKey: boolean
  duration: number
}

interface TrackData {
  samples: Sample[]
  timescale: number
  config: Uint8Array
  data: Blob[]
  bytes: number
}

function box(type: string, ...children: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const size = children.reduce((sum, child) => sum + child.length, 8)
  const out = new ByteWriter(size)

  writeU32Be(out, size)
  out.bytes(new TextEncoder().encode(type))

  for (const child of children) out.bytes(child)

  return out.finish()
}

function writeU32Be(out: ByteWriter, value: number): void {
  out.u8(value >>> 24)
  out.u8((value >>> 16) & 0xff)
  out.u8((value >>> 8) & 0xff)
  out.u8(value & 0xff)
}

function writeU16Be(out: ByteWriter, value: number): void {
  out.u8(value >>> 8)
  out.u8(value & 0xff)
}

function words(...values: number[]): Uint8Array<ArrayBuffer> {
  return wordList(values)
}

function wordList(values: readonly number[]): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter(values.length * 4)

  for (const value of values) writeU32Be(out, value)

  return out.finish()
}

function zeros(length: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(length)
}

const IDENTITY_MATRIX = words(
  0x00010000,
  0,
  0,
  0,
  0x00010000,
  0,
  0,
  0,
  0x40000000,
)

function fullBox(
  type: string,
  version: number,
  flags: number,
  ...children: Uint8Array[]
): Uint8Array<ArrayBuffer> {
  return box(type, words((version << 24) | flags), ...children)
}

function durationOf(track: TrackData): number {
  return track.samples.reduce((sum, sample) => sum + sample.duration, 0)
}

function sampleTables(track: TrackData, firstOffset: number): Uint8Array[] {
  const { samples } = track
  const keys = samples.flatMap((sample, index) =>
    sample.isKey ? [index + 1] : [],
  )

  const timeRuns: number[] = []
  let run = 0
  let runDuration = -1

  for (const sample of samples) {
    if (sample.duration !== runDuration) {
      if (run > 0) timeRuns.push(run, runDuration)

      run = 0
      runDuration = sample.duration
    }

    run++
  }

  if (run > 0) timeRuns.push(run, runDuration)

  const tables = [
    fullBox('stts', 0, 0, wordList([timeRuns.length / 2, ...timeRuns])),
    fullBox('stsc', 0, 0, words(1, 1, samples.length, 1)),
    fullBox(
      'stsz',
      0,
      0,
      wordList([0, samples.length, ...samples.map(sample => sample.size)]),
    ),
    fullBox('stco', 0, 0, words(1, firstOffset)),
  ]

  if (keys.length < samples.length) {
    tables.push(fullBox('stss', 0, 0, wordList([keys.length, ...keys])))
  }

  return tables
}

function handler(type: string, name: string): Uint8Array<ArrayBuffer> {
  return fullBox(
    'hdlr',
    0,
    0,
    words(0),
    new TextEncoder().encode(type),
    zeros(12),
    new TextEncoder().encode(`${name}\0`),
  )
}

function mediaHeader(track: TrackData): Uint8Array<ArrayBuffer> {
  return fullBox(
    'mdhd',
    0,
    0,
    words(0, 0, track.timescale, durationOf(track)),
    words(0x55c40000),
  )
}

function trackHeader(
  id: number,
  duration: number,
  width: number,
  height: number,
  isAudio: boolean,
): Uint8Array<ArrayBuffer> {
  return fullBox(
    'tkhd',
    0,
    3,
    words(0, 0, id, 0, duration),
    zeros(8),
    words(0, isAudio ? 0x01000000 : 0),
    IDENTITY_MATRIX,
    words(width << 16, height << 16),
  )
}

function dataInformation(): Uint8Array<ArrayBuffer> {
  return box('dinf', fullBox('dref', 0, 0, words(1), fullBox('url ', 0, 1)))
}

function videoEntry(
  track: TrackData,
  width: number,
  height: number,
): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter(78)

  out.bytes(zeros(6))
  writeU16Be(out, 1)
  out.bytes(zeros(16))
  writeU16Be(out, width)
  writeU16Be(out, height)
  out.bytes(words(0x00480000, 0x00480000, 0))
  writeU16Be(out, 1)
  out.bytes(zeros(32))
  writeU16Be(out, 24)
  writeU16Be(out, 0xffff)

  return box('avc1', out.finish(), box('avcC', track.config))
}

function descriptor(
  tag: number,
  ...children: Uint8Array[]
): Uint8Array<ArrayBuffer> {
  const length = children.reduce((sum, child) => sum + child.length, 0)
  const out = new ByteWriter(length + 2)

  out.u8(tag)
  out.u8(length)

  for (const child of children) out.bytes(child)

  return out.finish()
}

function audioEntry(track: TrackData): Uint8Array<ArrayBuffer> {
  const out = new ByteWriter(28)

  out.bytes(zeros(6))
  writeU16Be(out, 1)
  out.bytes(zeros(8))
  writeU16Be(out, 1)
  writeU16Be(out, 16)
  out.bytes(zeros(4))
  writeU16Be(out, track.timescale)
  writeU16Be(out, 0)

  const decoder = descriptor(
    0x04,
    new Uint8Array([0x40, 0x15, 0, 0, 0]),
    words(AUDIO_BITRATE, AUDIO_BITRATE),
    descriptor(0x05, track.config),
  )

  const elementary = descriptor(
    0x03,
    new Uint8Array([0, 1, 0]),
    decoder,
    descriptor(0x06, new Uint8Array([2])),
  )

  return box('mp4a', out.finish(), fullBox('esds', 0, 0, elementary))
}

function makeMovie(
  video: TrackData,
  audio: TrackData | null,
  width: number,
  height: number,
  videoOffset: number,
  audioOffset: number,
): Uint8Array<ArrayBuffer> {
  const movieDuration = durationOf(video)
  const tracks = [
    box(
      'trak',
      trackHeader(1, movieDuration, width, height, false),
      box(
        'mdia',
        mediaHeader(video),
        handler('vide', 'video'),
        box(
          'minf',
          fullBox('vmhd', 0, 1, zeros(8)),
          dataInformation(),
          box(
            'stbl',
            fullBox('stsd', 0, 0, words(1), videoEntry(video, width, height)),
            ...sampleTables(video, videoOffset),
          ),
        ),
      ),
    ),
  ]

  if (audio) {
    const duration = Math.round(
      (durationOf(audio) / audio.timescale) * TIMESCALE,
    )

    tracks.push(
      box(
        'trak',
        trackHeader(2, duration, 0, 0, true),
        box(
          'mdia',
          mediaHeader(audio),
          handler('soun', 'audio'),
          box(
            'minf',
            fullBox('smhd', 0, 0, zeros(4)),
            dataInformation(),
            box(
              'stbl',
              fullBox('stsd', 0, 0, words(1), audioEntry(audio)),
              ...sampleTables(audio, audioOffset),
            ),
          ),
        ),
      ),
    )
  }

  return box(
    'moov',
    fullBox(
      'mvhd',
      0,
      0,
      words(0, 0, TIMESCALE, movieDuration, 0x00010000),
      new Uint8Array([1, 0]),
      zeros(10),
      IDENTITY_MATRIX,
      zeros(24),
      words(audio ? 3 : 2),
    ),
    ...tracks,
  )
}

function drawScaled(
  source: Uint32Array,
  sourceWidth: number,
  sourceHeight: number,
  scale: number,
  paper: number,
  target: Uint32Array,
): void {
  const width = sourceWidth * scale

  for (let y = 0; y < sourceHeight; y++) {
    const rowStart = y * scale * width

    for (let x = 0; x < sourceWidth; x++) {
      const word = blendOver(source[y * sourceWidth + x], paper)

      target.fill(word, rowStart + x * scale, rowStart + (x + 1) * scale)
    }

    for (let repeat = 1; repeat < scale; repeat++) {
      target.copyWithin(rowStart + repeat * width, rowStart, rowStart + width)
    }
  }
}

async function chooseCodec(
  width: number,
  height: number,
  framerate: number,
): Promise<VideoEncoderConfig> {
  for (const codec of CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width,
      height,
      framerate,
      bitrate: VIDEO_BITRATE,
      avc: { format: 'avc' },
    }

    const support = await VideoEncoder.isConfigSupported(config)

    if (support.supported) return config
  }

  throw new Error('この端末は H.264 の動画を作れません')
}

async function encodeVideo(
  note: Note,
  scale: number,
  onProgress: (ratio: number) => void,
): Promise<TrackData> {
  const { frames, meta, profile } = note
  const width = meta.width * scale
  const height = meta.height * scale
  const samples: Sample[] = []
  const data = new BlobBuilder()
  const duration = Math.round(TIMESCALE / note.fps)
  let config: Uint8Array | null = null

  const encoder = new VideoEncoder({
    output: (chunk, metadata) => {
      data.write(chunk.byteLength, target => chunk.copyTo(target))
      samples.push({
        size: chunk.byteLength,
        isKey: chunk.type === 'key',
        duration,
      })

      if (metadata?.decoderConfig?.description) {
        config = toBytes(metadata.decoderConfig.description)
      }
    },
    error: error => {
      throw error
    },
  })

  encoder.configure(await chooseCodec(width, height, note.fps))

  const compositor = new Compositor(note)
  const pixels = new Uint32Array(width * height)
  const yielder = new Yielder()

  for (let page = 0; page < frames.count; page++) {
    await note.ensurePages(page, 1)
    compositor.composePage(page)

    drawScaled(
      compositor.pixels,
      meta.width,
      meta.height,
      scale,
      rgbaWord(profile.papers[frames.paper(page)] ?? profile.papers[0]),
      pixels,
    )

    const frame = new VideoFrame(pixels, {
      format: 'RGBA',
      codedWidth: width,
      codedHeight: height,
      timestamp: Math.round((page / note.fps) * 1_000_000),
      duration: Math.round(1_000_000 / note.fps),
    })

    encoder.encode(frame, { keyFrame: page % KEY_INTERVAL === 0 })
    frame.close()

    await drain(encoder)

    onProgress(((page + 1) / frames.count) * 0.9)
    await yielder.breathe()
  }

  await encoder.flush()
  encoder.close()

  if (!config) throw new Error('動画の設定を取得できません')

  return {
    samples,
    timescale: TIMESCALE,
    config,
    data: data.finish(),
    bytes: data.size,
  }
}

async function drain(encoder: VideoEncoder | AudioEncoder): Promise<void> {
  while (encoder.encodeQueueSize > QUEUE_LIMIT) {
    await new Promise(resolve => setTimeout(resolve, 4))
  }
}

function toBytes(source: AllowSharedBufferSource): Uint8Array {
  if (ArrayBuffer.isView(source)) {
    return new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
  }

  return new Uint8Array(source)
}

async function encodeAudio(note: Note): Promise<TrackData | null> {
  const hasSound = note.meta.tracks.some(track => track.soundId)

  if (!hasSound || typeof AudioEncoder === 'undefined') return null

  const mix = new Mixdown(note)
  const config: AudioEncoderConfig = {
    codec: 'mp4a.40.2',
    sampleRate: mix.rate,
    numberOfChannels: 1,
    bitrate: AUDIO_BITRATE,
  }

  const support = await AudioEncoder.isConfigSupported(config)

  if (!support.supported) return null

  const samples: Sample[] = []
  const data = new BlobBuilder()
  let description: Uint8Array | null = null

  const encoder = new AudioEncoder({
    output: (chunk, metadata) => {
      data.write(chunk.byteLength, target => chunk.copyTo(target))
      samples.push({
        size: chunk.byteLength,
        isKey: true,
        duration: AUDIO_CHUNK,
      })

      if (metadata?.decoderConfig?.description) {
        description = toBytes(metadata.decoderConfig.description)
      }
    },
    error: error => {
      throw error
    },
  })

  encoder.configure(config)

  let start = 0

  for await (const block of mix.blocks()) {
    const audio = new AudioData({
      format: 'f32',
      sampleRate: mix.rate,
      numberOfFrames: block.length,
      numberOfChannels: 1,
      timestamp: Math.round((start / mix.rate) * 1_000_000),
      data: block,
    })

    encoder.encode(audio)
    audio.close()
    start += block.length
    await drain(encoder)
  }

  await encoder.flush()
  encoder.close()

  return description
    ? {
        samples,
        timescale: mix.rate,
        config: description,
        data: data.finish(),
        bytes: data.size,
      }
    : null
}

export async function encodeMp4(
  note: Note,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const scale = Math.max(1, Math.floor(TARGET_HEIGHT / note.meta.height))
  const width = note.meta.width * scale
  const height = note.meta.height * scale
  const video = await encodeVideo(note, scale, onProgress)
  const audio = await encodeAudio(note)

  onProgress(0.95)

  const fileType = box(
    'ftyp',
    new TextEncoder().encode('isom'),
    words(0x200),
    new TextEncoder().encode('isomiso2avc1mp41'),
  )

  const videoBytes = video.bytes

  const measure = makeMovie(video, audio, width, height, 0, 0)
  const dataStart = fileType.length + measure.length + 8
  const movie = makeMovie(
    video,
    audio,
    width,
    height,
    dataStart,
    dataStart + videoBytes,
  )

  const audioBytes = audio?.bytes ?? 0

  const dataHeader = new ByteWriter(8)

  writeU32Be(dataHeader, videoBytes + audioBytes + 8)
  dataHeader.bytes(new TextEncoder().encode('mdat'))

  onProgress(1)

  return new Blob(
    [
      fileType,
      movie,
      dataHeader.finish(),
      ...video.data,
      ...(audio?.data ?? []),
    ],
    { type: 'video/mp4' },
  )
}
