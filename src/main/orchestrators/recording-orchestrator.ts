// Where: src/main/orchestrators/recording-orchestrator.ts
// What:  Handles recording commands and audio file persistence.
// Why:   Responsible for resolving preferred audio device and persisting
//        captured audio to disk. Does NOT enqueue processing — that is
//        handled by CommandRouter via CaptureQueue (Phase 2A).

import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { app } from 'electron'
import type { AudioInputSource, RecordingCommand, RecordingCommandDispatch } from '../../shared/ipc'
import type { CaptureResult } from '../services/capture-types'
import { SettingsService } from '../services/settings-service'

interface RecordingDependencies {
  settingsService: Pick<SettingsService, 'getSettings'>
}

export class RecordingOrchestrator {
  private readonly settingsService: Pick<SettingsService, 'getSettings'>

  constructor(dependencies?: Partial<RecordingDependencies>) {
    this.settingsService = dependencies?.settingsService ?? new SettingsService()
  }

  getAudioInputSources(): AudioInputSource[] {
    return [{ id: 'system_default', label: 'System Default Microphone' }]
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
