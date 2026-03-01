/*
Where: src/renderer/native-recording.test.ts
What: Unit tests for renderer-native recording command dispatch idle guards.
Why: Ensure stop/cancel commands show clear feedback instead of silent/success paths when no recording is active.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import {
  handleRecordingCommandDispatch,
  pollRecordingOutcome,
  resetRecordingState,
  resolveSuccessfulRecordingMessage,
  type NativeRecordingDeps
} from './native-recording'

const createDeps = (): { deps: NativeRecordingDeps; state: NativeRecordingDeps['state'] } => {
  const state: NativeRecordingDeps['state'] = {
    settings: structuredClone(DEFAULT_SETTINGS),
    apiKeyStatus: { groq: true, elevenlabs: true, google: true },
    audioInputSources: [],
    audioSourceHint: '',
    hasCommandError: true,
    pendingActionId: 'recording:stopRecording'
  }

  const deps: NativeRecordingDeps = {
    state,
    addActivity: vi.fn(),
    addTerminalActivity: vi.fn(),
    addToast: vi.fn(),
    logError: vi.fn(),
    onStateChange: vi.fn()
  }

  return { deps, state }
}

class FakeMediaRecorder {
  static isTypeSupported = vi.fn(() => false)
  mimeType = 'audio/webm'
  private readonly listeners = new Map<string, Array<(event?: any) => void>>()

  addEventListener(event: string, listener: (event?: any) => void): void {
    const existing = this.listeners.get(event) ?? []
    existing.push(listener)
    this.listeners.set(event, existing)
  }

  start(): void {
    // No-op for start-path tests.
  }

  stop(): void {
    for (const listener of this.listeners.get('stop') ?? []) {
      listener()
    }
  }
}

describe('handleRecordingCommandDispatch', () => {
  beforeEach(() => {
    resetRecordingState()
    vi.clearAllMocks()
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      playSound: vi.fn(),
      getHistory: vi.fn(),
      submitRecordedAudio: vi.fn()
    }
    Object.defineProperty(globalThis, 'MediaRecorder', {
      value: FakeMediaRecorder,
      configurable: true
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => []
        }))
      },
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['stopRecording', 'cancelRecording'] as const)(
    'shows an idle message and keeps state unchanged for %s when no recording is active',
    async (command) => {
      const { deps, state } = createDeps()
      const beforeState = structuredClone(state)

      await handleRecordingCommandDispatch(deps, { command })

      expect(deps.addActivity).toHaveBeenCalledWith('Recording is not in progress.', 'info')
      expect(deps.addToast).toHaveBeenCalledWith('Recording is not in progress.', 'info')
      expect(deps.onStateChange).not.toHaveBeenCalled()
      expect(deps.logError).not.toHaveBeenCalled()
      expect(state).toEqual(beforeState)
      expect(window.speechToTextApi.playSound).not.toHaveBeenCalled()
    }
  )

  it('plays the start recording sound even when the app document is not focused (background hotkey)', async () => {
    const { deps, state } = createDeps()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    await handleRecordingCommandDispatch(deps, { command: 'startRecording' })

    expect(window.speechToTextApi.playSound).toHaveBeenCalledWith('recording_started')
    expect(deps.addActivity).toHaveBeenCalledWith('Recording started.', 'success')
    expect(deps.addToast).toHaveBeenCalledWith('Recording started.', 'success')
    expect(deps.onStateChange).toHaveBeenCalledOnce()
    expect(state.hasCommandError).toBe(false)
  })
})

describe('resolveSuccessfulRecordingMessage', () => {
  const baseRecord = {
    jobId: 'job-1',
    capturedAt: '2026-02-28T10:00:00.000Z',
    transcriptText: 'raw transcript text',
    transformedText: 'final transformed text',
    terminalStatus: 'succeeded' as const,
    failureDetail: null,
    failureCategory: null,
    createdAt: '2026-02-28T10:00:01.000Z'
  }

  it('returns transformed text when transformed source is selected', () => {
    expect(resolveSuccessfulRecordingMessage(baseRecord, 'transformed')).toBe('final transformed text')
  })

  it('returns transcript text when transcript source is selected', () => {
    expect(resolveSuccessfulRecordingMessage(baseRecord, 'transcript')).toBe('raw transcript text')
  })

  it('falls back to transcript when transformed source is selected but transformed text is unavailable', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transformedText: null
        },
        'transformed'
      )
    ).toBe('raw transcript text')
  })

  it('falls back to transformed text when transcript source is selected but transcript is unavailable', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transcriptText: null
        },
        'transcript'
      )
    ).toBe('final transformed text')
  })

  it('returns the default completion message when neither transcript nor transformed text is available', () => {
    expect(
      resolveSuccessfulRecordingMessage(
        {
          ...baseRecord,
          transcriptText: null,
          transformedText: null
        },
        'transformed'
      )
    ).toBe('Transcription complete.')
  })
})

describe('pollRecordingOutcome', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('appends transformed terminal activity when transformed source is selected', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi.fn(async () => [
      {
        jobId: 'job-1',
        capturedAt: '2026-02-28T10:00:00.000Z',
        transcriptText: 'raw transcript text',
        transformedText: 'final transformed text',
        terminalStatus: 'succeeded',
        failureDetail: null,
        failureCategory: null,
        createdAt: '2026-02-28T10:00:01.000Z'
      }
    ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z')

    expect(deps.addTerminalActivity).toHaveBeenCalledWith('final transformed text', 'success')
    expect(deps.addToast).toHaveBeenCalledWith('Transcription complete.', 'success')
  })

  it('falls back to transcript terminal activity when transformed text is absent', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi.fn(async () => [
      {
        jobId: 'job-1',
        capturedAt: '2026-02-28T10:00:00.000Z',
        transcriptText: 'raw transcript text',
        transformedText: null,
        terminalStatus: 'succeeded',
        failureDetail: null,
        failureCategory: null,
        createdAt: '2026-02-28T10:00:01.000Z'
      }
    ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z')

    expect(deps.addTerminalActivity).toHaveBeenCalledWith('raw transcript text', 'success')
  })

  it('continues polling after initial timeout and appends late transformed terminal activity', async () => {
    const { deps, state } = createDeps()
    state.settings = structuredClone(DEFAULT_SETTINGS)
    state.settings.output.selectedTextSource = 'transformed'

    window.speechToTextApi.getHistory = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          jobId: 'job-1',
          capturedAt: '2026-02-28T10:00:00.000Z',
          transcriptText: 'raw transcript text',
          transformedText: 'final transformed text',
          terminalStatus: 'succeeded',
          failureDetail: null,
          failureCategory: null,
          createdAt: '2026-02-28T10:00:01.000Z'
        }
      ])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 2, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addActivity).toHaveBeenCalledWith('Recording submitted. Terminal result has not appeared yet.', 'info')
    expect(deps.addTerminalActivity).toHaveBeenCalledWith('final transformed text', 'success')
    expect(deps.addTerminalActivity).toHaveBeenCalledTimes(1)
    expect(deps.addActivity).toHaveBeenCalledTimes(1)
    expect(window.speechToTextApi.getHistory).toHaveBeenCalledTimes(3)
  })

  it('shows one info notice and no terminal activity when no terminal record appears in either poll phase', async () => {
    const { deps } = createDeps()
    window.speechToTextApi.getHistory = vi.fn().mockResolvedValue([])

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 2, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addActivity).toHaveBeenCalledWith('Recording submitted. Terminal result has not appeared yet.', 'info')
    expect(deps.addActivity).toHaveBeenCalledTimes(1)
    expect(deps.addTerminalActivity).not.toHaveBeenCalled()
    expect(window.speechToTextApi.getHistory).toHaveBeenCalledTimes(4)
  })

  it('reports history refresh error during follow-up polling and does not append terminal activity', async () => {
    const { deps } = createDeps()
    window.speechToTextApi.getHistory = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('network down'))

    await pollRecordingOutcome(deps, '2026-02-28T10:00:00.000Z', {
      initialPhase: { attempts: 1, delayMs: 0 },
      followUpPhase: { attempts: 2, delayMs: 0 }
    })

    expect(deps.addActivity).toHaveBeenCalledWith('Recording submitted. Terminal result has not appeared yet.', 'info')
    expect(deps.addActivity).toHaveBeenCalledWith('History refresh failed: network down', 'error')
    expect(deps.addTerminalActivity).not.toHaveBeenCalled()
  })
})
