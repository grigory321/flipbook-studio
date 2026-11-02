import assert from 'node:assert/strict'
import { test } from 'node:test'
import { PluginHost, registries } from '../src/plugin/host.ts'
import { pluginFromModule } from '../src/plugin/loader.ts'

const SAMPLE = '../plugins/stamp-pack.js'
const stampPack = pluginFromModule(await import(SAMPLE))

test('プラグイン: 見本を有効にすると登録され、無効にすると外れる', () => {
  const host = new PluginHost()

  host.define(stampPack)

  assert.ok(host.isEnabled('sample.stamp-pack'))
  assert.ok(registries.tools.get('stamp.star'))
  assert.ok(registries.patterns.get('sample.zigzag'))
  assert.ok(registries.commands.get('sample.count'))
  assert.ok(registries.panels.get('sample.panel'))

  host.disable('sample.stamp-pack')

  assert.equal(registries.tools.get('stamp.star'), undefined)
  assert.equal(registries.patterns.get('sample.zigzag'), undefined)
  assert.equal(registries.panels.get('sample.panel'), undefined)
})

test('プラグイン: 標準の機能は無効にできない', () => {
  const host = new PluginHost()

  host.define({
    id: 'core.test',
    name: 'core',
    version: '1',
    isCore: true,
    setup: () => {},
  })

  host.disable('core.test')

  assert.ok(host.isEnabled('core.test'))
})

test('プラグイン: 開始に失敗しても本体は止まらず、途中の登録も残らない', () => {
  const host = new PluginHost()
  const original = console.error

  console.error = () => {}

  host.define({
    id: 'bad.plugin',
    name: 'bad',
    version: '1',
    setup: api => {
      api.commands.register({
        id: 'bad.command',
        name: 'x',
        icon: 'star',
        run: () => {},
      })

      throw new Error('失敗')
    },
  })

  console.error = original

  assert.equal(host.isEnabled('bad.plugin'), false)
  assert.equal(registries.commands.get('bad.command'), undefined)
})

test('プラグイン: 無効に設定したものは起動時に動かさない', () => {
  const host = new PluginHost(id => id === 'off.plugin')
  let didRun = false

  host.define({
    id: 'off.plugin',
    name: 'off',
    version: '1',
    setup: () => {
      didRun = true
    },
  })

  assert.equal(didRun, false)
})

test('プラグイン: ファイルの中身は形を確かめ、標準の機能を名乗れない', () => {
  const plugin = pluginFromModule({
    default: { id: 'fake.core', isCore: true, setup: () => {} },
  })

  assert.equal(plugin.isCore, undefined)
  assert.equal(plugin.name, 'fake.core')
  assert.throws(() => pluginFromModule({ default: { id: 'no.setup' } }))
  assert.throws(() => pluginFromModule(null))
})
