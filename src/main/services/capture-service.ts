import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, systemPreferences } from 'electron'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { FfmpegRunner } from '../infrastructure/ffmpeg-runner'
import type { AudioInputSource } from '../../shared/ipc'

export interface CaptureResult {
  jobId: string
  audioFilePath: string
  capturedAt: string
}

interface CaptureServiceDependencies {
  ffmpegRunner?: Pick<FfmpegRunner, 'listAudioDevices' | 'startCapture'>
}

export class CaptureService {
  private readonly ffmpegRunner: Pick<FfmpegRunner, 'listAudioDevices' | 'startCapture'>
  private currentProcess: ChildProcessWithoutNullStreams | null = null
  private currentOutputPath: string | null = null

  constructor(dependencies?: CaptureServiceDependencies) {
    this.ffmpegRunner = dependencies?.ffmpegRunner ?? new FfmpegRunner()
  }

  private async ensureMicrophoneAccess(): Promise<void> {
    if (process.platform !== 'darwin') {
      return
    }

    const status = systemPreferences.getMediaAccessStatus('microphone')
    if (status === 'granted') {
      return
    }

    if (status === 'not-determined') {
      const granted = await systemPreferences.askForMediaAccess('microphone')
      if (granted) {
        return
      }
    }

    throw new Error('Microphone permission is required. Enable it in System Settings -> Privacy & Security -> Microphone.')
  }

  private async waitForStartup(process: ChildProcessWithoutNullStreams): Promise<void> {
    const startupTimeoutMs = 600
    let stderrOutput = ''

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        cleanup()
        reject(error)
      }

      const onExit = (code: number | null) => {
        cleanup()
        const compactStderr = stderrOutput.trim().split('\n').slice(-2).join(' ').trim()
        const details = compactStderr.length > 0 ? ` ${compactStderr}` : ''
        reject(new Error(`Recording failed to start (ffmpeg exited with code ${code ?? 'unknown'}).${details}`))
      }

      const onStderr = (chunk: Buffer | string) => {
        stderrOutput += String(chunk)
      }

      const timer = setTimeout(() => {
        cleanup()
        resolve()
      }, startupTimeoutMs)

      const cleanup = () => {
        clearTimeout(timer)
        process.off('error', onError)
        process.off('exit', onExit)
        process.stderr.off('data', onStderr)
      }

      process.once('error', onError)
      process.once('exit', onExit)
      process.stderr.on('data', onStderr)
    })
  }

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

  async startRecording(preferredDeviceId?: string): Promise<void> {
    if (this.currentProcess) {
      throw new Error('Recording already in progress')
    }
    await this.ensureMicrophoneAccess()

    const outputDir = join(app.getPath('userData'), 'captures')
    mkdirSync(outputDir, { recursive: true })

    this.currentOutputPath = join(outputDir, `${Date.now()}-${randomUUID()}.wav`)
    const preferredAudioDeviceName =
      preferredDeviceId && preferredDeviceId !== 'system_default' ? preferredDeviceId : process.env.STT_FFMPEG_AUDIO_DEVICE_NAME
    const preferredAudioDeviceIndex =
      process.env.STT_FFMPEG_AUDIO_DEVICE_INDEX !== undefined
        ? Number(process.env.STT_FFMPEG_AUDIO_DEVICE_INDEX)
        : undefined

    const proc = this.ffmpegRunner.startCapture({
      outputFilePath: this.currentOutputPath,
      sampleRateHz: 16000,
      channels: 1,
      preferredAudioDeviceName,
      preferredAudioDeviceIndex: Number.isNaN(preferredAudioDeviceIndex) ? undefined : preferredAudioDeviceIndex
    })

    this.currentProcess = proc
    proc.once('exit', () => {
      if (this.currentProcess === proc) {
        this.currentProcess = null
        this.currentOutputPath = null
      }
    })

    try {
      await this.waitForStartup(proc)
    } catch (error) {
      this.currentProcess = null
      this.currentOutputPath = null
      throw error
    }
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
