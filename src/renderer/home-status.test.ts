import { describe, expect, it } from 'vitest'
import { resolveHomeCommandStatus } from './home-status'

describe('resolveHomeCommandStatus', () => {
  it('returns Busy when an action is pending', () => {
    expect(
      resolveHomeCommandStatus({
        pendingActionId: 'recording:startRecording',
        isRecording: true,
        hasCommandError: true
      })
    ).toEqual({ label: 'Busy', cssClass: 'is-busy' })
  })

  it('returns Recording when active recording is in progress and no pending action', () => {
    expect(
      resolveHomeCommandStatus({
        pendingActionId: null,
        isRecording: true,
        hasCommandError: false
      })
    ).toEqual({ label: 'Recording', cssClass: 'is-recording' })
  })

  it('returns Error when there is no pending action/recording but latest command failed', () => {
    expect(
      resolveHomeCommandStatus({
        pendingActionId: null,
        isRecording: false,
        hasCommandError: true
      })
    ).toEqual({ label: 'Error', cssClass: 'is-error' })
  })

  it('returns Idle when there is no pending action, recording, or command error', () => {
    expect(
      resolveHomeCommandStatus({
        pendingActionId: null,
        isRecording: false,
        hasCommandError: false
      })
    ).toEqual({ label: 'Idle', cssClass: 'is-idle' })
  })
})
