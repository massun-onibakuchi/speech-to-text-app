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
  expectedUtteranceTexts?: string[]
}

interface LaunchElectronAppOptions {
  extraEnv?: Record<string, string>
  chromiumArgs?: string[]
}

interface GroqFetchStubOptions {
  splitResponsesByUtterance?: boolean
}

const STREAMING_AUDIO_FIXTURES: StreamingFixture[] = [
  {
    audioFileName: 'Recording-1-sentence-jp.wav',
    expectedText: 'これはレコーディングのテストです。'
  },
  {
    audioFileName: 'Recording-2-sentences-jp.wav',
    expectedText: 'これは二つ目のレコーディングのテストです。二つ目の文章を話しています。',
    expectedUtteranceTexts: [
      'これは二つ目のレコーディングのテストです。',
      '二つ目の文章を話しています。'
    ]
  }
]

const GROQ_ACTIVE_SESSION_MESSAGE = 'Streaming session active with Groq Whisper Large v3 Turbo.'
const PLAYWRIGHT_ACCESSIBILITY_BYPASS_ENV = 'PLAYWRIGHT_BYPASS_ACCESSIBILITY'
const NON_MACOS_OUTPUT_FAILURE_MESSAGE =
  'Streaming error (streaming_output_failed_partial): Paste-at-cursor is only supported on macOS.'

const readEnvFromFile = (filePath: string, key: string): string => {
  if (!fs.existsSync(filePath)) {
    return ''
  }

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue
    }
    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex < 0) {
      continue
    }
    const candidateKey = trimmed.slice(0, separatorIndex).trim()
    if (candidateKey !== key) {
      continue
    }
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    return rawValue.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }

  return ''
}

const resolveGroqApiKey = (): string => {
  const fromProcess = (process.env.GROQ_APIKEY ?? '').trim()
  if (fromProcess.length > 0) {
    return fromProcess
  }

  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    '/workspace/.env'
  ]
  for (const candidatePath of candidatePaths) {
    const value = readEnvFromFile(candidatePath, 'GROQ_APIKEY').trim()
    if (value.length > 0) {
      return value
    }
  }

  return ''
}

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

const configureGroqStreamingSettings = async (page: Page, groqApiKey = 'e2e-fake-groq-key'): Promise<void> => {
  await page.waitForFunction(() => Boolean(window.speechToTextApi), { timeout: 10_000 })
  await page.evaluate(async ({ apiKey }) => {
    await window.speechToTextApi.setApiKey('groq', apiKey)
    const settings = await window.speechToTextApi.getSettings()
    const processing = settings.processing ?? {
      mode: 'default',
      streaming: {
        enabled: false,
        provider: null,
        transport: null,
        model: null,
        apiKeyRef: null,
        baseUrlOverride: null,
        outputMode: null,
        maxInFlightTransforms: 2,
        language: 'auto',
        delimiterPolicy: {
          mode: 'space',
          value: null
        }
      }
    }
    const output = settings.output ?? {
      selectedTextSource: 'transcript',
      transcript: {
        copyToClipboard: false,
        pasteAtCursor: true
      },
      transformed: {
        copyToClipboard: false,
        pasteAtCursor: false
      }
    }
    const transcription = settings.transcription ?? {
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      outputLanguage: 'ja',
      temperature: 0,
      hints: {
        contextText: '',
        dictionaryTerms: []
      }
    }
    await window.speechToTextApi.setSettings({
      ...settings,
      output: {
        ...output,
        selectedTextSource: 'transcript'
      },
      processing: {
        ...processing,
        mode: 'streaming',
        streaming: {
          ...processing.streaming,
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
        ...transcription,
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        outputLanguage: 'ja'
      }
    })
  }, { apiKey: groqApiKey })
  await page.reload()
  await page.waitForSelector('[data-route-tab="activity"]')
  await page.waitForFunction(async () => {
    const api = window.speechToTextApi
    if (!api) {
      return false
    }
    const status = await api.getApiKeyStatus()
    return status.groq === true
  }, { timeout: 10_000 })
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

const installUtteranceIndexTracker = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const win = window as Window & {
      speechToTextApi: typeof window.speechToTextApi
      __e2eNextStreamingUtteranceIndex?: number
      __e2eObservedUtteranceChunks?: Array<{
        utteranceIndex: number
        reason: string
        hadCarryover: boolean
        wavBytesByteLength: number
      }>
      __e2eOriginalPushStreamingAudioUtteranceChunk?: typeof window.speechToTextApi.pushStreamingAudioUtteranceChunk
    }

    win.__e2eNextStreamingUtteranceIndex = 0
    win.__e2eObservedUtteranceChunks = []
    if (!win.__e2eOriginalPushStreamingAudioUtteranceChunk) {
      const api = win.speechToTextApi
      win.__e2eOriginalPushStreamingAudioUtteranceChunk = api.pushStreamingAudioUtteranceChunk.bind(api)
      api.pushStreamingAudioUtteranceChunk = async (
        chunk: Parameters<typeof api.pushStreamingAudioUtteranceChunk>[0]
      ) => {
        const nextIndex = typeof win.__e2eNextStreamingUtteranceIndex === 'number'
          ? win.__e2eNextStreamingUtteranceIndex
          : 0
        win.__e2eNextStreamingUtteranceIndex = Math.max(nextIndex + 1, chunk.utteranceIndex + 1)
        win.__e2eObservedUtteranceChunks?.push({
          utteranceIndex: chunk.utteranceIndex,
          reason: chunk.reason,
          hadCarryover: chunk.hadCarryover,
          wavBytesByteLength: chunk.wavBytes.byteLength
        })
        await win.__e2eOriginalPushStreamingAudioUtteranceChunk!(chunk)
      }
    }
  })
}

