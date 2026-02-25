/*
Where: src/renderer/native-recording.test.ts
What: Unit tests for renderer-native recording command dispatch idle guards.
Why: Ensure stop/cancel commands show clear feedback instead of silent/success paths when no recording is active.
*/

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('handleRecordingCommandDispatch', () => {
  beforeEach(() => {
    resetRecordingState()
    ;(window as Window & { speechToTextApi: any }).speechToTextApi = {
      playSound: vi.fn(),
      getHistory: vi.fn(),
      submitRecordedAudio: vi.fn()
    }
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
})
