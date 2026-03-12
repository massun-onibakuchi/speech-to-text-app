/*
Where: src/renderer/groq-browser-vad-config.ts
What: Browser-VAD defaults and asset-path helpers for the thin Groq utterance capture path.
Why: Keep the Groq-specific MicVAD contract centralized after deleting the legacy
     renderer-owned continuation state machine.
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
  startupTimeoutMs: number
  backpressureSignalMs: number
}

export const GROQ_BROWSER_VAD_DEFAULTS: GroqBrowserVadConfig = {
  model: 'v5',
  // Live traces on this app's Groq path showed follow-up utterances peaking
  // around 0.29-0.36 while still being real speech on user microphones.
  positiveSpeechThreshold: 0.2,
  negativeSpeechThreshold: 0.15,
  redemptionMs: 1_400,
  preSpeechPadMs: 800,
  // Short follow-up utterances were entering speech_start but ending as
  // misfires before speech_real_start at 400 ms.
  minSpeechMs: 160,
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
