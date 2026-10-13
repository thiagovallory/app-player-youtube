import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { createFetch, type NetLike } from './electronFetch'

class FakeResponse extends EventEmitter {
  constructor(public statusCode: number) {
    super()
  }
}

class FakeRequest extends EventEmitter {
  aborted = false
  abort() {
    this.aborted = true
  }
  end() {}
}

function legacyNet(request: FakeRequest): NetLike {
  return { request: () => request as unknown as ReturnType<NetLike['request']> }
}

describe('createFetch', () => {
  it('uses net.fetch when it exists', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ title: 'T' }) }))
    const signal = new AbortController().signal
    const result = await createFetch({ fetch, request: vi.fn() as unknown as NetLike['request'] })('https://x', { signal })
    expect(fetch).toHaveBeenCalledWith('https://x', { signal })
    expect(await result.json()).toEqual({ title: 'T' })
  })

  it('falls back to net.request and parses the JSON body', async () => {
    const request = new FakeRequest()
    const promise = createFetch(legacyNet(request))('https://x', { signal: new AbortController().signal })
    const response = new FakeResponse(200)
    request.emit('response', response)
    response.emit('data', Buffer.from('{"title":"Olá'))
    response.emit('data', Buffer.from(' mundo"}'))
    response.emit('end')
    const result = await promise
    expect(result.ok).toBe(true)
    expect(await result.json()).toEqual({ title: 'Olá mundo' })
  })

  it('reports non-2xx responses as not ok', async () => {
    const request = new FakeRequest()
    const promise = createFetch(legacyNet(request))('https://x', { signal: new AbortController().signal })
    const response = new FakeResponse(404)
    request.emit('response', response)
    response.emit('end')
    expect((await promise).ok).toBe(false)
  })

  it('rejects on request errors', async () => {
    const request = new FakeRequest()
    const promise = createFetch(legacyNet(request))('https://x', { signal: new AbortController().signal })
    request.emit('error', new Error('offline'))
    await expect(promise).rejects.toThrow('offline')
  })

  it('aborts the request when the signal fires', async () => {
    const request = new FakeRequest()
    const controller = new AbortController()
    const promise = createFetch(legacyNet(request))('https://x', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toThrow('aborted')
    expect(request.aborted).toBe(true)
  })

  it('rejects immediately when the signal is already aborted', async () => {
    const request = new FakeRequest()
    const controller = new AbortController()
    controller.abort()
    await expect(createFetch(legacyNet(request))('https://x', { signal: controller.signal })).rejects.toThrow('aborted')
    expect(request.aborted).toBe(true)
  })
})
