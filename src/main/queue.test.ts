import { describe, expect, it } from 'vitest'
import { PlaybackQueue } from './queue'

const v = (videoId: string, title = videoId) => ({ videoId, title })

function make() {
  let n = 0
  return new PlaybackQueue(() => `u${++n}`)
}

const ids = (q: PlaybackQueue) => q.snapshot().items.map((i) => i.videoId)

describe('add', () => {
  it('selects the first added item without playing when nothing is current (after removing the last current item)', () => {
    const q = make()
    q.add([v('a'), v('b')])
    q.next()
    q.remove('u2')
    expect(q.snapshot().currentUid).toBeNull()
    expect(q.add([v('c')])).toBeNull()
    expect(q.snapshot().currentUid).toBe('u3')
  })

  it('selects the first added item without playing when the queue was empty', () => {
    const q = make()
    expect(q.add([v('a'), v('b')])).toBeNull()
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('appends without changing the current item when something is already queued', () => {
    const q = make()
    q.add([v('a')])
    expect(q.add([v('b')])).toBeNull()
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('selects the first new item without playing after the queue ended automatically', () => {
    const q = make()
    q.add([v('a')])
    expect(q.next(true)).toBeNull()
    expect(q.add([v('b')])).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
    expect(q.next()).toBeNull()
    expect(q.add([v('c')])).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('does nothing for an empty list', () => {
    const q = make()
    expect(q.add([])).toBeNull()
    expect(ids(q)).toEqual([])
  })
})

describe('replace', () => {
  it('replaces the queue and plays the first item', () => {
    const q = make()
    q.add([v('x')])
    const action = q.replace([v('a'), v('b')])
    expect(ids(q)).toEqual(['a', 'b'])
    expect(action).toEqual({ play: { uid: 'u2', videoId: 'a', title: 'a' } })
  })

  it('starts at the requested video when it is present', () => {
    const q = make()
    const action = q.replace([v('a'), v('b'), v('c')], 'b')
    expect(action).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
  })

  it('falls back to the first item when the start video is missing', () => {
    const q = make()
    const action = q.replace([v('a'), v('b')], 'zzz')
    expect(action).toEqual({ play: { uid: 'u1', videoId: 'a', title: 'a' } })
  })

  it('stops when replaced by nothing', () => {
    const q = make()
    q.add([v('a')])
    expect(q.replace([])).toEqual({ stop: true })
    expect(q.snapshot()).toEqual({ items: [], currentUid: null })
  })

  it('without autoplay selects the first item and asks to stop', () => {
    const q = make()
    q.add([v('x')])
    expect(q.replace([v('a'), v('b')], undefined, false)).toEqual({ stop: true })
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('without autoplay selects the requested video when present', () => {
    const q = make()
    expect(q.replace([v('a'), v('b')], 'b', false)).toEqual({ stop: true })
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('without autoplay clears the ended flag and stops for an empty list', () => {
    const q = make()
    q.add([v('a')])
    q.next(true)
    q.replace([v('b')], undefined, false)
    expect(q.add([v('c')])).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
    expect(q.replace([], undefined, false)).toEqual({ stop: true })
    expect(q.snapshot()).toEqual({ items: [], currentUid: null })
  })
})

describe('remove', () => {
  it('keeps the current item when removing another one', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.remove('u3')).toBeNull()
    expect(ids(q)).toEqual(['a', 'b'])
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('plays the next item when the current one is removed', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.remove('u1')).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(ids(q)).toEqual(['b', 'c'])
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('stops when the current and last item is removed', () => {
    const q = make()
    q.add([v('a'), v('b')])
    q.playAt('u2')
    expect(q.remove('u2')).toEqual({ stop: true })
    expect(q.snapshot().currentUid).toBeNull()
    expect(ids(q)).toEqual(['a'])
  })

  it('ignores unknown uids', () => {
    const q = make()
    q.add([v('a')])
    expect(q.remove('nope')).toBeNull()
    expect(ids(q)).toEqual(['a'])
  })
})

describe('move', () => {
  it('moves an item forward and backward', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.move('u1', 2)).toBe(true)
    expect(ids(q)).toEqual(['b', 'c', 'a'])
    expect(q.move('u3', 0)).toBe(true)
    expect(ids(q)).toEqual(['c', 'b', 'a'])
  })

  it('does not change the current item', () => {
    const q = make()
    q.add([v('a'), v('b')])
    q.move('u1', 1)
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('rejects unknown uids and invalid indexes', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.move('nope', 0)).toBe(false)
    expect(q.move('u1', 2)).toBe(false)
    expect(q.move('u1', -1)).toBe(false)
    expect(q.move('u1', 0.5)).toBe(false)
    expect(ids(q)).toEqual(['a', 'b'])
  })
})

describe('clear and playAt', () => {
  it('clear empties the queue and stops', () => {
    const q = make()
    q.add([v('a')])
    expect(q.clear()).toEqual({ stop: true })
    expect(q.snapshot()).toEqual({ items: [], currentUid: null })
  })

  it('playAt selects an item and ignores unknown uids', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.playAt('u2')).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(q.snapshot().currentUid).toBe('u2')
    expect(q.playAt('nope')).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
  })
})

describe('next and prev', () => {
  it('moves forward and backward', () => {
    const q = make()
    q.add([v('a'), v('b'), v('c')])
    expect(q.next()).toEqual({ play: { uid: 'u2', videoId: 'b', title: 'b' } })
    expect(q.prev()).toEqual({ play: { uid: 'u1', videoId: 'a', title: 'a' } })
  })

  it('does nothing at the edges for manual navigation', () => {
    const q = make()
    q.add([v('a'), v('b')])
    expect(q.prev()).toBeNull()
    q.playAt('u2')
    expect(q.next()).toBeNull()
    expect(q.snapshot().currentUid).toBe('u2')
  })

  it('manual next on the last item does not mark the queue as ended', () => {
    const q = make()
    q.add([v('a')])
    q.next()
    expect(q.add([v('b')])).toBeNull()
    expect(q.snapshot().currentUid).toBe('u1')
  })

  it('does nothing without a current item', () => {
    const q = make()
    expect(q.next()).toBeNull()
    expect(q.prev()).toBeNull()
  })
})

describe('setTitleByVideoId', () => {
  it('updates only provisional titles of matching videos', () => {
    const q = make()
    q.add([v('a'), v('a', 'Custom'), v('b')])
    expect(q.setTitleByVideoId('a', 'Real title')).toBe(true)
    expect(q.snapshot().items.map((i) => i.title)).toEqual(['Real title', 'Custom', 'b'])
    expect(q.setTitleByVideoId('a', 'Other')).toBe(false)
  })
})

describe('snapshot', () => {
  it('returns copies that do not leak mutations', () => {
    const q = make()
    q.add([v('a')])
    const snap = q.snapshot()
    snap.items[0].title = 'hacked'
    snap.items.pop()
    expect(q.snapshot().items).toEqual([{ uid: 'u1', videoId: 'a', title: 'a' }])
  })
})
