import type { FetchLike } from './oembed'

interface ResponseLike {
  statusCode: number
  on(event: 'data', listener: (chunk: Buffer) => void): unknown
  on(event: 'end', listener: () => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

interface RequestLike {
  on(event: 'response', listener: (response: ResponseLike) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
  abort(): void
  end(): void
}

export interface NetLike {
  fetch?: (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>
  request(options: { url: string; method: string }): RequestLike
}

// `net.fetch` só existe a partir do Electron 25; versões anteriores (Windows 7/8) usam `net.request`.
export function createFetch(net: NetLike): FetchLike {
  const nativeFetch = net.fetch
  if (typeof nativeFetch === 'function') return (url, init) => nativeFetch.call(net, url, init)

  return (url, init) =>
    new Promise((resolve, reject) => {
      const request = net.request({ url, method: 'GET' })
      const onAbort = () => {
        request.abort()
        reject(new Error('aborted'))
      }
      if (init.signal.aborted) {
        onAbort()
        return
      }
      init.signal.addEventListener('abort', onAbort, { once: true })
      request.on('response', (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('error', reject)
        response.on('end', () => {
          init.signal.removeEventListener('abort', onAbort)
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            json: async () => JSON.parse(text) as unknown,
          })
        })
      })
      request.on('error', (error) => {
        init.signal.removeEventListener('abort', onAbort)
        reject(error)
      })
      request.end()
    })
}