type RendererStructuredLog = {
  event?: string
  context?: Record<string, unknown>
}

const installRendererStructuredLogCollector = (page: Page): Array<RendererStructuredLog> => {
  const logs: RendererStructuredLog[] = []
  page.on('console', (message) => {
    const text = message.text()
    try {
      const parsed = JSON.parse(text) as RendererStructuredLog
      logs.push(parsed)
    } catch {
      // Ignore non-JSON console output from the page.
    }
  })
  return logs
}

const pushFixtureUtterance = async (page: Page, audioFileName: string): Promise<void> => {
  const wavBase64 = fs.readFileSync(resolveFixturePath(audioFileName)).toString('base64')
  await page.evaluate(async ({ encodedWav }) => {
    const decodeBase64ToArrayBuffer = (value: string): ArrayBuffer => {
      const binary = window.atob(value)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index)
      }
      return bytes.buffer
    }

    const resampleToMono16k = async (source: AudioBuffer): Promise<Float32Array> => {
      const frameCount = Math.max(1, Math.ceil(source.duration * 16_000))
      const offlineContext = new OfflineAudioContext(1, frameCount, 16_000)
      const monoBuffer = offlineContext.createBuffer(1, source.length, source.sampleRate)
      const monoChannel = monoBuffer.getChannelData(0)
      const channelCount = Math.max(1, source.numberOfChannels)
      for (let frameIndex = 0; frameIndex < source.length; frameIndex += 1) {
        let sample = 0
        for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
          sample += source.getChannelData(channelIndex)[frameIndex] ?? 0
        }
        monoChannel[frameIndex] = sample / channelCount
      }
      const sourceNode = offlineContext.createBufferSource()
      sourceNode.buffer = monoBuffer
      sourceNode.connect(offlineContext.destination)
      sourceNode.start()
      const rendered = await offlineContext.startRendering()
      return new Float32Array(rendered.getChannelData(0))
    }

    const encodePcm16Mono16kWav = (audio: Float32Array): ArrayBuffer => {
      const bytesPerSample = 2
      const dataSize = audio.length * bytesPerSample
      const buffer = new ArrayBuffer(44 + dataSize)
      const view = new DataView(buffer)
      const writeAscii = (offset: number, value: string): void => {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index))
        }
      }

      writeAscii(0, 'RIFF')
      view.setUint32(4, 36 + dataSize, true)
      writeAscii(8, 'WAVE')
      writeAscii(12, 'fmt ')
      view.setUint32(16, 16, true)
      view.setUint16(20, 1, true)
      view.setUint16(22, 1, true)
      view.setUint32(24, 16_000, true)
      view.setUint32(28, 16_000 * bytesPerSample, true)
      view.setUint16(32, bytesPerSample, true)
      view.setUint16(34, 16, true)
      writeAscii(36, 'data')
      view.setUint32(40, dataSize, true)

      let offset = 44
      for (let index = 0; index < audio.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, audio[index] ?? 0))
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
        offset += bytesPerSample
      }
      return buffer
    }

    const session = await window.speechToTextApi.getStreamingSessionSnapshot()
    if (!session.sessionId) {
      throw new Error('Streaming session is not active; cannot inject fixture utterance.')
    }
    const win = window as Window & {
      __e2eNextStreamingUtteranceIndex?: number
    }

    const decoderContext = new AudioContext()
    try {
      const decoded = await decoderContext.decodeAudioData(decodeBase64ToArrayBuffer(encodedWav).slice(0))
      const mono16k = await resampleToMono16k(decoded)
      const endedAtEpochMs = Date.now()
      const startedAtEpochMs = endedAtEpochMs - Math.round((mono16k.length / 16_000) * 1000)
      const utteranceIndex = typeof win.__e2eNextStreamingUtteranceIndex === 'number'
        ? win.__e2eNextStreamingUtteranceIndex
        : 0
      await window.speechToTextApi.pushStreamingAudioUtteranceChunk({
        sessionId: session.sessionId,
        sampleRateHz: 16_000,
        channels: 1,
        utteranceIndex,
        wavBytes: encodePcm16Mono16kWav(mono16k),
        wavFormat: 'wav_pcm_s16le_mono_16000',
        startedAtEpochMs,
        endedAtEpochMs,
        hadCarryover: false,
        reason: 'speech_pause',
        source: 'browser_vad',
        traceEnabled: true
      })
    } finally {
      await decoderContext.close().catch(() => {})
    }
  }, { encodedWav: wavBase64 })
}

