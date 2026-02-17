import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['electron-store'],
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        },
        output: {
          format: 'cjs',
          entryFileNames: '[name].js'
        }
      }
    }
  },
  renderer: {}
})
