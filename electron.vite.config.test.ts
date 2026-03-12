/*
Where: electron.vite.config.test.ts
What: Regression checks for renderer asset filenames that must stay stable.
Why: vad-web 0.0.24 passes a wasm directory prefix to onnxruntime-web 1.14.0,
     which loads fixed filenames at runtime instead of hashed bundle assets.
*/

import { describe, expect, it } from 'vitest'
import { STABLE_RENDERER_ASSETS, resolveRendererAssetFileName } from './electron.vite.config'

describe('renderer stable assets', () => {
  it('keeps the 0.0.24 onnx wasm filenames unhashed', () => {
    expect(STABLE_RENDERER_ASSETS).toEqual(new Set([
      'silero_vad_legacy.onnx',
      'silero_vad_v5.onnx',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd.wasm',
      'ort-wasm-threaded.wasm',
      'ort-wasm.wasm'
    ]))
  })

  it('emits stable filenames for onnx wasm files', () => {
    expect(resolveRendererAssetFileName({
      names: ['node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm']
    })).toBe('assets/[name][extname]')
    expect(resolveRendererAssetFileName({
      names: ['node_modules/onnxruntime-web/dist/ort-wasm.wasm']
    })).toBe('assets/[name][extname]')
  })
})
