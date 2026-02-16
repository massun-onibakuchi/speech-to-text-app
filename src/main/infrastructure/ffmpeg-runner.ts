import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

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
  private readonly ffmpegBinaryPath: string | null

  constructor(runSyncFn?: typeof spawnSync, ffmpegBinaryPath?: string | null) {
    this.runSync = runSyncFn ?? spawnSync
    this.ffmpegBinaryPath = ffmpegBinaryPath ?? process.env.STT_FFMPEG_BIN ?? resolveBundledFfmpegPath()
  }

  private getBinaryPath(): string {
    if (this.ffmpegBinaryPath) {
      return this.ffmpegBinaryPath
    }
    return 'ffmpeg'
  }

  listAudioDevices(): AudioInputDevice[] {
    if (process.platform !== 'darwin') {
      return []
    }

    const result = this.runSync(this.getBinaryPath(), ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
      encoding: 'utf8'
    })

    const stderr = String(result.stderr ?? '')
    const stdout = String(result.stdout ?? '')
    return parseAvfoundationAudioDevices(`${stderr}\n${stdout}`)
  }

  selectAudioDevice(input: Pick<FfmpegStartInput, 'preferredAudioDeviceIndex' | 'preferredAudioDeviceName'>): AudioInputDevice {
    const devices = this.listAudioDevices()
    if (devices.length === 0) {
      return { index: 0, name: 'System Default Microphone' }
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
      this.getBinaryPath(),
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

const resolveBundledFfmpegPath = (): string | null => {
  try {
    const require = createRequire(import.meta.url)
    const resolved = require('ffmpeg-static')
    return typeof resolved === 'string' ? resolved : null
  } catch {
    return null
  }
}
