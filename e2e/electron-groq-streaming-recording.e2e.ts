/*
Where: e2e/electron-groq-streaming-recording.e2e.ts
What: Electron Playwright coverage for Groq browser-VAD recording with fake microphone WAV fixtures.
Why: Issue 440 needs an end-to-end proof that real speech audio can pass through
     browser VAD, utterance IPC, Groq rolling upload, and renderer activity output.
*/

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test as base, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
}

type StreamingFixture = {
  audioFileName: string
  expectedText: string
}

interface LaunchElectronAppOptions {
  extraEnv?: Record<string, string>
  chromiumArgs?: string[]
}

const STREAMING_AUDIO_FIXTURES: StreamingFixture[] = [
  {
    audioFileName: 'Recording-1-sentence-jp.wav',
    expectedText: 'これはレコーディングのテストです。'
  },
  {
    audioFileName: 'Recording-2-sentences-jp.wav',
    expectedText: 'これは二つ目のレコーディングのテストです。二つ目の文章を話しています。'
  }
]

const GROQ_ACTIVE_SESSION_MESSAGE = 'Streaming session active with Groq Whisper Large v3 Turbo.'

const resolveFixturePath = (audioFileName: string): string => {
  const fixturePath = path.resolve(process.cwd(), 'e2e', 'fixtures', audioFileName)
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Streaming audio fixture is missing: ${fixturePath}`)
  }
  return fs.realpathSync(fixturePath)
}

const launchElectronApp = async (options?: LaunchElectronAppOptions): Promise<ElectronApplication> => {
  const entry = path.join(process.cwd(), 'out/main/index.js')
  const args = [...(options?.chromiumArgs ?? []), entry]
  const env: Record<string, string> = { ...process.env } as Record<string, string>

  if (process.platform === 'linux') {
    env.ELECTRON_DISABLE_SANDBOX = '1'
  }
  if (options?.extraEnv) {
    for (const [key, value] of Object.entries(options.extraEnv)) {
      env[key] = value
    }
  }

  return electron.launch({
    args,
    env
  })
}

const configureGroqStreamingSettings = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => Boolean(window.speechToTextApi), { timeout: 10_000 })
  await page.evaluate(async () => {
    const settings = await window.speechToTextApi.getSettings()
    await window.speechToTextApi.setSettings({
      ...settings,
      processing: {
        ...settings.processing,
        mode: 'streaming',
        streaming: {
          ...settings.processing.streaming,
          enabled: true,
          provider: 'groq_whisper_large_v3_turbo',
          transport: 'rolling_upload',
          model: 'whisper-large-v3-turbo',
          apiKeyRef: 'groq',
          outputMode: 'stream_raw_dictation',
          language: 'ja',
          delimiterPolicy: {
            mode: 'space',
            value: null
          }
        }
      },
      transcription: {
        ...settings.transcription,
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        outputLanguage: 'ja'
      }
    })
  })
  await page.reload()
  await page.waitForSelector('[data-route-tab="activity"]')
}

const installSyntheticWavMicrophone = async (page: Page, audioFileName: string): Promise<void> => {
  const wavBase64 = fs.readFileSync(resolveFixturePath(audioFileName)).toString('base64')
  await page.evaluate(async ({ encodedWav }) => {
    type SyntheticWavMicState = {
      audioContext: AudioContext
      decodedBuffer: AudioBuffer
      activeSource: AudioBufferSourceNode | null
      destination: MediaStreamAudioDestinationNode
      gain: GainNode
    }

    const decodeBase64ToArrayBuffer = (value: string): ArrayBuffer => {
      const binary = window.atob(value)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return bytes.buffer
    }

    const win = window as Window & {
      __e2eSyntheticWavMicState?: SyntheticWavMicState | null
    }
    const existing = win.__e2eSyntheticWavMicState
    if (existing) {
      try {
        existing.activeSource?.stop()
      } catch {
        // Best-effort cleanup for repeated installs in the same renderer.
      }
      await existing.audioContext.close().catch(() => {
        // Ignore close races while replacing the synthetic microphone.
      })
    }

    const audioContext = new AudioContext()
    const wavBuffer = decodeBase64ToArrayBuffer(encodedWav)
    const decodedBuffer = await audioContext.decodeAudioData(wavBuffer.slice(0))
    const destination = audioContext.createMediaStreamDestination()
    const gain = audioContext.createGain()
    gain.gain.value = 1
    gain.connect(destination)

    win.__e2eSyntheticWavMicState = {
      audioContext,
      decodedBuffer,
      activeSource: null,
      destination,
      gain
    }

    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      writable: true,
      value: async (constraints: MediaStreamConstraints) => {
        void constraints
        const state = win.__e2eSyntheticWavMicState
        if (!state) {
          throw new Error('Synthetic WAV microphone state is not initialized.')
        }

        try {
          await state.audioContext.resume()
        } catch {
          // Some environments auto-resume the context.
        }

        try {
          state.activeSource?.stop()
        } catch {
          // Ignore replacement races while preparing the next source.
        }

        const source = state.audioContext.createBufferSource()
        source.buffer = state.decodedBuffer
        source.connect(state.gain)
        source.start(state.audioContext.currentTime + 0.25)
        state.activeSource = source

        return state.destination.stream
      }
    })
  }, { encodedWav: wavBase64 })
}

const installGroqFetchStub = async (
  electronApp: ElectronApplication,
  fixture: StreamingFixture
): Promise<void> => {
  await electronApp.evaluate(async ({ app }, input) => {
    void app
    const globalScope = globalThis as typeof globalThis & {
      __e2eGroqFetchStubInstalled?: boolean
      __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
      __e2eGroqFetchTexts?: string[]
      __e2eOriginalFetch?: typeof fetch
    }

    globalScope.__e2eGroqFetchRequests = []
    globalScope.__e2eGroqFetchTexts = [input.expectedText]
    if (!globalScope.__e2eGroqFetchStubInstalled) {
      globalScope.__e2eOriginalFetch = globalThis.fetch.bind(globalThis)
      globalThis.fetch = async (resource: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = typeof resource === 'string'
          ? resource
          : resource instanceof URL
            ? resource.toString()
            : resource.url

        if (!url.includes('/openai/v1/audio/transcriptions')) {
          return await globalScope.__e2eOriginalFetch!(resource as never, init)
        }

        globalScope.__e2eGroqFetchRequests?.push({
          url,
          method: init?.method ?? 'GET'
        })
        const responseText = globalScope.__e2eGroqFetchTexts?.shift() ?? input.expectedText
        return new Response(JSON.stringify({
          text: responseText,
          segments: [
            {
              start: 0,
              end: 1.5,
              text: responseText
            }
          ]
        }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      }
      globalScope.__e2eGroqFetchStubInstalled = true
    }
  }, fixture)
}

const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const app = await launchElectronApp()
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('[data-route-tab="activity"]')
    await use(window)
  }
})

for (const fixture of STREAMING_AUDIO_FIXTURES) {
  test(`streams Groq browser-VAD recording from ${fixture.audioFileName} via synthetic microphone @synthetic-audio`, async () => {
    test.setTimeout(90_000)

    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-groq-streaming-e2e-'))
    const xdgConfigHome = path.join(profileRoot, 'xdg-config')
    const app = await launchElectronApp({
      extraEnv: {
        XDG_CONFIG_HOME: xdgConfigHome,
        GROQ_APIKEY: 'e2e-fake-groq-key'
      }
    })

    try {
      const page = await app.firstWindow()
      await page.waitForSelector('[data-route-tab="activity"]')
      await configureGroqStreamingSettings(page)
      await installGroqFetchStub(app, fixture)
      await installSyntheticWavMicrophone(page, fixture.audioFileName)
      await page.locator('[data-route-tab="activity"]').click()

      const startButton = page.getByRole('button', { name: 'Start recording' })
      await expect(startButton).toBeEnabled()
      await startButton.click()

      await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText('Streaming session failed.')).toHaveCount(0)
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)

      await expect.poll(async () => {
        return await app.evaluate(async () => {
          const globalScope = globalThis as typeof globalThis & {
            __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
          }
          return globalScope.__e2eGroqFetchRequests?.length ?? 0
        })
      }, { timeout: 10_000 }).toBeGreaterThan(0)

      await page.getByRole('button', { name: 'Stop recording' }).click()
      await expect(page.getByText('Streaming session stopped.')).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)
    } finally {
      await app.close()
      fs.rmSync(profileRoot, { recursive: true, force: true })
    }
  })

  test(`streams Groq browser-VAD recording from ${fixture.audioFileName} without capture failure via fake audio fixture @fake-audio`, async () => {
    test.setTimeout(90_000)

    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-groq-streaming-e2e-'))
    const xdgConfigHome = path.join(profileRoot, 'xdg-config')
    const app = await launchElectronApp({
      extraEnv: {
        XDG_CONFIG_HOME: xdgConfigHome,
        GROQ_APIKEY: 'e2e-fake-groq-key'
      },
      chromiumArgs: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${resolveFixturePath(fixture.audioFileName)}`
      ]
    })

    try {
      const page = await app.firstWindow()
      await page.waitForSelector('[data-route-tab="activity"]')
      await configureGroqStreamingSettings(page)
      await installGroqFetchStub(app, fixture)
      await page.locator('[data-route-tab="activity"]').click()

      const startButton = page.getByRole('button', { name: 'Start recording' })
      await expect(startButton).toBeEnabled()
      await startButton.click()

      await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText('Streaming session failed.')).toHaveCount(0)
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)

      await expect.poll(async () => {
        return await app.evaluate(async () => {
          const globalScope = globalThis as typeof globalThis & {
            __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
          }
          return globalScope.__e2eGroqFetchRequests?.length ?? 0
        })
      }, { timeout: 10_000 }).toBeGreaterThan(0)

      await page.getByRole('button', { name: 'Stop recording' }).click()
      await expect(page.getByText('Streaming session stopped.')).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)
    } finally {
      await app.close()
      fs.rmSync(profileRoot, { recursive: true, force: true })
    }
  })
}
