// Where: src/main/orchestrators/recording-orchestrator.ts
// What:  Handles recording commands and audio file persistence.
// Why:   Responsible for resolving preferred audio device and persisting
//        captured audio to disk. Does NOT enqueue processing — that is
//        handled by CommandRouter via CaptureQueue (Phase 2A).

import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import type { AudioInputSource, RecordingCommand, RecordingCommandDispatch } from '../../shared/ipc'
import type { CaptureResult } from '../services/capture-types'
import { SettingsService } from '../services/settings-service'

interface RecordingDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
  listAudioInputSources: () => Promise<AudioInputSource[]>
}

const execFileAsync = promisify(execFile)
const AUDIO_SOURCE_DISCOVERY_TIMEOUT_MS = 1500
const AUDIO_SOURCE_CACHE_TTL_MS = 30_000

export class RecordingOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>
  private readonly listAudioInputSources: () => Promise<AudioInputSource[]>
  private cachedAudioInputSources: AudioInputSource[] | null = null
  private audioInputSourcesCacheExpiresAt = 0

  constructor(dependencies?: Partial<RecordingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
    this.listAudioInputSources = dependencies?.listAudioInputSources ?? discoverMacosAudioInputSources
  }

  async getAudioInputSources(): Promise<AudioInputSource[]> {
    const systemDefault: AudioInputSource = { id: 'system_default', label: 'System Default Microphone' }
    const now = Date.now()
    const hasLiveCache = this.cachedAudioInputSources !== null && now < this.audioInputSourcesCacheExpiresAt
    if (!hasLiveCache) {
      try {
        this.cachedAudioInputSources = dedupeAudioSources(await this.listAudioInputSources())
        this.audioInputSourcesCacheExpiresAt = now + AUDIO_SOURCE_CACHE_TTL_MS
      } catch {
        // Keep cache empty after a transient failure so the next request can retry.
        this.cachedAudioInputSources = null
        this.audioInputSourcesCacheExpiresAt = 0
      }
    }
    if (this.cachedAudioInputSources === null || this.cachedAudioInputSources.length === 0) {
      return [systemDefault]
    }
    return [systemDefault, ...this.cachedAudioInputSources.filter((source) => source.id !== systemDefault.id)]
  }

  private resolvePreferredDeviceId(): string | undefined {
    const settings = this.settingsService.getSettings()
    const selected = settings.recording.device?.trim()
    if (!selected || selected === 'system_default') {
      return undefined
    }
    return selected
  }

  runCommand(command: RecordingCommand): RecordingCommandDispatch {
    const dispatch: RecordingCommandDispatch = { command }
    if (command === 'startRecording' || command === 'toggleRecording') {
      dispatch.preferredDeviceId = this.resolvePreferredDeviceId()
    }
    return dispatch
  }

  /** Persist captured audio to disk and return a CaptureResult (no enqueue). */
  submitRecordedAudio(payload: { data: Uint8Array; mimeType: string; capturedAt: string }): CaptureResult {
    const outputDir = join(app.getPath('userData'), 'captures')
    mkdirSync(outputDir, { recursive: true })

    const extension = this.resolveAudioExtension(payload.mimeType)
    const outputPath = join(outputDir, `${Date.now()}-${randomUUID()}.${extension}`)

    writeFileSync(outputPath, Buffer.from(payload.data))

    return {
      jobId: randomUUID(),
      audioFilePath: outputPath,
      capturedAt: payload.capturedAt
    }
  }

  private resolveAudioExtension(mimeType: string): string {
    const normalized = mimeType.trim().toLowerCase()
    if (normalized.includes('wav')) {
      return 'wav'
    }
    if (normalized.includes('ogg')) {
      return 'ogg'
    }
    if (normalized.includes('mp4') || normalized.includes('m4a')) {
      return 'm4a'
    }
    if (normalized.includes('mpeg') || normalized.includes('mp3')) {
      return 'mp3'
    }
    if (normalized.includes('webm')) {
      return 'webm'
    }

    const fallback = extname(normalized).replace('.', '')
    return fallback.length > 0 ? fallback : 'webm'
  }
}

const dedupeAudioSources = (sources: AudioInputSource[]): AudioInputSource[] => {
  const unique = new Map<string, AudioInputSource>()
  for (const source of sources) {
    const id = source.id.trim()
    const label = source.label.trim()
    if (id.length === 0 || label.length === 0) {
      continue
    }
    if (!unique.has(id)) {
      unique.set(id, { id, label })
    }
  }
  return [...unique.values()]
}

const discoverMacosAudioInputSources = async (): Promise<AudioInputSource[]> => {
  if (process.platform !== 'darwin') {
    return []
  }

  try {
    const { stdout } = await execFileAsync('/usr/sbin/system_profiler', ['SPAudioDataType', '-json'], {
      encoding: 'utf8',
      timeout: AUDIO_SOURCE_DISCOVERY_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    })
    const parsed = JSON.parse(stdout) as unknown
    const discovered: AudioInputSource[] = []
    collectMacosInputSources(parsed, discovered)
    return dedupeAudioSources(discovered)
  } catch {
    return []
  }
}

const collectMacosInputSources = (value: unknown, out: AudioInputSource[]): void => {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMacosInputSources(item, out)
    }
    return
  }

  if (!value || typeof value !== 'object') {
    return
  }

  const node = value as Record<string, unknown>
  const inputFlag = node.coreaudio_device_input
  const isInputDevice = inputFlag === 'spaudio_yes' || inputFlag === true
  if (isInputDevice) {
    const label = typeof node._name === 'string' ? node._name.trim() : ''
    if (label.length > 0) {
      const id =
        typeof node._uid === 'string' && node._uid.trim().length > 0
          ? node._uid.trim()
          : label
      out.push({ id, label })
    }
  }

  for (const child of Object.values(node)) {
    collectMacosInputSources(child, out)
  }
}
