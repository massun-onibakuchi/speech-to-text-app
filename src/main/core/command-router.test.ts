/**
 * Where: src/main/core/command-router.test.ts
 * What:  Tests for CommandRouter — mode-aware routing, snapshot building, queue dispatch.
 * Why:   Verify that CommandRouter validates mode, builds frozen snapshots from current
 *        settings at enqueue time, and dispatches to CaptureQueue / TransformQueue.
 */

import { describe, it, expect, vi } from 'vitest'
import { CommandRouter, type CommandRouterDependencies } from './command-router'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { CaptureResult } from '../services/capture-types'
import type { CaptureRequestSnapshot } from '../routing/capture-request-snapshot'
import type { TransformationRequestSnapshot } from '../routing/transformation-request-snapshot'

const makeSettings = (overrides?: Partial<Settings>): Settings => ({
  ...structuredClone(DEFAULT_SETTINGS),
  ...overrides
})

/** Builds a minimal set of CommandRouter dependencies with mock implementations. */
function makeDeps(overrides?: Partial<CommandRouterDependencies>): CommandRouterDependencies {
  return {
    settingsService: overrides?.settingsService ?? { getSettings: () => makeSettings() },
    recordingOrchestrator: overrides?.recordingOrchestrator ?? {
      runCommand: vi.fn().mockReturnValue({ command: 'startRecording' }),
      submitRecordedAudio: vi.fn().mockReturnValue({
        jobId: 'job-1',
        audioFilePath: '/tmp/test.webm',
        capturedAt: '2026-02-17T00:00:00Z'
      } satisfies CaptureResult),
      getAudioInputSources: vi.fn().mockReturnValue([{ id: 'system_default', label: 'Default' }])
    },
    captureQueue: overrides?.captureQueue ?? { enqueue: vi.fn() },
    transformQueue: overrides?.transformQueue ?? { enqueue: vi.fn() },
    clipboardClient: overrides?.clipboardClient ?? { readText: vi.fn().mockReturnValue('clipboard text') }
  }
}

