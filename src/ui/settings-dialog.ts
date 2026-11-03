import { ONION_MAX, settings } from '../app/settings.ts'
import type { Signal } from '../core/signal.ts'
import {
  detectLanguage,
  language,
  LANGUAGES,
  type Language,
  plural,
  setLanguage,
  t,
} from '../i18n/index.ts'
import { definePluginFromFile } from '../plugin/loader.ts'
import { type App, pickFile } from './app.ts'
import { settingSlider, settingToggle } from './controls.ts'
import { fill, h, key } from './dom.ts'
import { type DialogHandle, openDialog, toast } from './overlay.ts'

const ONION_RANGE = {
  min: 0,
  max: ONION_MAX,
  format: (value: number) => plural('common.pages', value),
}

export function applyLanguageSetting(): void {
  const choice = settings.language.peek()

  setLanguage(choice === 'auto' ? detectLanguage() : choice)
}

function languageRow(dialog: () => DialogHandle | null): HTMLElement {
  const current = settings.language.peek()

  const choose = (choice: Language | 'auto'): void => {
    settings.language.value = choice
    dialog()?.close()
    applyLanguageSetting()
  }

  const options: { id: Language | 'auto'; name: string }[] = [
    { id: 'auto', name: t('settings.languageAuto') },
    ...LANGUAGES,
  ]

  return h(
    'div',
    { class: 'chip-row' },
    options.map(option =>
      h(
        'button',
        {
          class: 'chip',
          type: 'button',
          'data-nav': true,
          lang: option.id === 'auto' ? language.peek() : option.id,
          'aria-pressed': String(option.id === current),
          onClick: () => choose(option.id),
        },
        option.name,
      ),
    ),
  )
}

function choiceRow<T extends string>(
  setting: Signal<T>,
  options: readonly (readonly [T, string])[],
): HTMLElement {
  const row = h('div', { class: 'chip-row' })

  const render = (): void => {
    const current = setting.peek()

    fill(
      row,
      options.map(([value, label]) =>
        h(
          'button',
          {
            class: 'chip',
            type: 'button',
            'data-nav': true,
            'aria-pressed': String(value === current),
            onClick: () => {
              setting.value = value
              render()
            },
          },
          label,
        ),
      ),
    )
  }

  render()

  return row
}

function pluginList(app: App): HTMLElement {
  const host = app.session.host
  const list = h('div', { class: 'plugin-list' })

  const render = (): void => {
    fill(
      list,
      host.list().map(plugin => {
        const isCore = plugin.isCore === true
        const isEnabled = host.isEnabled(plugin.id)

        return h(
          'div',
          { class: 'plugin-row' },
          h(
            'div',
            { class: 'plugin-text' },
            h('b', null, plugin.name),
            h(
              'small',
              null,
              plugin.description?.startsWith('plugin.')
                ? t(plugin.description)
                : (plugin.description ?? `v${plugin.version}`),
            ),
          ),
          isCore
            ? h('span', { class: 'badge' }, t('settings.pluginCore'))
            : h(
                'button',
                {
                  class: 'switch',
                  type: 'button',
                  role: 'switch',
                  'data-nav': true,
                  'aria-label': plugin.name,
                  'aria-checked': String(isEnabled),
                  onClick: () => {
                    togglePlugin(app, plugin.id, !isEnabled)
                    render()
                  },
                },
                h('span', { class: 'switch-knob' }),
              ),
        )
      }),
    )
  }

  render()

  return list
}

function togglePlugin(app: App, id: string, isOn: boolean): void {
  const host = app.session.host
  const disabled = new Set(settings.disabledPlugins.peek())

  if (isOn) {
    disabled.delete(id)
    host.enable(id)
  } else {
    disabled.add(id)
    host.disable(id)
  }

  settings.disabledPlugins.value = [...disabled]
}

export function openAppSettings(app: App): void {
  let dialog: DialogHandle | null = null

  const loadPlugin = async (): Promise<void> => {
    const file = await pickFile('.js')

    if (!file) return

    try {
      await definePluginFromFile(file, app.session.host)
      toast(t('settings.pluginLoaded'))
      dialog?.close()
      openAppSettings(app)
    } catch (error) {
      console.error(error)
      toast(t('settings.pluginFailed'), { isError: true })
    }
  }

  dialog = openDialog({
    title: t('settings.title'),
    icon: 'gear',
    isWide: true,
    body: h(
      'div',
      { class: 'settings' },
      h('h3', { class: 'field-label' }, t('settings.language')),
      languageRow(() => dialog),
      h('h3', { class: 'field-label' }, t('settings.feel')),
      settingToggle(t('settings.sfx'), settings.sfx),
      settingToggle(t('settings.drawSounds'), settings.drawSounds),
      settingSlider(t('settings.sfxVolume'), settings.sfxVolume, {
        min: 0,
        max: 10,
      }),
      settingToggle(t('settings.stepSounds'), settings.stepSounds),
      settingToggle(t('settings.skipTitle'), settings.skipTitle),
      h('h3', { class: 'field-label' }, t('settings.drawing')),
      settingSlider(t('settings.stabilizer'), settings.stabilizer, {
        min: 0,
        max: 10,
      }),
      h('h3', { class: 'field-label' }, t('settings.hand')),
      choiceRow(settings.hand, [
        ['right', t('settings.hand.right')],
        ['left', t('settings.hand.left')],
      ]),
      h('h3', { class: 'field-label' }, t('settings.paper')),
      choiceRow(settings.paperLook, [
        ['notebook', t('settings.paper.notebook')],
        ['plain', t('settings.paper.plain')],
      ]),
      h('h3', { class: 'field-label' }, t('settings.onion')),
      settingSlider(
        t('settings.onionBefore'),
        settings.onionBefore,
        ONION_RANGE,
      ),
      settingSlider(t('settings.onionAfter'), settings.onionAfter, ONION_RANGE),
      h('h3', { class: 'field-label' }, t('settings.plugins')),
      pluginList(app),
      key({
        icon: 'plugin',
        label: t('settings.pluginLoad'),
        onPress: () => void loadPlugin(),
      }),
    ),
  })
}
