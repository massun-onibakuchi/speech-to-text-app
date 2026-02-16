import { describe, expect, it } from 'vitest'
import { resolveDetectedAudioSource, resolveRecordingDeviceId } from './recording-device'

describe('resolveRecordingDeviceId', () => {
  it('uses configured id when it is present', () => {
    const id = resolveRecordingDeviceId({
      configuredDeviceId: 'mic-1',
      configuredDetectedAudioSource: 'Desk Mic',
      audioInputSources: [
        { id: 'mic-1', label: 'Desk Mic' },
        { id: 'mic-2', label: 'Headset Mic' }
      ]
    })

    expect(id).toBe('mic-1')
  })

  it('falls back by detected label when configured id no longer exists', () => {
    const id = resolveRecordingDeviceId({
      configuredDeviceId: 'old-id',
      configuredDetectedAudioSource: 'Desk Mic',
      audioInputSources: [
        { id: 'new-id', label: 'Desk Mic' },
        { id: 'mic-2', label: 'Headset Mic' }
      ]
    })

    expect(id).toBe('new-id')
  })

  it('returns undefined for system default', () => {
    const id = resolveRecordingDeviceId({
      configuredDeviceId: 'system_default',
      configuredDetectedAudioSource: 'system_default',
      audioInputSources: [{ id: 'mic-1', label: 'Desk Mic' }]
    })

    expect(id).toBeUndefined()
  })
})

describe('resolveDetectedAudioSource', () => {
  it('stores selected source label when available', () => {
    const label = resolveDetectedAudioSource('mic-1', [
      { id: 'mic-1', label: 'Desk Mic' },
      { id: 'mic-2', label: 'Headset Mic' }
    ])

    expect(label).toBe('Desk Mic')
  })

  it('returns system_default for default selection', () => {
    const label = resolveDetectedAudioSource('system_default', [{ id: 'mic-1', label: 'Desk Mic' }])
    expect(label).toBe('system_default')
  })
})
