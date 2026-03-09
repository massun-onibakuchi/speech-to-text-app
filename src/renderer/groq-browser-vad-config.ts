/*
Where: src/renderer/groq-browser-vad-config.ts
What: Browser-VAD defaults and asset-path helpers for the Groq utterance capture path.
Why: Keep the Groq-specific VAD contract centralized so capture code and tests do not
     spread package asset assumptions or tuning constants across multiple files.
*/

import legacyModelUrl from '@ricky0123/vad-web/dist/silero_vad_legacy.onnx?url'
import v5ModelUrl from '@ricky0123/vad-web/dist/silero_vad_v5.onnx?url'
import ortWasmThreadedMjsUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url'
import ortWasmThreadedUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

export interface GroqBrowserVadConfig {
  model: 'v5'
  positiveSpeechThreshold: number
  negativeSpeechThreshold: number
  redemptionMs: number
  preSpeechPadMs: number
  minSpeechMs: number
  maxUtteranceMs: number
  startupTimeoutMs: number
  backpressureSignalMs: number
}

export const GROQ_BROWSER_VAD_DEFAULTS: GroqBrowserVadConfig = {
  model: 'v5',
  positiveSpeechThreshold: 0.3,
  negativeSpeechThreshold: 0.25,
  redemptionMs: 900,
  preSpeechPadMs: 400,
  minSpeechMs: 160,
  maxUtteranceMs: 12_000,
  startupTimeoutMs: 5_000,
  backpressureSignalMs: 300
}

export interface GroqBrowserVadAssetPaths {
  baseAssetPath: string
  onnxWASMBasePath: string
  onnxWasmPaths: {
    mjs: string
    wasm: string
  }
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

export const GROQ_BROWSER_VAD_ASSET_PATHS: GroqBrowserVadAssetPaths = {
  baseAssetPath: resolveAssetDirectory(v5ModelUrl),
  onnxWASMBasePath: resolveAssetDirectory(ortWasmThreadedUrl),
  onnxWasmPaths: {
    mjs: ortWasmThreadedMjsUrl,
    wasm: ortWasmThreadedUrl
  },
  legacyModelUrl,
  v5ModelUrl
}
