/**
 * Where: src/main/services/streaming/whispercpp-model-manager.ts
 * What:  Resolves packaged whisper.cpp binary/model paths and validates assets.
 * Why:   PR-6 needs actionable missing-asset failures before a local streaming
 *        adapter can be treated as a real runtime option on macOS Apple Silicon.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export interface WhisperCppRuntimePaths {
  binaryPath: string
  modelPath: string
  coreMlModelPath: string
}

export interface WhisperCppModelManagerOptions {
  isPackaged?: boolean
  cwd?: string
  resourcesPath?: string
  userDataPath?: string
  platform?: NodeJS.Platform
  arch?: string
  existsSyncFn?: (path: string) => boolean
}

const DEFAULT_BINARY_NAME = 'whisper-stream'
const DEFAULT_BINARY_SUBDIR = ['whispercpp', 'bin', 'macos-arm64']
const DEFAULT_MODEL_SUBDIR = ['whispercpp', 'models']

export class WhisperCppModelManager {
  private readonly isPackaged: boolean
  private readonly cwd: string
  private readonly resourcesPath: string
  private readonly userDataPath: string
  private readonly platform: NodeJS.Platform
  private readonly arch: string
  private readonly existsSyncFn: (path: string) => boolean

  constructor(options: WhisperCppModelManagerOptions = {}) {
    this.isPackaged = options.isPackaged ?? false
    this.cwd = options.cwd ?? process.cwd()
    this.resourcesPath = options.resourcesPath ?? process.resourcesPath ?? join(this.cwd, 'resources')
    this.userDataPath = options.userDataPath ?? join(this.cwd, '.tmp-user-data')
    this.platform = options.platform ?? process.platform
    this.arch = options.arch ?? process.arch
    this.existsSyncFn = options.existsSyncFn ?? existsSync
  }

  resolveRuntimePaths(modelName: string): WhisperCppRuntimePaths {
    const resourcesRoot = this.isPackaged ? this.resourcesPath : this.cwd
    const binaryRoot = this.isPackaged
      ? join(resourcesRoot, ...DEFAULT_BINARY_SUBDIR)
      : join(resourcesRoot, 'resources', ...DEFAULT_BINARY_SUBDIR)
    const binaryPath = join(binaryRoot, DEFAULT_BINARY_NAME)

    const modelRoot = join(this.userDataPath, ...DEFAULT_MODEL_SUBDIR)
    const modelPath = join(modelRoot, `${modelName}.bin`)
    const coreMlModelPath = join(modelRoot, `${modelName}-encoder.mlmodelc`)

    return {
      binaryPath,
      modelPath,
      coreMlModelPath
    }
  }

  ensureRuntimeReady(modelName: string): WhisperCppRuntimePaths {
    if (this.platform !== 'darwin' || this.arch !== 'arm64') {
      throw new Error(
        `local_whispercpp_coreml requires macOS arm64. Received ${this.platform}/${this.arch}.`
      )
    }

    const runtime = this.resolveRuntimePaths(modelName)

    if (!this.existsSyncFn(runtime.binaryPath)) {
      throw new Error(
        `Missing whisper.cpp runtime binary at ${runtime.binaryPath}. ` +
        'Install or package the macOS arm64 whisper-stream binary before starting local streaming.'
      )
    }

    if (!this.existsSyncFn(runtime.modelPath)) {
      throw new Error(
        `Missing whisper.cpp model file at ${runtime.modelPath}. ` +
        'Install the ggml model into the app data whispercpp/models directory before starting local streaming.'
      )
    }

    if (!this.existsSyncFn(runtime.coreMlModelPath)) {
      throw new Error(
        `Missing whisper.cpp Core ML encoder directory at ${runtime.coreMlModelPath}. ` +
        'Generate or install the matching *-encoder.mlmodelc sidecar next to the ggml model before starting local streaming.'
      )
    }

    return runtime
  }
}
