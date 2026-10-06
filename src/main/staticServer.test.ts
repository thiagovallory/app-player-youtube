import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startStaticServer } from './staticServer'

let base: string
let root: string
let server: Awaited<ReturnType<typeof startStaticServer>>

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), 'static-'))
  root = join(base, 'public')
  mkdirSync(join(root, 'player'), { recursive: true })
  writeFileSync(join(root, 'player', 'index.html'), '<h1>oi</h1>')
  writeFileSync(join(base, 'secret.txt'), 'secret')
  server = await startStaticServer(root)
})

afterEach(async () => {
  await server.close()
})

function get(path: string): Promise<{ status: number; type: string | undefined; body: string }> {
  const { hostname, port } = new URL(server.url)
  return new Promise((resolve, reject) => {
    request({ hostname, port, path, method: 'GET' }, (res) => {
      let body = ''
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: res.headers['content-type'], body }))
    })
      .on('error', reject)
      .end()
  })
}

describe('startStaticServer', () => {
  it('serves files with the right content type', async () => {
    const res = await get('/player/index.html')
    expect(res.status).toBe(200)
    expect(res.type).toBe('text/html; charset=utf-8')
    expect(res.body).toBe('<h1>oi</h1>')
  })

  it('returns 404 for missing files', async () => {
    expect((await get('/player/nope.html')).status).toBe(404)
  })

  it('refuses paths that escape the root', async () => {
    const res = await get('/%2e%2e/secret.txt')
    expect(res.status).toBe(403)
    expect(res.body).not.toContain('secret')
  })
})
