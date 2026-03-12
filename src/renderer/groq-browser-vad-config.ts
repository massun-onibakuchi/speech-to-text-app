/*
Where: src/renderer/groq-browser-vad-config.ts
What: Browser-VAD defaults and asset-path helpers for the thin Groq utterance capture path.
Why: Keep the Groq-specific MicVAD contract centralized after deleting the legacy
     renderer-owned continuation state machine.
*/

import legacyModelUrl from '@ricky0123/vad-web/dist/silero_vad_legacy.onnx?url'
import v5ModelUrl from '@ricky0123/vad-web/dist/silero_vad_v5.onnx?url'
import ortWasmUrl from 'onnxruntime-web/dist/ort-wasm.wasm?url'
import ortWasmSimdUrl from 'onnxruntime-web/dist/ort-wasm-simd.wasm?url'
import ortWasmThreadedUrl from 'onnxruntime-web/dist/ort-wasm-threaded.wasm?url'
import ortWasmSimdThreadedUrl from 'onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url'

export interface GroqBrowserVadConfig {
  model: 'v5'
  positiveSpeechThreshold: number
  negativeSpeechThreshold: number
  redemptionMs: number
  preSpeechPadMs: number
  minSpeechMs: number
  startupTimeoutMs: number
  backpressureSignalMs: number
}

export const GROQ_BROWSER_VAD_DEFAULTS: GroqBrowserVadConfig = {
  model: 'v5',
  // Match vad-web 0.0.24 v5 defaults so this path stays as close as possible
  // to Epicenter's thin MicVAD integration.
  positiveSpeechThreshold: 0.5,
  negativeSpeechThreshold: 0.35,
  redemptionMs: 768,
  preSpeechPadMs: 96,
  minSpeechMs: 288,
  startupTimeoutMs: 5_000,
  backpressureSignalMs: 300
}

export interface GroqBrowserVadAssetPaths {
  baseAssetPath: string
  onnxWASMBasePath: string
  legacyModelUrl: string
  v5ModelUrl: string
}

const resolveAssetDirectory = (assetUrl: string): string => {
  const lastSlashIndex = assetUrl.lastIndexOf('/')
  if (lastSlashIndex < 0) {
    return './'
  }
  return `${assetUrl.slice(0, lastSlashIndex + 1)}`
}

const ORT_WASM_ASSET_URLS = [
  ortWasmUrl,
  ortWasmSimdUrl,
  ortWasmThreadedUrl,
  ortWasmSimdThreadedUrl
] as const

export const GROQ_BROWSER_VAD_ASSET_PATHS: GroqBrowserVadAssetPaths = {
  baseAssetPath: resolveAssetDirectory(v5ModelUrl),
  // MicVAD 0.0.24 forwards a string prefix into onnxruntime-web 1.14.0, so
  // the renderer build must emit the original wasm basenames into one stable
  // directory. Importing all variants ensures Vite copies them.
  onnxWASMBasePath: resolveAssetDirectory(ORT_WASM_ASSET_URLS[0]),
  legacyModelUrl,
  v5ModelUrl
}
