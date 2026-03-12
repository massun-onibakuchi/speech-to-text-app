import { defineConfig } from 'electron-vite'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const require = createRequire(import.meta.url)
export const BROWSER_VAD_WORKLET_PLUGIN_NAME = 'copy-renderer-browser-vad-worklet'

export const STABLE_RENDERER_ASSETS = new Set([
  'silero_vad_legacy.onnx',
  'silero_vad_v5.onnx',
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm'
])

export const resolveRendererAssetFileName = (assetInfo: { name?: string; names?: string[] }): string => {
  const candidateNames = assetInfo.names ?? []
  const originalName = candidateNames[0] ?? assetInfo.name ?? ''
  const basename = originalName.split('/').pop() ?? ''

  if (STABLE_RENDERER_ASSETS.has(basename)) {
    return 'assets/[name][extname]'
  }

  return 'assets/[name]-[hash][extname]'
}

export const copyRendererBrowserVadWorklet = (): Plugin => ({
  name: BROWSER_VAD_WORKLET_PLUGIN_NAME,
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'assets/vad.worklet.bundle.min.js',
      source: readFileSync(require.resolve('@ricky0123/vad-web/dist/vad.worklet.bundle.min.js'))
    })
  }
})

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
  renderer: {
    plugins: [tailwindcss(), react(), copyRendererBrowserVadWorklet()],
    build: {
      rollupOptions: {
        output: {
          assetFileNames: resolveRendererAssetFileName
        }
      }
    },
    resolve: {
      alias: {
        // Allow shadcn/ui and components to import from '@/lib/utils' etc.
        '@': resolve(__dirname, 'src/renderer')
      }
    }
  }
})
