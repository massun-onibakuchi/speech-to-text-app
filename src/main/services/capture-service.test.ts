import { describe, expect, it, vi } from 'vitest'
import { CaptureService } from './capture-service'

describe('CaptureService listAudioSources', () => {
  it('returns system default when no devices are available', () => {
    const service = new CaptureService()
    ;(service as any).ffmpegRunner = {
      listAudioDevices: vi.fn(() => [])
    }

    expect(service.listAudioSources()).toEqual([
      { id: 'system_default', label: 'System Default Microphone' }
    ])
  })

  it('returns system default plus discovered devices', () => {
    const service = new CaptureService()
    ;(service as any).ffmpegRunner = {
      listAudioDevices: vi.fn(() => [
        { index: 0, name: 'MacBook Pro Microphone' },
        { index: 1, name: 'External USB Mic' }
      ])
    }

    expect(service.listAudioSources()).toEqual([
      { id: 'system_default', label: 'System Default Microphone' },
      { id: 'MacBook Pro Microphone', label: 'MacBook Pro Microphone' },
      { id: 'External USB Mic', label: 'External USB Mic' }
    ])
  })

  it('returns system default when audio device discovery throws', () => {
    const service = new CaptureService()
    ;(service as any).ffmpegRunner = {
      listAudioDevices: vi.fn(() => {
        throw new Error('ffmpeg unavailable')
      })
    }

    expect(service.listAudioSources()).toEqual([
      { id: 'system_default', label: 'System Default Microphone' }
    ])
  })
})
