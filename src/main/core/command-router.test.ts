/**
 * Where: src/main/core/command-router.test.ts
 * What:  Tests for CommandRouter — IPC-facing mode-aware command routing.
 * Why:   Verify that CommandRouter validates mode via Phase 0 ModeRouter and
 *        correctly delegates to existing orchestrators.
 */

import { describe, it, expect, vi } from 'vitest'
import { CommandRouter } from './command-router'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { CompositeTransformResult, RecordingCommandDispatch } from '../../shared/ipc'
import type { CaptureResult } from '../services/capture-types'

const makeSettings = (): Settings => structuredClone(DEFAULT_SETTINGS)

const makeFakeRecordingOrchestrator = () => ({
  runCommand: vi.fn<[string], RecordingCommandDispatch>().mockReturnValue({ command: 'startRecording' }),
  submitRecordedAudio: vi.fn().mockReturnValue({
    jobId: 'job-1',
    audioFilePath: '/tmp/test.webm',
    capturedAt: '2026-02-17T00:00:00Z'
  } satisfies CaptureResult),
  getAudioInputSources: vi.fn().mockReturnValue([{ id: 'system_default', label: 'Default' }])
})

const makeFakeTransformationOrchestrator = () => ({
  runCompositeFromClipboard: vi.fn<[], Promise<CompositeTransformResult>>().mockResolvedValue({
    status: 'ok',
    message: 'transformed text'
  })
})

describe('CommandRouter', () => {
  it('delegates runRecordingCommand to recording orchestrator', () => {
    const settingsService = { getSettings: () => makeSettings() }
    const recording = makeFakeRecordingOrchestrator()
    const transformation = makeFakeTransformationOrchestrator()

    const router = new CommandRouter({
      settingsService,
      recordingOrchestrator: recording,
      transformationOrchestrator: transformation
    })

    const dispatch = router.runRecordingCommand('startRecording')

    expect(recording.runCommand).toHaveBeenCalledWith('startRecording')
    expect(dispatch.command).toBe('startRecording')
  })

  it('delegates submitRecordedAudio to recording orchestrator', () => {
    const settingsService = { getSettings: () => makeSettings() }
    const recording = makeFakeRecordingOrchestrator()
    const transformation = makeFakeTransformationOrchestrator()

    const router = new CommandRouter({
      settingsService,
      recordingOrchestrator: recording,
      transformationOrchestrator: transformation
    })

    const payload = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' }
    const result = router.submitRecordedAudio(payload)

    expect(recording.submitRecordedAudio).toHaveBeenCalledWith(payload)
    expect(result.jobId).toBe('job-1')
  })

  it('delegates getAudioInputSources to recording orchestrator', () => {
    const settingsService = { getSettings: () => makeSettings() }
    const recording = makeFakeRecordingOrchestrator()
    const transformation = makeFakeTransformationOrchestrator()

    const router = new CommandRouter({
      settingsService,
      recordingOrchestrator: recording,
      transformationOrchestrator: transformation
    })

    const sources = router.getAudioInputSources()

    expect(sources).toEqual([{ id: 'system_default', label: 'Default' }])
    expect(recording.getAudioInputSources).toHaveBeenCalledOnce()
  })

  it('delegates runCompositeFromClipboard to transformation orchestrator', async () => {
    const settingsService = { getSettings: () => makeSettings() }
    const recording = makeFakeRecordingOrchestrator()
    const transformation = makeFakeTransformationOrchestrator()

    const router = new CommandRouter({
      settingsService,
      recordingOrchestrator: recording,
      transformationOrchestrator: transformation
    })

    const result = await router.runCompositeFromClipboard()

    expect(transformation.runCompositeFromClipboard).toHaveBeenCalledOnce()
    expect(result).toEqual({ status: 'ok', message: 'transformed text' })
  })

  it('validates mode on recording commands (default mode succeeds)', () => {
    const settingsService = { getSettings: () => makeSettings() }
    const recording = makeFakeRecordingOrchestrator()
    const transformation = makeFakeTransformationOrchestrator()

    const router = new CommandRouter({
      settingsService,
      recordingOrchestrator: recording,
      transformationOrchestrator: transformation
    })

    // Should not throw — LegacyProcessingModeSource always returns 'default'
    expect(() => router.runRecordingCommand('toggleRecording')).not.toThrow()
    expect(() => router.runRecordingCommand('stopRecording')).not.toThrow()
  })
})
