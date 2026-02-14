import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'

export interface FfmpegStartInput {
  outputFilePath: string
  sampleRateHz: number
  channels: number
  preferredAudioDeviceName?: string
  preferredAudioDeviceIndex?: number
}

export interface AudioInputDevice {
  index: number
  name: string
}

export const parseAvfoundationAudioDevices = (stderr: string): AudioInputDevice[] => {
  const lines = stderr.split('\n')
  const devices: AudioInputDevice[] = []
  let inAudioSection = false

  for (const line of lines) {
    if (line.includes('AVFoundation audio devices')) {
      inAudioSection = true
      continue
    }

    if (line.includes('AVFoundation video devices')) {
      inAudioSection = false
      continue
    }

    if (!inAudioSection) {
      continue
    }

    const match = line.match(/\[(\d+)\]\s+(.+)$/)
    if (!match) {
      continue
    }

    devices.push({
      index: Number(match[1]),
      name: match[2].trim()
    })
  }

  return devices
}

export class FfmpegRunner {
  private readonly runSync: typeof spawnSync

  constructor(runSyncFn?: typeof spawnSync) {
    this.runSync = runSyncFn ?? spawnSync
  }

  listAudioDevices(): AudioInputDevice[] {
    if (process.platform !== 'darwin') {
      return []
    }

    const result = this.runSync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
      encoding: 'utf8'
    })

    const stderr = String(result.stderr ?? '')
    return parseAvfoundationAudioDevices(stderr)
  }

  selectAudioDevice(input: Pick<FfmpegStartInput, 'preferredAudioDeviceIndex' | 'preferredAudioDeviceName'>): AudioInputDevice {
    const devices = this.listAudioDevices()
    if (devices.length === 0) {
      throw new Error('No AVFoundation audio input devices were discovered by ffmpeg.')
    }

    if (typeof input.preferredAudioDeviceIndex === 'number') {
      const byIndex = devices.find((device) => device.index === input.preferredAudioDeviceIndex)
      if (byIndex) {
        return byIndex
      }
    }

    if (input.preferredAudioDeviceName) {
      const byName = devices.find((device) =>
        device.name.toLowerCase().includes(input.preferredAudioDeviceName?.toLowerCase() ?? '')
      )
      if (byName) {
        return byName
      }
    }

    return devices[0]
  }

  startCapture(input: FfmpegStartInput): ChildProcessWithoutNullStreams {
    const selectedAudioDevice = this.selectAudioDevice(input)

    return spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'avfoundation',
        '-i',
        `:${selectedAudioDevice.index}`,
        '-ar',
        String(input.sampleRateHz),
        '-ac',
        String(input.channels),
        '-acodec',
        'pcm_s16le',
        input.outputFilePath
      ],
      { stdio: 'pipe' }
    )
  }
}
