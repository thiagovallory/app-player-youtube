import { readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { extname, join, normalize, resolve, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.map': 'application/json',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
}

export function startStaticServer(root: string): Promise<{ url: string; close: () => Promise<void> }> {
  const base = resolve(root)
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0])
      const file = normalize(join(base, path))
      if (!file.startsWith(base + sep)) {
        res.writeHead(403).end()
        return
      }
      const real = await realpath(file)
      if (!real.startsWith((await realpath(base)) + sep)) {
        res.writeHead(403).end()
        return
      }
      const body = await readFile(real)
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch {
      res.writeHead(404).end()
    }
  })

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const { port } = server.address() as AddressInfo
      resolvePromise({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done) => {
            // closeAllConnections() só existe no Node 18.2+ (Electron 22 usa Node 16)
            if ('closeAllConnections' in server) server.closeAllConnections()
            server.close(() => done())
          }),
      })
    })
  })
}