describe('CommandRouter', () => {
  // --- Recording command delegation ---

  it('delegates runRecordingCommand to recording orchestrator', () => {
    const deps = makeDeps()
    const router = new CommandRouter(deps)

    const dispatch = router.runRecordingCommand('startRecording')

    expect(deps.recordingOrchestrator.runCommand).toHaveBeenCalledWith('startRecording')
    expect(dispatch.command).toBe('startRecording')
  })

  it('validates mode on recording commands (default mode succeeds)', () => {
    const deps = makeDeps()
    const router = new CommandRouter(deps)

    // LegacyProcessingModeSource always returns 'default' — should not throw
    expect(() => router.runRecordingCommand('toggleRecording')).not.toThrow()
    expect(() => router.runRecordingCommand('stopRecording')).not.toThrow()
  })

  it('delegates getAudioInputSources to recording orchestrator', () => {
    const deps = makeDeps()
    const router = new CommandRouter(deps)

    const sources = router.getAudioInputSources()

    expect(sources).toEqual([{ id: 'system_default', label: 'Default' }])
    expect(deps.recordingOrchestrator.getAudioInputSources).toHaveBeenCalledOnce()
  })

  // --- submitRecordedAudio: persist + snapshot + enqueue ---

  it('submitRecordedAudio persists audio and enqueues CaptureRequestSnapshot', () => {
    const captureQueue = { enqueue: vi.fn() }
    const deps = makeDeps({ captureQueue })
    const router = new CommandRouter(deps)

    const payload = { data: new Uint8Array([1, 2, 3]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' }
    const result = router.submitRecordedAudio(payload)

    // Audio persistence delegated to RecordingOrchestrator
    expect(deps.recordingOrchestrator.submitRecordedAudio).toHaveBeenCalledWith(payload)
    expect(result.jobId).toBe('job-1')

    // Snapshot enqueued to CaptureQueue
    expect(captureQueue.enqueue).toHaveBeenCalledOnce()
    const snapshot = captureQueue.enqueue.mock.calls[0][0] as CaptureRequestSnapshot
    expect(snapshot.snapshotId).toBe('job-1')
    expect(snapshot.audioFilePath).toBe('/tmp/test.webm')
    expect(snapshot.sttProvider).toBe('groq')
    expect(snapshot.sttModel).toBe('whisper-large-v3-turbo')
    expect(snapshot.sttBaseUrlOverride).toBeNull()
  })

  it('submitRecordedAudio binds transformation profile from settings when enabled', () => {
    const captureQueue = { enqueue: vi.fn() }
    const settings = makeSettings()
    // Default settings have transformation.enabled = true and a default preset
    const deps = makeDeps({
      captureQueue,
      settingsService: { getSettings: () => settings }
    })
    const router = new CommandRouter(deps)

    router.submitRecordedAudio({ data: new Uint8Array([1]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' })

    const snapshot = captureQueue.enqueue.mock.calls[0][0] as CaptureRequestSnapshot
    expect(snapshot.transformationProfile).not.toBeNull()
    expect(snapshot.transformationProfile!.profileId).toBe('default')
    expect(snapshot.transformationProfile!.provider).toBe('google')
  })

  it('submitRecordedAudio sets transformationProfile to null when transformation is disabled', () => {
    const captureQueue = { enqueue: vi.fn() }
    const settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        enabled: false
      }
    })
    const deps = makeDeps({
      captureQueue,
      settingsService: { getSettings: () => settings }
    })
    const router = new CommandRouter(deps)

    router.submitRecordedAudio({ data: new Uint8Array([1]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' })

    const snapshot = captureQueue.enqueue.mock.calls[0][0] as CaptureRequestSnapshot
    expect(snapshot.transformationProfile).toBeNull()
  })

  // --- runCompositeFromClipboard: snapshot + enqueue ---

  it('runCompositeFromClipboard enqueues TransformationRequestSnapshot', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const deps = makeDeps({
      transformQueue,
      clipboardClient: { readText: vi.fn().mockReturnValue('hello from clipboard') }
    })
    const router = new CommandRouter(deps)

    const result = await router.runCompositeFromClipboard()

    expect(result.status).toBe('ok')
    expect(result.message).toBe('Transformation enqueued.')
    expect(transformQueue.enqueue).toHaveBeenCalledOnce()

    const snapshot = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    expect(snapshot.sourceText).toBe('hello from clipboard')
    expect(snapshot.textSource).toBe('clipboard')
    expect(snapshot.profileId).toBe('default')
    expect(snapshot.provider).toBe('google')
    expect(snapshot.baseUrlOverride).toBeNull()
  })

  it('binds STT and LLM baseUrlOverride values into snapshots', async () => {
    const captureQueue = { enqueue: vi.fn() }
    const transformQueue = { enqueue: vi.fn() }
    const settings = makeSettings({
      transcription: {
        ...DEFAULT_SETTINGS.transcription,
        baseUrlOverride: 'https://stt-proxy.local'
      },
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        baseUrlOverride: 'https://llm-proxy.local'
      }
    })
    const deps = makeDeps({
      captureQueue,
      transformQueue,
      settingsService: { getSettings: () => settings },
      clipboardClient: { readText: vi.fn().mockReturnValue('override text') }
    })
    const router = new CommandRouter(deps)

    router.submitRecordedAudio({ data: new Uint8Array([1]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' })
    await router.runCompositeFromClipboard()

    const captureSnapshot = captureQueue.enqueue.mock.calls[0][0] as CaptureRequestSnapshot
    const transformSnapshot = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    expect(captureSnapshot.sttBaseUrlOverride).toBe('https://stt-proxy.local')
    expect(captureSnapshot.transformationProfile?.baseUrlOverride).toBe('https://llm-proxy.local')
    expect(transformSnapshot.baseUrlOverride).toBe('https://llm-proxy.local')
  })

  it('runCompositeFromClipboard returns error when transformation is disabled', async () => {
    const settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        enabled: false
      }
    })
    const transformQueue = { enqueue: vi.fn() }
    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings }
    })
    const router = new CommandRouter(deps)

    const result = await router.runCompositeFromClipboard()

    expect(result.status).toBe('error')
    expect(result.message).toContain('disabled')
    expect(transformQueue.enqueue).not.toHaveBeenCalled()
  })

  it('runCompositeFromClipboard returns error when clipboard is empty', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const deps = makeDeps({
      transformQueue,
      clipboardClient: { readText: vi.fn().mockReturnValue('') }
    })
    const router = new CommandRouter(deps)

    const result = await router.runCompositeFromClipboard()

    expect(result.status).toBe('error')
    expect(result.message).toContain('empty')
    expect(transformQueue.enqueue).not.toHaveBeenCalled()
  })

  it('runCompositeFromClipboard sends full clipboard text (trimmed)', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const deps = makeDeps({
      transformQueue,
      clipboardClient: { readText: vi.fn().mockReturnValue('\n  actual text here\nmore text\n') }
    })
    const router = new CommandRouter(deps)

    await router.runCompositeFromClipboard()

    const snapshot = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    expect(snapshot.sourceText).toBe('actual text here\nmore text')
  })

  it('binds per-request transform snapshots so later settings changes affect only subsequent requests', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const settings = makeSettings()
    const initialModel = settings.transformation.presets[0].model
    const initialOutputRule = { ...settings.output.transformed }
    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings },
      clipboardClient: { readText: vi.fn().mockReturnValue('hello') }
    })
    const router = new CommandRouter(deps)

    await router.runCompositeFromClipboard()
    const first = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot

    const updatedModel = 'gemini-2.5-flash'
    settings.transformation.presets[0].model = updatedModel
    settings.output.transformed.copyToClipboard = false
    settings.output.transformed.pasteAtCursor = true

    await router.runCompositeFromClipboard()
    const second = transformQueue.enqueue.mock.calls[1][0] as TransformationRequestSnapshot

    expect(first.profileId).toBe('default')
    expect(first.model).toBe(initialModel)
    expect(first.outputRule).toEqual(initialOutputRule)

    expect(second.profileId).toBe('default')
    expect(second.model).toBe(updatedModel)
    expect(second.outputRule).toEqual({ copyToClipboard: false, pasteAtCursor: true })
  })

  it('keeps an already-enqueued capture snapshot isolated from later settings mutation', () => {
    const captureQueue = { enqueue: vi.fn() }
    const settings = makeSettings()
    const initialProvider = settings.transcription.provider
    const initialModel = settings.transcription.model
    const initialTranscriptOutputRule = { ...settings.output.transcript }
    const deps = makeDeps({
      captureQueue,
      settingsService: { getSettings: () => settings }
    })
    const router = new CommandRouter(deps)

    router.submitRecordedAudio({ data: new Uint8Array([1]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:00:00Z' })
    const first = captureQueue.enqueue.mock.calls[0][0] as CaptureRequestSnapshot

    settings.transcription.provider = initialProvider === 'groq' ? 'elevenlabs' : 'groq'
    settings.transcription.model = settings.transcription.provider === 'groq' ? 'whisper-large-v3-turbo' : 'scribe_v2'
    settings.output.transcript.copyToClipboard = false

    router.submitRecordedAudio({ data: new Uint8Array([2]), mimeType: 'audio/webm', capturedAt: '2026-02-17T00:01:00Z' })
    const second = captureQueue.enqueue.mock.calls[1][0] as CaptureRequestSnapshot

    expect(first.sttProvider).toBe(initialProvider)
    expect(first.sttModel).toBe(initialModel)
    expect(first.output.transcript).toEqual(initialTranscriptOutputRule)

    expect(second.sttProvider).toBe(settings.transcription.provider)
    expect(second.sttModel).toBe(settings.transcription.model)
    expect(second.output.transcript.copyToClipboard).toBe(false)
  })

  it('runDefaultCompositeFromClipboard uses default preset id', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        activePresetId: 'active-id',
        defaultPresetId: 'default-id',
        presets: [
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'active-id', name: 'Active' },
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'default-id', name: 'Default' }
        ]
      }
    })
    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings },
      clipboardClient: { readText: vi.fn().mockReturnValue('clipboard text') }
    })
    const router = new CommandRouter(deps)

    const result = await router.runDefaultCompositeFromClipboard()

    expect(result.status).toBe('ok')
    const snapshot = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    expect(snapshot.profileId).toBe('default-id')
  })

  it('runCompositeFromSelection enqueues selection snapshot with active preset', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        activePresetId: 'active-id',
        presets: [
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'active-id', name: 'Active' },
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'other-id', name: 'Other' }
        ]
      }
    })
    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings }
    })
    const router = new CommandRouter(deps)

    const result = await router.runCompositeFromSelection(' selected text ')

    expect(result.status).toBe('ok')
    const snapshot = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    expect(snapshot.textSource).toBe('selection')
    expect(snapshot.profileId).toBe('active-id')
    expect(snapshot.sourceText).toBe('selected text')
  })

  it('runCompositeFromSelection returns actionable error for empty selection', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const deps = makeDeps({ transformQueue })
    const router = new CommandRouter(deps)

    const result = await router.runCompositeFromSelection('   ')

    expect(result.status).toBe('error')
    expect(result.message).toContain('No text selected')
    expect(transformQueue.enqueue).not.toHaveBeenCalled()
  })

  it('binds active-profile snapshot per request when active preset changes between enqueues', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const settings: Settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        activePresetId: 'a',
        presets: [
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'a', name: 'A', model: 'gemini-2.5-flash' },
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'b', name: 'B', model: 'gemini-2.5-flash' }
        ]
      }
    })

    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings },
      clipboardClient: { readText: vi.fn().mockReturnValue('text') }
    })
    const router = new CommandRouter(deps)

    await router.runCompositeFromClipboard()
    settings.transformation.activePresetId = 'b'
    await router.runCompositeFromClipboard()

    const first = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    const second = transformQueue.enqueue.mock.calls[1][0] as TransformationRequestSnapshot
    expect(first.profileId).toBe('a')
    expect(first.model).toBe('gemini-2.5-flash')
    expect(second.profileId).toBe('b')
    expect(second.model).toBe('gemini-2.5-flash')
  })

  it('binds default-profile snapshot per request when default preset changes between enqueues', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const settings: Settings = makeSettings({
      transformation: {
        ...DEFAULT_SETTINGS.transformation,
        defaultPresetId: 'a',
        presets: [
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'a', name: 'A' },
          { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'b', name: 'B' }
        ]
      }
    })

    const deps = makeDeps({
      transformQueue,
      settingsService: { getSettings: () => settings },
      clipboardClient: { readText: vi.fn().mockReturnValue('text') }
    })
    const router = new CommandRouter(deps)

    await router.runDefaultCompositeFromClipboard()
    settings.transformation.defaultPresetId = 'b'
    await router.runDefaultCompositeFromClipboard()

    const first = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    const second = transformQueue.enqueue.mock.calls[1][0] as TransformationRequestSnapshot
    expect(first.profileId).toBe('a')
    expect(second.profileId).toBe('b')
  })

  it('binds source-text snapshot per request when clipboard content changes quickly', async () => {
    const transformQueue = { enqueue: vi.fn() }
    const clipboardClient = {
      readText: vi
        .fn()
        .mockReturnValueOnce('first clipboard')
        .mockReturnValueOnce('second clipboard')
    }
    const deps = makeDeps({
      transformQueue,
      clipboardClient
    })
    const router = new CommandRouter(deps)

    await router.runCompositeFromClipboard()
    await router.runCompositeFromClipboard()

    const first = transformQueue.enqueue.mock.calls[0][0] as TransformationRequestSnapshot
    const second = transformQueue.enqueue.mock.calls[1][0] as TransformationRequestSnapshot
    expect(first.sourceText).toBe('first clipboard')
    expect(second.sourceText).toBe('second clipboard')
  })
})
