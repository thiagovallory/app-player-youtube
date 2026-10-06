import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

// Sandboxed preloads can only require('electron'), so shared modules must be inlined into
// each preload instead of emitted as a shared chunk: give each entry its own module copies.
function inlineSharedPerPreload(): Plugin {
  return {
    name: 'inline-shared-per-preload',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !source.startsWith('.')) return null
      const [importerPath, query] = importer.split('?')
      const tag = query?.startsWith('preload=')
        ? query
        : /[\\/]preload[\\/]/.test(importerPath ?? '')
          ? `preload=${(importerPath ?? '').split(/[\\/]/).pop()}`
          : null
      if (!tag) return null
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!resolved || resolved.external) return resolved
      return { ...resolved, id: `${resolved.id.split('?')[0]}?${tag}` }
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin(), inlineSharedPerPreload()],
    build: {
      rollupOptions: {
        input: {
          control: resolve('src/preload/control.ts'),
          player: resolve('src/preload/player.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          control: resolve('src/renderer/control/index.html'),
          player: resolve('src/renderer/player/index.html'),
          identify: resolve('src/renderer/identify/index.html'),
        },
      },
    },
  },
})
