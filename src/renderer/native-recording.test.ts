/*
Where: src/renderer/native-recording.test.ts
What: Unit tests for renderer-native recording command dispatch idle guards.
Why: Ensure stop/cancel commands show clear feedback instead of silent/success paths when no recording is active.
*/

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { handleRecordingCommandDispatch, resetRecordingState, type NativeRecordingDeps } from './native-recording'

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
