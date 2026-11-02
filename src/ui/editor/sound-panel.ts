import type { Editor } from '../../app/editor.ts'
import type { Session } from '../../app/session.ts'
import {
  bgmTracks,
  createId,
  type Sound,
  soundTracks,
  type Track,
  trackBase,
  trackPages,
} from '../../core/note.ts'
import { floatToPcm, resample } from '../../audio/pcm.ts'
import { renderPreset } from '../../audio/presets.ts'
import { t } from '../../i18n/index.ts'
import { registries } from '../../plugin/host.ts'
import { pickFile } from '../app.ts'
import { h, icon, key, setPressed } from '../dom.ts'
import { openDialog, toast } from '../overlay.ts'
import { sliderRow, toggleRow } from '../controls.ts'

const STORED_RATE = 22050
const AUDIO_TYPES = 'audio/*'
const RECORD_LIMIT_MS = 60_000
const GAIN_STEPS = 100
const GAIN_MAX = 150

async function decodeAudio(
  data: ArrayBuffer,
): Promise<Int16Array<ArrayBuffer>> {
  const context = new OfflineAudioContext(1, 1, STORED_RATE)
  const decoded = await context.decodeAudioData(data)
  const mixed = new Float32Array(decoded.length)

  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const samples = decoded.getChannelData(channel)

    for (let index = 0; index < mixed.length; index++) {
      mixed[index] += samples[index] / decoded.numberOfChannels
    }
  }

  return resample(floatToPcm(mixed), decoded.sampleRate, STORED_RATE)
}

function setTrackSound(editor: Editor, track: Track, sound: Sound): void {
  editor.note.sounds.set(sound.id, sound)
  track.soundId = sound.id
  track.name = sound.name
  track.length = null
  track.baseFps = editor.note.fps

  if (track.kind === 'bgm') editor.note.meta.bgmSpeed = editor.note.meta.speed

  editor.touchSettings()
}

function trackTitle(editor: Editor, track: Track): string {
  const { meta } = editor.note

  if (track.kind === 'bgm') {
    return t('sound.bgmNumber', { n: bgmTracks(meta).indexOf(track) + 1 })
  }

  return t('sound.slot', { n: soundTracks(meta).indexOf(track) + 1 })
}

function soundLabel(name: string): string {
  const preset = registries.sounds.get(name)

  return preset?.nameKey ? t(preset.nameKey) : name
}

class Recorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null
  private timer = 0

  get isRecording(): boolean {
    return this.recorder !== null
  }

  async start(onLimit: () => void): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    this.chunks = []
    this.recorder = new MediaRecorder(this.stream)
    this.recorder.ondataavailable = event => this.chunks.push(event.data)
    this.recorder.start()
    this.timer = window.setTimeout(onLimit, RECORD_LIMIT_MS)
  }

  async stop(): Promise<Int16Array<ArrayBuffer> | null> {
    const recorder = this.recorder

    clearTimeout(this.timer)

    if (!recorder) return null

    const finished = new Promise(resolve => {
      recorder.onstop = resolve
    })

    recorder.stop()
    await finished

    for (const track of this.stream?.getTracks() ?? []) track.stop()

    this.recorder = null

    const blob = new Blob(this.chunks)

    return decodeAudio(await blob.arrayBuffer())
  }
}

export function openSoundPicker(
  editor: Editor,
  session: Session,
  track: Track,
): void {
  const { note } = editor
  const recorder = new Recorder()
  const isBgm = track.kind === 'bgm'

  const finish = (sound: Sound): void => {
    setTrackSound(editor, track, sound)

    if (!isBgm) session.mixer.preview(note, track)

    dialog.close()
  }

  const loadFile = async (): Promise<void> => {
    const file = await pickFile(AUDIO_TYPES)

    if (!file) return

    try {
      finish({
        id: createId(),
        name: file.name.replace(/\.[^.]+$/, ''),
        rate: STORED_RATE,
        samples: await decodeAudio(await file.arrayBuffer()),
      })
    } catch {
      toast(t('sound.fileFailed'), { isError: true })
    }
  }

  const stopRecording = async (): Promise<void> => {
    const samples = await recorder.stop()

    if (!samples?.length) return

    finish({
      id: createId(),
      name: t('sound.recorded'),
      rate: STORED_RATE,
      samples,
    })
  }

  const toggleRecording = async (): Promise<void> => {
    if (recorder.isRecording) {
      await stopRecording()

      return
    }

    try {
      await recorder.start(() => void stopRecording())
      setPressed(recordButton, true)
    } catch {
      toast(t('sound.micFailed'), { isError: true })
    }
  }

  const presets = registries.sounds.list().map(preset =>
    h(
      'button',
      {
        class: 'preset',
        type: 'button',
        'data-nav': true,
        onClick: () => finish(renderPreset(preset, createId())),
      },
      icon('music'),
      preset.nameKey ? t(preset.nameKey) : (preset.name ?? preset.id),
    ),
  )

  const recordButton = key({
    icon: 'mic',
    label: t('sound.record'),
    variant: 'soft',
    onPress: () => void toggleRecording(),
  })

  const current = track.soundId ? note.sounds.get(track.soundId) : null

  const lengthRow = (sound: Sound): HTMLElement => {
    const base = trackBase(track, note.fps)
    const whole = Math.max(
      1,
      Math.round((sound.samples.length / sound.rate) * base),
    )

    return sliderRow(
      t('sound.length'),
      Math.round(trackPages(track, sound, note.fps)),
      { min: 1, max: whole },
      value => {
        track.length = value >= whole ? null : value / base
        editor.touchSettings()
      },
    )
  }

  const fileButton = key({
    icon: 'upload',
    label: t('sound.file'),
    onPress: () => void loadFile(),
  })

  const nowRow = current
    ? h(
        'div',
        { class: 'sound-now' },
        icon(isBgm ? 'music' : 'volume'),
        h('span', { class: 'sound-now-name' }, soundLabel(current.name)),
        key({
          icon: 'play',
          label: t('sound.test'),
          variant: 'soft',
          onPress: () => session.mixer.preview(note, track),
        }),
      )
    : null

  const dialog = openDialog({
    title: trackTitle(editor, track),
    icon: 'music',
    isWide: true,
    body: [
      nowRow,
      isBgm
        ? h('div', { class: 'bgm-choices' }, recordButton, fileButton)
        : [
            h('h3', { class: 'field-label' }, t('sound.presets')),
            h('div', { class: 'preset-grid' }, presets),
          ],
      current ? lengthRow(current) : null,
      sliderRow(
        t('sound.gain'),
        Math.round(track.gain * GAIN_STEPS),
        { min: 0, max: GAIN_MAX },
        value => {
          track.gain = value / GAIN_STEPS
          editor.touchSettings()
        },
      ),
      current
        ? toggleRow(t('sound.mute'), track.muted, value => {
            track.muted = value
            editor.touchSettings()
          })
        : null,
    ],
    footer: [
      key({
        icon: 'trash',
        title: t('sound.clear'),
        isDisabled: !track.soundId,
        onPress: () => {
          track.soundId = null
          editor.touchSettings()
          dialog.close()
        },
      }),
      isBgm ? null : fileButton,
      isBgm ? null : recordButton,
    ],
  })
}
