import { afterEach, describe, expect, it, vi } from 'vitest'
import { FfmpegRunner, parseAvfoundationAudioDevices } from './ffmpeg-runner'

const originalPlatform = process.platform

const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', {
    value,
    configurable: true
  })
}

afterEach(() => {
  setPlatform(originalPlatform)
})

describe('parseAvfoundationAudioDevices', () => {
  it('parses audio devices from ffmpeg stderr output', () => {
    const stderr = `
[AVFoundation indev @ 0x7f] AVFoundation video devices:
[AVFoundation indev @ 0x7f] [0] FaceTime HD Camera
[AVFoundation indev @ 0x7f] AVFoundation audio devices:
[AVFoundation indev @ 0x7f] [0] Built-in Microphone
[AVFoundation indev @ 0x7f] [1] MacBook Pro Microphone
`

    const devices = parseAvfoundationAudioDevices(stderr)
    expect(devices).toEqual([
      { index: 0, name: 'Built-in Microphone' },
      { index: 1, name: 'MacBook Pro Microphone' }
    ])
  })
})

describe('FfmpegRunner device selection', () => {
  it('selects preferred index when available', () => {
    setPlatform('darwin')
    const runSync = vi.fn(() => ({
      stderr:
        '[x] AVFoundation audio devices:\n[x] [0] Built-in Microphone\n[x] [2] USB Mic\n'
    }))

    const runner = new FfmpegRunner(runSync as any)
    const selected = runner.selectAudioDevice({ preferredAudioDeviceIndex: 2 })
    expect(selected).toEqual({ index: 2, name: 'USB Mic' })
  })

  it('falls back to first device when preferred selection is missing', () => {
    setPlatform('darwin')
    const runSync = vi.fn(() => ({
      stderr:
        '[x] AVFoundation audio devices:\n[x] [1] External Mic\n[x] [3] USB Mic\n'
    }))

    const runner = new FfmpegRunner(runSync as any)
    const selected = runner.selectAudioDevice({ preferredAudioDeviceName: 'Non-existent' })
    expect(selected).toEqual({ index: 1, name: 'External Mic' })
  })

  it('throws when no audio devices are discovered', () => {
    setPlatform('darwin')
    const runSync = vi.fn(() => ({ stderr: '[x] AVFoundation audio devices:\n' }))

    const runner = new FfmpegRunner(runSync as any)
    expect(() => runner.selectAudioDevice({})).toThrow('No AVFoundation audio input devices')
  })
})
