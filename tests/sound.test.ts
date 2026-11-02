import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Editor } from '../src/app/editor.ts'
import {
  bgmTracks,
  Note,
  playSeconds,
  soundTracks,
  trackPages,
  trackRate,
} from '../src/core/note.ts'
import { encodeWav, Mixdown } from '../src/export/wav.ts'

async function mixed(note: Note): Promise<Float32Array> {
  const mix = new Mixdown(note)
  const out = new Float32Array(mix.length)
  let offset = 0

  for await (const block of mix.blocks()) {
    out.set(block, offset)
    offset += block.length
  }

  return out
}

async function heardSamples(note: Note): Promise<number> {
  return (await mixed(note)).filter(value => value !== 0).length
}

test('音: 長さを変えると短く鳴り、1 回で取り消せる', async () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const editor = new Editor(note)
  const track = soundTracks(note.meta)[0]
  const sound = {
    id: 'a',
    name: 'a',
    rate: 1000,
    samples: new Int16Array(2000).fill(1000),
  }

  for (let page = 0; page < 120; page++) editor.addPages()

  note.sounds.set(sound.id, sound)
  track.soundId = sound.id
  note.frames.setSounds(0, 1)

  assert.equal(playSeconds(track, sound), 2)

  const whole = await heardSamples(note)

  editor.setTrackLength(track, 0.5)
  assert.equal(playSeconds(track, sound), 0.5)

  const short = await heardSamples(note)

  assert.ok(short < whole)

  editor.undo()
  assert.equal(track.length, null)
})

test('音: 入れたときの速さが基準で、速くすると高くなり帯のページ数は同じ', () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const track = soundTracks(note.meta)[0]
  const sound = {
    id: 'a',
    name: 'a',
    rate: 1000,
    samples: new Int16Array(2000),
  }

  track.baseFps = 12

  assert.equal(trackRate(track, 12), 1)
  assert.equal(trackRate(track, 24), 2)
  assert.equal(trackRate(track, 6), 0.5)
  assert.equal(trackPages(track, sound, 12), 24)
  assert.equal(trackPages(track, sound, 24), 24)
})

test('音: 書き出しも速さに合わせて短くなる', async () => {
  const heard = async (speed: number): Promise<number> => {
    const note = Note.create({ title: 't', profile: 'free' })
    const editor = new Editor(note)
    const track = bgmTracks(note.meta)[0]
    const base = note.fps

    for (let page = 0; page < 100; page++) editor.addPages()

    note.sounds.set('a', {
      id: 'a',
      name: 'a',
      rate: 8000,
      samples: new Int16Array(4000).fill(9000),
    })
    track.soundId = 'a'
    track.baseFps = base
    note.meta.speed = speed

    return (await heardSamples(note)) / 44100
  }

  const note = Note.create({ title: 't', profile: 'free' })
  const slower = note.meta.speed - 1

  assert.ok((await heard(slower)) > (await heard(note.meta.speed)))
})

test('音: 古いファイルの BGM は録音の速さを基準にする', () => {
  const made = Note.create({ title: 't', profile: 'dsi' })
  const track = bgmTracks(made.meta)[0]

  track.soundId = 'a'
  made.meta.bgmSpeed = 2

  const opened = new Note(made.meta, made.frames, made.store)

  assert.equal(bgmTracks(opened.meta)[0].baseFps, opened.profile.speeds[2])
})

test('音: BGM を 1 ページ目より前へずらすと曲の途中から鳴る', async () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const samples = new Int16Array(44100)

  for (let index = 0; index < samples.length; index++) {
    samples[index] = Math.floor(index / 2)
  }

  note.sounds.set('ramp', { id: 'ramp', name: 'r', rate: 44100, samples })

  for (let page = 1; page < 12; page++) note.frames.insertBlank(page, 0)

  const [bgm] = note.meta.tracks

  bgm.soundId = 'ramp'
  bgm.baseFps = note.fps
  bgm.offset = -6

  const first = (await mixed(note))[0]
  const halfway = samples[22050] / 32768

  assert.ok(Math.abs(first - halfway) < 0.01, '半分進んだところから鳴る')
})

test('音: 長い作品の WAV は秒ごとに作られ、長さと中身が合う', async () => {
  const note = Note.create({ title: 't', profile: 'free' })
  const [bgm] = note.meta.tracks
  const samples = new Int16Array(8000).fill(12000)

  note.sounds.set('a', { id: 'a', name: 'a', rate: 8000, samples })

  for (let page = 1; page < 60; page++) note.frames.insertBlank(page, 0)

  bgm.soundId = 'a'
  bgm.baseFps = note.fps

  const wav = new Uint8Array(await (await encodeWav(note)).arrayBuffer())
  const view = new DataView(wav.buffer)
  const length = Math.ceil((60 / note.fps) * 44100)

  assert.equal(view.getUint32(40, true), length * 2, 'data の大きさ')
  assert.equal(wav.length, 44 + length * 2)
  assert.ok(view.getInt16(44 + 2 * 100, true) > 0, '最初の 1 秒に音がある')
  assert.equal(
    view.getInt16(44 + 2 * (length - 1), true),
    0,
    '音が終わったあとは無音',
  )
})