const startStreamingSessionFromApi = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await window.speechToTextApi.runRecordingCommand('toggleRecording')
  })
  await page.waitForFunction(async () => {
    const snapshot = await window.speechToTextApi.getStreamingSessionSnapshot()
    return snapshot.state === 'active' && snapshot.sessionId !== null
  }, { timeout: 15_000 })
}

const stopStreamingSessionFromApi = async (page: Page): Promise<void> => {
  const snapshot = await page.evaluate(async () => await window.speechToTextApi.getStreamingSessionSnapshot())
  if (!snapshot.sessionId) {
    return
  }

  await page.evaluate(async () => {
    await window.speechToTextApi.runRecordingCommand('toggleRecording')
  })
}

const installGroqFetchStub = async (
  electronApp: ElectronApplication,
  fixture: StreamingFixture,
  options?: GroqFetchStubOptions
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
    globalScope.__e2eGroqFetchTexts = input.splitResponsesByUtterance
      ? input.expectedUtteranceTexts?.slice() ?? [input.expectedText]
      : [input.expectedText]
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
  }, {
    ...fixture,
    splitResponsesByUtterance: options?.splitResponsesByUtterance ?? false
  })
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

test('splits Recording-2-sentences-jp.wav into two speech_pause Groq utterances via natural browser VAD @natural-vad-pause', async () => {
  test.setTimeout(90_000)

  const fixture = STREAMING_AUDIO_FIXTURES.find((candidate) => candidate.audioFileName === 'Recording-2-sentences-jp.wav')
  if (!fixture || !fixture.expectedUtteranceTexts || fixture.expectedUtteranceTexts.length !== 2) {
    throw new Error('Expected the two-sentence Japanese fixture with two utterance texts to be configured.')
  }

  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-groq-natural-vad-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GROQ_APIKEY: 'e2e-fake-groq-key',
      [PLAYWRIGHT_ACCESSIBILITY_BYPASS_ENV]: '1'
    }
  })

  try {
    const page = await app.firstWindow()
    const rendererLogs = installRendererStructuredLogCollector(page)
    await page.waitForSelector('[data-route-tab="activity"]')
    await configureGroqStreamingSettings(page)
    await installGroqFetchStub(app, fixture, { splitResponsesByUtterance: true })
    await installSyntheticWavMicrophone(page, fixture.audioFileName)
    await page.locator('[data-route-tab="activity"]').click()

    await startStreamingSessionFromApi(page)
    await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
      timeout: 15_000
    })

    await expect.poll(() => {
      return rendererLogs.filter((entry) => {
        return entry.event === 'streaming.groq_vad.utterance_ready'
          && entry.context?.reason === 'speech_pause'
      }).length
    }, { timeout: 25_000 }).toBeGreaterThanOrEqual(2)

    const observedUtteranceLogs = rendererLogs.filter((entry) => {
      return entry.event === 'streaming.groq_vad.utterance_ready'
        && entry.context?.reason === 'speech_pause'
    })

    expect(observedUtteranceLogs.slice(0, 2)).toEqual([
      expect.objectContaining({
        context: expect.objectContaining({
          utteranceIndex: 0,
          reason: 'speech_pause',
          hadCarryover: false,
          samples: expect.any(Number)
        })
      }),
      expect.objectContaining({
        context: expect.objectContaining({
          utteranceIndex: 1,
          reason: 'speech_pause',
          hadCarryover: false,
          samples: expect.any(Number)
        })
      })
    ])

    await expect(page.getByText(`Streamed text: ${fixture.expectedUtteranceTexts[0]}`)).toBeVisible({
      timeout: 25_000
    })
    await expect(page.getByText(`Streamed text: ${fixture.expectedUtteranceTexts[1]}`)).toBeVisible({
      timeout: 25_000
    })

    await expect.poll(async () => {
      return await app.evaluate(async () => {
        const globalScope = globalThis as typeof globalThis & {
          __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
        }
        return globalScope.__e2eGroqFetchRequests?.length ?? 0
      })
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2)

    await stopStreamingSessionFromApi(page)
    await expect(page.getByText('Streaming session stopped.')).toBeVisible({
      timeout: 15_000
    })
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
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
        GROQ_APIKEY: 'e2e-fake-groq-key',
        [PLAYWRIGHT_ACCESSIBILITY_BYPASS_ENV]: '1'
      }
    })

    try {
      const page = await app.firstWindow()
      await page.waitForSelector('[data-route-tab="activity"]')
      await configureGroqStreamingSettings(page)
      await installUtteranceIndexTracker(page)
      await installGroqFetchStub(app, fixture)
      await installSyntheticWavMicrophone(page, fixture.audioFileName)
      await page.locator('[data-route-tab="activity"]').click()

      await startStreamingSessionFromApi(page)
      await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
        timeout: 15_000
      })
      await pushFixtureUtterance(page, fixture.audioFileName)
      await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText('Streaming session failed.')).toHaveCount(0)
      await expect(page.getByText(/Streaming error \(/)).toHaveCount(0)
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)

      await expect.poll(async () => {
        return await app.evaluate(async () => {
          const globalScope = globalThis as typeof globalThis & {
            __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
          }
          return globalScope.__e2eGroqFetchRequests?.length ?? 0
        })
      }, { timeout: 10_000 }).toBeGreaterThan(0)

      await stopStreamingSessionFromApi(page)
      await expect(page.getByText('Streaming session stopped.')).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
      await expect(page.getByText(/Streaming error \(/)).toHaveCount(0)
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
        GROQ_APIKEY: 'e2e-fake-groq-key',
        [PLAYWRIGHT_ACCESSIBILITY_BYPASS_ENV]: '1'
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
      await installUtteranceIndexTracker(page)
      await installGroqFetchStub(app, fixture)
      await page.locator('[data-route-tab="activity"]').click()

      await startStreamingSessionFromApi(page)
      await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
        timeout: 15_000
      })
      await pushFixtureUtterance(page, fixture.audioFileName)
      await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText('Streaming session failed.')).toHaveCount(0)
      await expect(page.getByText(/Streaming error \(/)).toHaveCount(0)
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)

      await expect.poll(async () => {
        return await app.evaluate(async () => {
          const globalScope = globalThis as typeof globalThis & {
            __e2eGroqFetchRequests?: Array<{ url: string; method: string }>
          }
          return globalScope.__e2eGroqFetchRequests?.length ?? 0
        })
      }, { timeout: 10_000 }).toBeGreaterThan(0)

      await stopStreamingSessionFromApi(page)
      await expect(page.getByText('Streaming session stopped.')).toBeVisible({
        timeout: 15_000
      })
      await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
      await expect(page.getByText(/Streaming error \(/)).toHaveCount(0)
      await expect(page.locator('#toast-layer li').filter({ hasText: 'Streaming capture failed:' })).toHaveCount(0)
    } finally {
      await app.close()
      fs.rmSync(profileRoot, { recursive: true, force: true })
    }
  })

  test(`keeps streamed text visible when output fails after Groq utterance commit from ${fixture.audioFileName} @output-failure-contract`, async () => {
    test.skip(process.platform === 'darwin', 'Non-macOS contract test for deterministic output failure messaging')
    test.setTimeout(90_000)

    const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-groq-streaming-output-failure-e2e-'))
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
      await installUtteranceIndexTracker(page)
      await installGroqFetchStub(app, fixture)
      await installSyntheticWavMicrophone(page, fixture.audioFileName)
      await page.locator('[data-route-tab="activity"]').click()

      await startStreamingSessionFromApi(page)
      await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
        timeout: 15_000
      })
      await pushFixtureUtterance(page, fixture.audioFileName)
      await expect(page.getByText(`Streamed text: ${fixture.expectedText}`)).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText(NON_MACOS_OUTPUT_FAILURE_MESSAGE).first()).toBeVisible({
        timeout: 25_000
      })
      await expect(page.getByText('Streaming session failed.')).toHaveCount(0)

      await stopStreamingSessionFromApi(page)
      await expect(page.getByText('Streaming session stopped.')).toBeVisible({
        timeout: 15_000
      })
    } finally {
      await app.close()
      fs.rmSync(profileRoot, { recursive: true, force: true })
    }
  })
}

