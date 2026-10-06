import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from './settingsStore'

let file: string

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'settings-')), 'nested', 'settings.json')
})

describe('SettingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [] })
  })

  it('persists display, volume and history across instances', () => {
    const store = new SettingsStore(file)
    store.setDisplay({ id: 2, x: 1920, y: 0, width: 1920, height: 1080 })
    store.setVolume(40)
    store.addHistory('https://youtu.be/dQw4w9WgXcQ')

    expect(new SettingsStore(file).get()).toEqual({
      display: { id: 2, x: 1920, y: 0, width: 1920, height: 1080 },
      volume: 40,
      history: ['https://youtu.be/dQw4w9WgXcQ'],
    })
  })

  it('clamps and rounds volume, ignoring non-finite values', () => {
    const store = new SettingsStore(file)
    store.setVolume(150)
    expect(store.get().volume).toBe(100)
    store.setVolume(-5)
    expect(store.get().volume).toBe(0)
    store.setVolume(33.6)
    expect(store.get().volume).toBe(34)
    store.setVolume(Number.NaN)
    expect(store.get().volume).toBe(34)
  })

  it('keeps history deduplicated, most recent first, max 10', () => {
    const store = new SettingsStore(file)
    for (let i = 0; i < 12; i++) store.addHistory(`url-${i}`)
    store.addHistory('url-5')
    const { history } = store.get()
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('url-5')
    expect(history.filter((h) => h === 'url-5')).toHaveLength(1)
  })

  it('falls back to defaults on corrupt JSON', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, '{not json')
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [] })
  })

  it('drops invalid field types', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, JSON.stringify({ volume: 'loud', history: [1, 'ok'], display: { id: 'x' } }))
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: ['ok'] })
  })
})
