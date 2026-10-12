import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsStore } from './settingsStore'

let file: string

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), 'settings-')), 'nested', 'settings.json')
})

describe('SettingsStore', () => {
  it('returns defaults when the file does not exist', () => {
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [], queues: [] })
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
      queues: [],
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

  it('keeps in-memory state and does not throw when the file cannot be written', () => {
    const blocker = join(mkdtempSync(join(tmpdir(), 'settings-')), 'blocker')
    writeFileSync(blocker, 'i am a file')
    const store = new SettingsStore(join(blocker, 'settings.json'))
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => store.setVolume(30)).not.toThrow()
    expect(store.get().volume).toBe(30)
    expect(errors).toHaveBeenCalled()
    errors.mockRestore()
  })

  it('falls back to defaults on corrupt JSON', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, '{not json')
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: [], queues: [] })
  })

  it('drops invalid field types', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(file, JSON.stringify({ volume: 'loud', history: [1, 'ok'], display: { id: 'x' } }))
    expect(new SettingsStore(file).get()).toEqual({ volume: 100, history: ['ok'], queues: [] })
  })
})

const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'

describe('SettingsStore saved queues', () => {
  it('saves a queue and persists it', () => {
    const store = new SettingsStore(file)
    expect(store.saveQueue('  Rock  ', [{ videoId: A, title: 'Song A' }])).toBe(true)
    expect(new SettingsStore(file).get().queues).toEqual([
      { name: 'Rock', items: [{ videoId: A, title: 'Song A' }] },
    ])
  })

  it('overwrites an existing name keeping its position', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    store.saveQueue('Two', [{ videoId: A, title: 'A' }])
    expect(store.saveQueue('One', [{ videoId: B, title: 'B' }])).toBe(true)
    expect(store.get().queues.map((q) => q.name)).toEqual(['One', 'Two'])
    expect(store.get().queues[0].items).toEqual([{ videoId: B, title: 'B' }])
  })

  it('rejects invalid names, empty queues and invalid items', () => {
    const store = new SettingsStore(file)
    expect(store.saveQueue('   ', [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('x'.repeat(101), [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('Empty', [])).toBe(false)
    expect(store.saveQueue('Bad', [{ videoId: 'nope', title: 'A' }])).toBe(false)
    expect(store.get().queues).toEqual([])
  })

  it('refuses new names beyond 50 queues but still allows overwriting', () => {
    const store = new SettingsStore(file)
    for (let i = 0; i < 50; i++) expect(store.saveQueue(`q${i}`, [{ videoId: A, title: 'A' }])).toBe(true)
    expect(store.saveQueue('one-more', [{ videoId: A, title: 'A' }])).toBe(false)
    expect(store.saveQueue('q0', [{ videoId: B, title: 'B' }])).toBe(true)
    expect(store.get().queues).toHaveLength(50)
  })

  it('rejects queues with more than 200 items', () => {
    const store = new SettingsStore(file)
    const item = { videoId: A, title: 'A' }
    expect(store.saveQueue('Big', Array.from({ length: 201 }, () => item))).toBe(false)
    expect(store.saveQueue('Max', Array.from({ length: 200 }, () => item))).toBe(true)
  })

  it('drops saved queues with more than 200 items on read', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    const item = { videoId: A, title: 'A' }
    writeFileSync(
      file,
      JSON.stringify({ queues: [{ name: 'Big', items: Array.from({ length: 201 }, () => item) }] }),
    )
    expect(new SettingsStore(file).get().queues).toEqual([])
  })

  it('lists queue names without copying the queues', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    store.saveQueue('Two', [{ videoId: B, title: 'B' }])
    expect(store.queueNames()).toEqual(['One', 'Two'])
  })

  it('deletes a queue', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    store.deleteQueue('One')
    store.deleteQueue('missing')
    expect(new SettingsStore(file).get().queues).toEqual([])
  })

  it('drops invalid saved queues on read', () => {
    const store = new SettingsStore(file)
    store.setVolume(10)
    writeFileSync(
      file,
      JSON.stringify({
        queues: [
          { name: 'Good', items: [{ videoId: A, title: 'A' }] },
          { name: '', items: [{ videoId: A, title: 'A' }] },
          { name: 'NoItems', items: [] },
          { name: 'BadId', items: [{ videoId: 'x', title: 'A' }] },
          'garbage',
        ],
      }),
    )
    expect(new SettingsStore(file).get().queues).toEqual([{ name: 'Good', items: [{ videoId: A, title: 'A' }] }])
  })

  it('get returns deep copies', () => {
    const store = new SettingsStore(file)
    store.saveQueue('One', [{ videoId: A, title: 'A' }])
    const copy = store.get()
    copy.queues[0].items[0].title = 'hacked'
    copy.queues.pop()
    expect(store.get().queues[0].items[0].title).toBe('A')
  })
})
