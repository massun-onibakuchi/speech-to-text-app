import { describe, expect, it } from 'vitest'
import { resolveDetectedAudioSource, resolveRecordingDeviceFallbackWarning, resolveRecordingDeviceId } from './recording-device'

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

describe('resolveRecordingDeviceFallbackWarning', () => {
  it('returns warning when configured device is non-default and resolution falls back to default', () => {
    const warning = resolveRecordingDeviceFallbackWarning({
      configuredDeviceId: 'stale-device-id',
      resolvedDeviceId: undefined
    })
    expect(warning).toContain('Falling back to System Default')
  })

  it('returns null for default device or when a concrete device resolves', () => {
    expect(
      resolveRecordingDeviceFallbackWarning({
        configuredDeviceId: 'system_default',
        resolvedDeviceId: undefined
      })
    ).toBeNull()
    expect(
      resolveRecordingDeviceFallbackWarning({
        configuredDeviceId: 'mic-1',
        resolvedDeviceId: 'mic-2'
      })
    ).toBeNull()
  })
})