test('streams Groq recording through the live provider utterance IPC path @live-provider @utterance-ipc', async () => {
  test.setTimeout(90_000)

  const groqApiKey = resolveGroqApiKey()
  test.skip(groqApiKey.length === 0, 'No GROQ_APIKEY configured in env or /workspace/.env')

  const fixture = STREAMING_AUDIO_FIXTURES[0]!
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-groq-live-provider-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GROQ_APIKEY: groqApiKey,
      [PLAYWRIGHT_ACCESSIBILITY_BYPASS_ENV]: '1'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')
    await configureGroqStreamingSettings(page, groqApiKey)
    await installUtteranceIndexTracker(page)
    await installSyntheticWavMicrophone(page, fixture.audioFileName)
    await page.locator('[data-route-tab="activity"]').click()

    await startStreamingSessionFromApi(page)
    await expect(page.getByText(GROQ_ACTIVE_SESSION_MESSAGE)).toBeVisible({
      timeout: 15_000
    })
    await pushFixtureUtterance(page, fixture.audioFileName)
    await expect(page.getByText(/^Streamed text:\s.+/)).toBeVisible({
      timeout: 30_000
    })
    await expect(page.getByText('Streaming session failed.')).toHaveCount(0)
    await expect(page.getByText(/Streaming error \(/)).toHaveCount(0)

    await stopStreamingSessionFromApi(page)
    await expect(page.getByText('Streaming session stopped.')).toBeVisible({
      timeout: 15_000
    })
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})
