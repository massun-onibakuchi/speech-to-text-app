/**
 * Where: src/main/services/streaming/whispercpp-model-manager.test.ts
 * What:  Tests for whisper.cpp runtime/model path resolution and missing-asset errors.
 * Why:   Lock the packaging and app-data path contract before adapter wiring
 *        starts depending on these locations.
 */

import { describe, expect, it } from 'vitest'
import { WhisperCppModelManager } from './whispercpp-model-manager'

describe('WhisperCppModelManager', () => {
  it('resolves dev-mode binary under project resources and model assets under userData', () => {
    const manager = new WhisperCppModelManager({
      isPackaged: false,
      cwd: '/project/root',
      resourcesPath: '/app/Resources',
      userDataPath: '/Users/test/Library/Application Support/SpeechToText',
      existsSyncFn: () => true
    })

    expect(manager.resolveRuntimePaths('ggml-large-v3-turbo-q5_0')).toEqual({
      binaryPath: '/project/root/resources/whispercpp/bin/macos-arm64/whisper-stream',
      modelPath: '/Users/test/Library/Application Support/SpeechToText/whispercpp/models/ggml-large-v3-turbo-q5_0.bin',
      coreMlModelPath: '/Users/test/Library/Application Support/SpeechToText/whispercpp/models/ggml-large-v3-turbo-q5_0-encoder.mlmodelc'
    })
  })

  it('resolves packaged binary under process.resourcesPath', () => {
    const manager = new WhisperCppModelManager({
      isPackaged: true,
      cwd: '/project/root',
      resourcesPath: '/Applications/SpeechToText.app/Contents/Resources',
      userDataPath: '/Users/test/Library/Application Support/SpeechToText',
      existsSyncFn: () => true
    })

    expect(manager.resolveRuntimePaths('ggml-large-v3-turbo-q5_0').binaryPath).toBe(
      '/Applications/SpeechToText.app/Contents/Resources/whispercpp/bin/macos-arm64/whisper-stream'
    )
  })

  it('throws an actionable error when the runtime binary is missing', () => {
    const manager = new WhisperCppModelManager({
      platform: 'darwin',
      arch: 'arm64',
      existsSyncFn: () => false
    })

    expect(() => manager.ensureRuntimeReady('ggml-large-v3-turbo-q5_0')).toThrow('runtime binary')
  })

  it('throws an actionable error when the ggml model is missing', () => {
    const existing = new Set([
      '/project/root/resources/whispercpp/bin/macos-arm64/whisper-stream'
    ])
    const manager = new WhisperCppModelManager({
      cwd: '/project/root',
      userDataPath: '/user/data',
      platform: 'darwin',
      arch: 'arm64',
      existsSyncFn: (path) => existing.has(path)
    })

    expect(() => manager.ensureRuntimeReady('ggml-large-v3-turbo-q5_0')).toThrow('model file')
  })

  it('throws an actionable error when the Core ML sidecar is missing', () => {
    const existing = new Set([
      '/project/root/resources/whispercpp/bin/macos-arm64/whisper-stream',
      '/user/data/whispercpp/models/ggml-large-v3-turbo-q5_0.bin'
    ])
    const manager = new WhisperCppModelManager({
      cwd: '/project/root',
      userDataPath: '/user/data',
      platform: 'darwin',
      arch: 'arm64',
      existsSyncFn: (path) => existing.has(path)
    })

    expect(() => manager.ensureRuntimeReady('ggml-large-v3-turbo-q5_0')).toThrow('Core ML encoder directory')
  })

  it('returns runtime paths when all required assets exist', () => {
    const existing = new Set([
      '/project/root/resources/whispercpp/bin/macos-arm64/whisper-stream',
      '/user/data/whispercpp/models/ggml-large-v3-turbo-q5_0.bin',
      '/user/data/whispercpp/models/ggml-large-v3-turbo-q5_0-encoder.mlmodelc'
    ])
    const manager = new WhisperCppModelManager({
      cwd: '/project/root',
      userDataPath: '/user/data',
      platform: 'darwin',
      arch: 'arm64',
      existsSyncFn: (path) => existing.has(path)
    })

    expect(manager.ensureRuntimeReady('ggml-large-v3-turbo-q5_0')).toEqual({
      binaryPath: '/project/root/resources/whispercpp/bin/macos-arm64/whisper-stream',
      modelPath: '/user/data/whispercpp/models/ggml-large-v3-turbo-q5_0.bin',
      coreMlModelPath: '/user/data/whispercpp/models/ggml-large-v3-turbo-q5_0-encoder.mlmodelc'
    })
  })

  it('rejects unsupported platforms before checking assets', () => {
    const manager = new WhisperCppModelManager({
      platform: 'linux',
      arch: 'x64',
      existsSyncFn: () => true
    })

    expect(() => manager.ensureRuntimeReady('ggml-large-v3-turbo-q5_0')).toThrow(
      'local_whispercpp_coreml requires macOS arm64. Received linux/x64.'
    )
  })
})
