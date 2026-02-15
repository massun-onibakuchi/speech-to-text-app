import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { FfmpegRunner } from '../infrastructure/ffmpeg-runner'
import type { AudioInputSource } from '../../shared/ipc'

export interface CaptureResult {
  jobId: string
  audioFilePath: string
  capturedAt: string
}

export class CaptureService {
  private readonly ffmpegRunner = new FfmpegRunner()
  private currentProcess: ChildProcessWithoutNullStreams | null = null
  private currentOutputPath: string | null = null

  listAudioSources(): AudioInputSource[] {
    const systemDefault: AudioInputSource = {
      id: 'system_default',
      label: 'System Default Microphone'
    }

    try {
      const devices = this.ffmpegRunner.listAudioDevices()
      if (devices.length === 0) {
        return [systemDefault]
      }

      return [systemDefault, ...devices.map((device) => ({ id: device.name, label: device.name }))]
    } catch {
      return [systemDefault]
    }
  }

  startRecording(preferredDeviceId?: string): void {
    if (this.currentProcess) {
      throw new Error('Recording already in progress')
    }

    const outputDir = join(app.getPath('userData'), 'captures')
    mkdirSync(outputDir, { recursive: true })

    this.currentOutputPath = join(outputDir, `${Date.now()}-${randomUUID()}.wav`)
    const preferredAudioDeviceName =
      preferredDeviceId && preferredDeviceId !== 'system_default' ? preferredDeviceId : process.env.STT_FFMPEG_AUDIO_DEVICE_NAME
    const preferredAudioDeviceIndex =
      process.env.STT_FFMPEG_AUDIO_DEVICE_INDEX !== undefined
        ? Number(process.env.STT_FFMPEG_AUDIO_DEVICE_INDEX)
        : undefined

    this.currentProcess = this.ffmpegRunner.startCapture({
      outputFilePath: this.currentOutputPath,
      sampleRateHz: 16000,
      channels: 1,
      preferredAudioDeviceName,
      preferredAudioDeviceIndex: Number.isNaN(preferredAudioDeviceIndex) ? undefined : preferredAudioDeviceIndex
    })
  }

  async stopRecording(): Promise<CaptureResult> {
    if (!this.currentProcess || !this.currentOutputPath) {
      throw new Error('No active recording session to stop')
    }

    const proc = this.currentProcess
    const outputPath = this.currentOutputPath

    this.currentProcess = null
    this.currentOutputPath = null

    proc.stdin.write('q')

    await new Promise<void>((resolve, reject) => {
      proc.once('exit', (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}`))
        }
      })
      proc.once('error', reject)
    })

    return {
      jobId: randomUUID(),
      audioFilePath: outputPath,
      capturedAt: new Date().toISOString()
    }
  }

  cancelRecording(): void {
    if (!this.currentProcess) {
      return
    }

    this.currentProcess.kill('SIGTERM')
    this.currentProcess = null
    this.currentOutputPath = null
  }

  isRecording(): boolean {
    return this.currentProcess !== null
  }
}
