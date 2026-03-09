/*
Where: src/shared/electron-vite-config.test.ts
What: Regression coverage for renderer asset handling in electron-vite config.
Why: The Groq browser-VAD path depends on stable ORT/model asset names plus an explicit
     build-time copy of the VAD worklet, so this guards the config contract directly.
*/

import { describe, expect, it } from 'vitest'
import {
  BROWSER_VAD_WORKLET_PLUGIN_NAME,
  copyRendererBrowserVadWorklet,
  resolveRendererAssetFileName
} from '../../electron.vite.config'

describe('electron vite config', () => {
  it('keeps Groq browser-VAD renderer assets on stable filenames', () => {
    expect(resolveRendererAssetFileName({ name: 'silero_vad_v5.onnx' })).toBe('assets/[name][extname]')
    expect(resolveRendererAssetFileName({ name: 'silero_vad_legacy.onnx' })).toBe('assets/[name][extname]')
    expect(resolveRendererAssetFileName({ name: 'ort-wasm-simd-threaded.wasm' })).toBe('assets/[name][extname]')
    expect(resolveRendererAssetFileName({ name: 'ort-wasm-simd-threaded.mjs' })).toBe('assets/[name][extname]')
    expect(resolveRendererAssetFileName({ name: 'index.css' })).toBe('assets/[name]-[hash][extname]')
  })
  it('defines the browser-VAD worklet copy plugin', () => {
    expect(copyRendererBrowserVadWorklet().name).toBe(BROWSER_VAD_WORKLET_PLUGIN_NAME)
  })
})
