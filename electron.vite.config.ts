import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts') } } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
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
