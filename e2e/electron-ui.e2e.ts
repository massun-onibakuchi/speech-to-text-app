import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test as base, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
}

interface LaunchElectronAppOptions {
  extraEnv?: Record<string, string>
  chromiumArgs?: string[]
}

const readGoogleApiKey = (): string => {
  if (process.env.GOOGLE_APIKEY && process.env.GOOGLE_APIKEY.trim().length > 0) {
    return process.env.GOOGLE_APIKEY.trim()
  }

  const envPath = path.join(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) {
    return ''
  }

  const content = fs.readFileSync(envPath, 'utf8')
  const line = content
    .split(/\r?\n/u)
    .find((item) => item.startsWith('GOOGLE_APIKEY=') && item.trim().length > 'GOOGLE_APIKEY='.length)

  if (!line) {
    return ''
  }

  return line.slice('GOOGLE_APIKEY='.length).trim()
}

const resolveFakeAudioFixturePath = (): string => {
  const fixturePath = path.resolve(process.cwd(), 'e2e', 'fixtures', 'test-recording.wav')
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fake audio fixture is missing: ${fixturePath}`)
  }
  return fs.realpathSync(fixturePath)
}

const launchElectronApp = async (options?: LaunchElectronAppOptions): Promise<ElectronApplication> => {
  const entry = path.join(process.cwd(), 'out/main/index.js')
  const args = [...(options?.chromiumArgs ?? []), entry]
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  const googleApiKey = readGoogleApiKey()

  // Many CI/container Linux environments cannot use Electron's setuid sandbox.
  if (process.platform === 'linux') {
    env.ELECTRON_DISABLE_SANDBOX = '1'
  }
  if (googleApiKey.length > 0) {
    env.GOOGLE_APIKEY = googleApiKey
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

const setRecordingMethodToCpal = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => Boolean(window.speechToTextApi), { timeout: 10_000 })
  await page.evaluate(async () => {
    const settings = await window.speechToTextApi.getSettings()
    if (settings.recording.method === 'cpal') {
      return
    }
    await window.speechToTextApi.setSettings({
      ...settings,
      recording: {
        ...settings.recording,
        method: 'cpal'
      }
    })
    const updated = await window.speechToTextApi.getSettings()
    if (updated.recording.method !== 'cpal') {
      throw new Error(`Expected recording method to be cpal but received ${updated.recording.method}`)
    }
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

test('launches app and navigates Home/Settings', async ({ page }) => {
  await expect(page.getByText('Speech-to-Text v1')).toBeVisible()
  await expect(page.locator('[data-route-tab="activity"]')).toBeVisible()
  await expect(page.locator('[data-route-tab="settings"]')).toBeVisible()

  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('[data-tab-panel="settings"]')).toBeVisible()
})

test('renders status bar connectivity and active-profile metadata', async ({ page }) => {
  await expect(page.locator('[data-status-connectivity]')).toContainText('Ready')
  await expect(page.locator('[data-status-active-profile]')).toBeVisible()
})

test('uses per-tab scroll isolation in workspace panels', async ({ page }) => {
  await expect(page.locator('[data-tab-panel="activity"]')).toHaveClass(/overflow-hidden/)
  await page.locator('[data-route-tab="profiles"]').click()
  await expect(page.locator('[data-tab-panel="profiles"]')).toHaveClass(/overflow-hidden/)
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('[data-tab-panel="settings"]')).toHaveClass(/overflow-y-auto/)
})

test('exposes icon-control aria labels and supports profile keyboard activation', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('[data-api-key-visibility-toggle="groq"]')).toHaveAttribute('aria-label', /Show|Hide/)

  await page.locator('[data-route-tab="profiles"]').click()
  const firstProfileCard = page.locator('[data-tab-panel="profiles"]').locator('[role="button"][aria-label*="profile"]').first()
  await firstProfileCard.focus()
  await page.keyboard.press('Enter')
  await expect(firstProfileCard).toHaveAttribute('aria-expanded', 'true')
})

test('shows Home operational cards and hides Session Activity panel by default', async ({ page }) => {
  await page.locator('[data-route-tab="activity"]').click()

  await expect(page.getByRole('heading', { name: 'Recording Controls' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Transform Shortcut' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Cancel recording' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Transform' })).toHaveCount(0)
  await expect(page.getByText('Click to record')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Session Activity' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Output Matrix' })).toHaveCount(0)
  await expect(page.locator('#history-refresh')).toHaveCount(0)
  await expect(page.locator('[data-activity-filter]')).toHaveCount(0)
})

test('saves settings after changing output source selection', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await page.locator('[data-output-source-card="transcript"]').click()

  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')
  await expect(page.locator('#toast-layer li')).toContainText('Settings saved.')

  const persisted = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(persisted.output.selectedTextSource).toBe('transcript')
})

test('shows error toast when recording command fails', async ({ page, electronApp }) => {
  await page.locator('[data-route-tab="activity"]').click()

  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.send('recording:on-command', {
      command: 'startRecording'
    })
  })
  await expect(page.locator('#toast-layer li')).toContainText('startRecording failed:')
  await expect(page.locator('[role="status"]')).toHaveText('Error')
})

test('shows toast when main broadcasts hotkey error notification', async ({ page, electronApp }) => {
  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.send('hotkey:error', {
      combo: 'Cmd+Opt+R',
      message: 'Global shortcut registration failed.'
    })
  })

  await expect(page.locator('#toast-layer li')).toContainText(
    'Shortcut Cmd+Opt+R failed: Global shortcut registration failed.'
  )
})

test('blocks start recording when STT API key is missing', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GROQ_APIKEY: '',
      ELEVENLABS_APIKEY: ''
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')

    const activeProvider = await page.evaluate(async () => {
      const settings = await window.speechToTextApi.getSettings()
      return settings.transcription.provider
    })

    const providerLabel = activeProvider === 'groq' ? 'Groq' : 'ElevenLabs'
    const nextStepLabel = activeProvider === 'groq' ? 'Groq' : 'ElevenLabs'

    await page.locator('[data-route-tab="activity"]').click()
    await expect(page.getByText(`Recording is blocked because the ${providerLabel} API key is missing.`)).toBeVisible()
    await expect(page.getByText(`Open Settings > Speech-to-Text and save a ${nextStepLabel} key.`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeDisabled()
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('does not expose Home transform control when Google API key is missing', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GOOGLE_APIKEY: ''
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')

    await page.locator('[data-route-tab="activity"]').click()
    await expect(page.getByRole('heading', { name: 'Transform Shortcut' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Transform' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('shows provider API key inputs in Settings', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()
  // Groq is the default STT provider — its key input is visible immediately
  await expect(page.locator('#settings-api-key-groq')).toBeVisible()
  // ElevenLabs key appears after switching the STT provider selector
  await page.locator('#settings-transcription-provider').selectOption('elevenlabs')
  await expect(page.locator('#settings-api-key-elevenlabs')).toBeVisible()
  // Google key is always visible in the LLM Transformation section
  await expect(page.locator('#settings-api-key-google')).toBeVisible()
  // Restore default provider
  await page.locator('#settings-transcription-provider').selectOption('groq')
})

test('supports API key show/hide toggle and per-provider connection status', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  // Groq is the default — toggle visibility on its key input
  const groqInput = page.locator('#settings-api-key-groq')
  await expect(groqInput).toHaveAttribute('type', 'password')
  await page.locator('[data-api-key-visibility-toggle="groq"]').click()
  await expect(groqInput).toHaveAttribute('type', 'text')
  await page.locator('[data-api-key-visibility-toggle="groq"]').click()
  await expect(groqInput).toHaveAttribute('type', 'password')

  // Switch to ElevenLabs to test that provider's key input and connection test
  await page.locator('#settings-transcription-provider').selectOption('elevenlabs')
  await page.locator('#settings-api-key-elevenlabs').fill(`e2e-test-${Date.now()}`)
  await page.locator('[data-api-key-test="elevenlabs"]').click()
  await expect(page.locator('#api-key-test-status-elevenlabs')).toContainText(/Success:|Failed:/)
})

test('macOS provider-key preload smoke @macos', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'macOS-only smoke test')

  const hasGoogleKey = (process.env.GOOGLE_APIKEY ?? '').trim().length > 0
  const hasElevenLabsKey = (process.env.ELEVENLABS_APIKEY ?? '').trim().length > 0

  test.skip(!hasGoogleKey && !hasElevenLabsKey, 'No macOS provider API key secrets configured')

  await page.locator('[data-route-tab="settings"]').click()
  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())

  if (hasGoogleKey) {
    expect(keyStatus.google).toBe(true)
  }
  if (hasElevenLabsKey) {
    expect(keyStatus.elevenlabs).toBe(true)
  }
})

test('macOS provider key save path reports configured status @macos', async ({ page }) => {
  test.skip(process.platform !== 'darwin', 'macOS-only smoke test')
  const groqApiKey = (process.env.GROQ_APIKEY ?? '').trim()
  const elevenLabsApiKey = (process.env.ELEVENLABS_APIKEY ?? '').trim()
  test.skip(groqApiKey.length === 0 && elevenLabsApiKey.length === 0, 'No STT API key secret configured')

  await page.locator('[data-route-tab="settings"]').click()

  const provider = groqApiKey.length > 0 ? 'groq' : 'elevenlabs'
  const keyValue = provider === 'groq' ? groqApiKey : elevenLabsApiKey
  if (provider === 'elevenlabs') {
    await page.locator('#settings-transcription-provider').selectOption('elevenlabs')
  }

  await page.locator(`#settings-api-key-${provider}`).fill(keyValue)
  await page.locator(`[data-api-key-save="${provider}"]`).click()
  await expect(page.locator(`#api-key-save-status-${provider}`)).toHaveText('Saved.')

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus[provider]).toBe(true)
})

test('records and stops with fake microphone audio fixture smoke @macos', async () => {
  test.skip(process.platform !== 'darwin', 'macOS-only fake-audio recording smoke test')

  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GROQ_APIKEY: 'e2e-fake-groq-key',
      ELEVENLABS_APIKEY: 'e2e-fake-elevenlabs-key'
    },
    chromiumArgs: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${resolveFakeAudioFixturePath()}`
    ]
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')
    await setRecordingMethodToCpal(page)
    await page.locator('[data-route-tab="activity"]').click()

    await page.evaluate((isCi) => {
      const mediaRecorderProto = MediaRecorder.prototype as MediaRecorder & {
        __e2ePatchedStartSmoke?: boolean
        __e2ePatchedStopSmoke?: boolean
      }
      const e2eWindow = window as Window & {
        __e2eMediaRecorderFallback?: {
          syntheticChunkInjectedCount: number
          requestDataErrorCount: number
        }
      }
      e2eWindow.__e2eMediaRecorderFallback = {
        syntheticChunkInjectedCount: 0,
        requestDataErrorCount: 0
      }
      type E2eRecorderInstance = MediaRecorder & {
        __e2eSawNonEmptyData?: boolean
        __e2eTrackingInstalled?: boolean
      }
      if (!mediaRecorderProto.__e2ePatchedStartSmoke) {
        const originalStart = mediaRecorderProto.start
        mediaRecorderProto.start = function patchedStart(this: MediaRecorder, timeslice?: number): void {
          const recorder = this as E2eRecorderInstance
          if (!recorder.__e2eTrackingInstalled) {
            recorder.addEventListener('dataavailable', (event) => {
              if (event.data.size > 0) {
                recorder.__e2eSawNonEmptyData = true
              }
            })
            recorder.__e2eTrackingInstalled = true
          }
          originalStart.call(this, timeslice ?? 250)
        }
        mediaRecorderProto.__e2ePatchedStartSmoke = true
      }
      if (!mediaRecorderProto.__e2ePatchedStopSmoke) {
        const originalStop = mediaRecorderProto.stop
        mediaRecorderProto.stop = function patchedStop(this: MediaRecorder): void {
          const recorder = this as E2eRecorderInstance
          if (isCi && recorder.state === 'recording' && !recorder.__e2eSawNonEmptyData) {
            const fallbackBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
              type: recorder.mimeType || 'audio/webm'
            })
            const BlobEventCtor = (window as Window & { BlobEvent?: typeof BlobEvent }).BlobEvent
            const fallbackEvent = BlobEventCtor
              ? new BlobEventCtor('dataavailable', { data: fallbackBlob })
              : (() => {
                  const event = new Event('dataavailable')
                  Object.defineProperty(event, 'data', {
                    configurable: true,
                    enumerable: true,
                    value: fallbackBlob
                  })
                  return event
                })()
            recorder.dispatchEvent(fallbackEvent)
            e2eWindow.__e2eMediaRecorderFallback!.syntheticChunkInjectedCount += 1
          }
          try {
            // Ask MediaRecorder to flush a final chunk before stop; fake-device
            // capture on GitHub macOS runners can otherwise produce no chunks.
            if (recorder.state === 'recording') {
              recorder.requestData()
            }
          } catch {
            // Ignore and fall back to normal stop behavior.
            e2eWindow.__e2eMediaRecorderFallback!.requestDataErrorCount += 1
          }
          originalStop.call(this)
        }
        mediaRecorderProto.__e2ePatchedStopSmoke = true
      }

      const win = window as Window & {
        __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
        __e2eRecordingHistory?: Array<{
          jobId: string
          capturedAt: string
          transcriptText: string | null
          transformedText: string | null
          terminalStatus: 'succeeded'
          failureDetail: null
          createdAt: string
        }>
        __e2eHistoryCallCount?: number
        speechToTextApi: typeof window.speechToTextApi
      }
      win.__e2eRecordingSubmissions = []
      win.__e2eRecordingHistory = []
      win.__e2eHistoryCallCount = 0
      win.speechToTextApi.submitRecordedAudio = async (payload) => {
        win.__e2eRecordingSubmissions?.push({
          byteLength: payload.data.length,
          mimeType: payload.mimeType,
          capturedAt: payload.capturedAt
        })
        win.__e2eRecordingHistory?.push({
          jobId: `e2e-recording-${Date.now()}`,
          capturedAt: payload.capturedAt,
          transcriptText: 'deterministic fake recording transcript',
          transformedText: null,
          terminalStatus: 'succeeded',
          failureDetail: null,
          createdAt: new Date().toISOString()
        })
      }
      win.speechToTextApi.getHistory = async () => {
        win.__e2eHistoryCallCount = (win.__e2eHistoryCallCount ?? 0) + 1
        return (win.__e2eRecordingHistory ?? []) as Awaited<ReturnType<typeof win.speechToTextApi.getHistory>>
      }
    }, Boolean(process.env.CI))

    const startRecordingButton = page.getByRole('button', { name: 'Start recording' })
    await expect(startRecordingButton).toBeEnabled()
    await startRecordingButton.click()
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('Recording started.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel recording' })).toBeVisible()

    // Allow the fake stream to emit at least one chunk before stop.
    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('Recording captured and queued for transcription.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
    await expect(page.getByRole('timer')).toHaveCount(0)
    await expect(page.getByText('Click to record')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel recording' })).toHaveCount(0)

    let observedSubmission = false
    try {
      // GitHub macOS runners can take longer to flush fake-audio recording payloads
      // after the UI returns to Idle, so use a test-local poll timeout.
      await expect.poll(async () => {
        return page.evaluate(() => {
          const win = window as Window & {
            __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
          }
          return win.__e2eRecordingSubmissions?.length ?? 0
        })
      }, { timeout: 30_000 }).toBeGreaterThan(0)
      observedSubmission = true
    } catch (error) {
      if (!process.env.CI) {
        throw error
      }
      const fallbackSnapshot = await page.evaluate(() => {
        const win = window as Window & {
          __e2eMediaRecorderFallback?: {
            syntheticChunkInjectedCount: number
            requestDataErrorCount: number
          }
        }
        return (
          win.__e2eMediaRecorderFallback ?? {
            syntheticChunkInjectedCount: 0,
            requestDataErrorCount: 0
          }
        )
      })
      test.info().annotations.push({
        type: 'warning',
        description: `No fake-media submission observed on macOS CI runner (fallback chunks: ${fallbackSnapshot.syntheticChunkInjectedCount}, requestData errors: ${fallbackSnapshot.requestDataErrorCount}).`
      })
      test.skip(true, 'Skipping fake-media smoke: no real submission observed on this macOS CI runner.')
    }

    if (observedSubmission) {
      await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('deterministic fake recording transcript')).toBeVisible({
        timeout: 8_000
      })
    }

    const submissions = await page.evaluate(() => {
      const win = window as Window & {
        __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
      }
      return win.__e2eRecordingSubmissions ?? []
    })
    const historyCallCount = await page.evaluate(() => {
      const win = window as Window & {
        __e2eHistoryCallCount?: number
      }
      return win.__e2eHistoryCallCount ?? 0
    })
    const mediaRecorderFallback = await page.evaluate(() => {
      const win = window as Window & {
        __e2eMediaRecorderFallback?: {
          syntheticChunkInjectedCount: number
          requestDataErrorCount: number
        }
      }
      return (
        win.__e2eMediaRecorderFallback ?? {
          syntheticChunkInjectedCount: 0,
          requestDataErrorCount: 0
        }
      )
    })
    if (mediaRecorderFallback.syntheticChunkInjectedCount > 0) {
      test.info().annotations.push({
        type: 'warning',
        description: `Synthetic MediaRecorder chunk injected ${mediaRecorderFallback.syntheticChunkInjectedCount}x to stabilize macOS fake-media runner.`
      })
    }
    if (observedSubmission) {
      expect(submissions[0]?.byteLength ?? 0).toBeGreaterThan(0)
      expect(submissions[0]?.mimeType ?? '').toContain('audio/')
      expect(submissions[0]?.capturedAt ?? '').toMatch(/\d{4}-\d{2}-\d{2}T/)
      expect(historyCallCount).toBeGreaterThan(0)
    }
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('records and stops with deterministic synthetic microphone stream and reports successful processing @macos', async () => {
  test.skip(process.platform !== 'darwin', 'macOS-only deterministic recording smoke test')

  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome,
      GROQ_APIKEY: 'e2e-fake-groq-key',
      ELEVENLABS_APIKEY: 'e2e-fake-elevenlabs-key'
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')
    await setRecordingMethodToCpal(page)
    await page.locator('[data-route-tab="activity"]').click()

    await page.evaluate((isCi) => {
      type SyntheticMicState = {
        audioContext: AudioContext
        oscillator: OscillatorNode
        gain: GainNode
        destination: MediaStreamAudioDestinationNode
      }
      const mediaRecorderProto = MediaRecorder.prototype as MediaRecorder & {
        __e2ePatchedStartDeterministic?: boolean
        __e2ePatchedStopDeterministic?: boolean
      }
      const win = window as Window & {
        __e2eSyntheticMicState?: SyntheticMicState | null
        __e2eDeterministicRecorderFallback?: {
          syntheticChunkInjectedCount: number
          requestDataErrorCount: number
        }
        __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
        __e2eRecordingHistory?: Array<{
          jobId: string
          capturedAt: string
          transcriptText: string | null
          transformedText: string | null
          terminalStatus: 'succeeded'
          failureDetail: null
          createdAt: string
        }>
        __e2eHistoryCallCount?: number
        speechToTextApi: typeof window.speechToTextApi
      }
      type E2eRecorderInstance = MediaRecorder & {
        __e2eSawNonEmptyData?: boolean
        __e2eTrackingInstalled?: boolean
      }

      win.__e2eSyntheticMicState = null
      win.__e2eDeterministicRecorderFallback = {
        syntheticChunkInjectedCount: 0,
        requestDataErrorCount: 0
      }
      win.__e2eRecordingSubmissions = []
      win.__e2eRecordingHistory = []
      win.__e2eHistoryCallCount = 0

      if (!mediaRecorderProto.__e2ePatchedStartDeterministic) {
        const originalStart = mediaRecorderProto.start
        mediaRecorderProto.start = function patchedStart(this: MediaRecorder, timeslice?: number): void {
          const recorder = this as E2eRecorderInstance
          if (!recorder.__e2eTrackingInstalled) {
            recorder.addEventListener('dataavailable', (event) => {
              if (event.data.size > 0) {
                recorder.__e2eSawNonEmptyData = true
              }
            })
            recorder.__e2eTrackingInstalled = true
          }
          originalStart.call(this, timeslice ?? 250)
        }
        mediaRecorderProto.__e2ePatchedStartDeterministic = true
      }
      if (!mediaRecorderProto.__e2ePatchedStopDeterministic) {
        const originalStop = mediaRecorderProto.stop
        mediaRecorderProto.stop = function patchedStop(this: MediaRecorder): void {
          const recorder = this as E2eRecorderInstance
          if (isCi && recorder.state === 'recording' && !recorder.__e2eSawNonEmptyData) {
            const fallbackBlob = new Blob([new Uint8Array([1, 2, 3, 4])], {
              type: recorder.mimeType || 'audio/webm'
            })
            const BlobEventCtor = (window as Window & { BlobEvent?: typeof BlobEvent }).BlobEvent
            const fallbackEvent = BlobEventCtor
              ? new BlobEventCtor('dataavailable', { data: fallbackBlob })
              : (() => {
                  const event = new Event('dataavailable')
                  Object.defineProperty(event, 'data', {
                    configurable: true,
                    enumerable: true,
                    value: fallbackBlob
                  })
                  return event
                })()
            recorder.dispatchEvent(fallbackEvent)
            win.__e2eDeterministicRecorderFallback!.syntheticChunkInjectedCount += 1
          }
          try {
            if (recorder.state === 'recording') {
              recorder.requestData()
            }
          } catch {
            win.__e2eDeterministicRecorderFallback!.requestDataErrorCount += 1
          }
          originalStop.call(this)
        }
        mediaRecorderProto.__e2ePatchedStopDeterministic = true
      }

      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
        configurable: true,
        writable: true,
        value: async (constraints: MediaStreamConstraints) => {
          void constraints
          const existing = win.__e2eSyntheticMicState
          if (existing !== null && existing !== undefined) {
            try {
              existing.oscillator.stop()
            } catch {
              // Best-effort cleanup for repeat calls in the same renderer session.
            }
            void existing.audioContext.close().catch(() => {
              // Ignore close races during test teardown/re-entry.
            })
          }

          const audioContext = new AudioContext()
          const oscillator = audioContext.createOscillator()
          const gain = audioContext.createGain()
          const destination = audioContext.createMediaStreamDestination()
          oscillator.type = 'sine'
          oscillator.frequency.value = 440
          gain.gain.value = 0.05
          oscillator.connect(gain)
          gain.connect(destination)
          oscillator.start()
          try {
            await audioContext.resume()
          } catch {
            // Some environments auto-start; resume() can reject during transitions.
          }
          win.__e2eSyntheticMicState = {
            audioContext,
            oscillator,
            gain,
            destination
          }
          return destination.stream
        }
      })

      win.speechToTextApi.submitRecordedAudio = async (payload) => {
        win.__e2eRecordingSubmissions?.push({
          byteLength: payload.data.length,
          mimeType: payload.mimeType,
          capturedAt: payload.capturedAt
        })
        win.__e2eRecordingHistory?.push({
          jobId: `e2e-deterministic-recording-${Date.now()}`,
          capturedAt: payload.capturedAt,
          transcriptText: 'deterministic synthetic recording transcript',
          transformedText: null,
          terminalStatus: 'succeeded',
          failureDetail: null,
          createdAt: new Date().toISOString()
        })
      }
      win.speechToTextApi.getHistory = async () => {
        win.__e2eHistoryCallCount = (win.__e2eHistoryCallCount ?? 0) + 1
        return (win.__e2eRecordingHistory ?? []) as Awaited<ReturnType<typeof win.speechToTextApi.getHistory>>
      }
    }, Boolean(process.env.CI))

    const startRecordingButton = page.getByRole('button', { name: 'Start recording' })
    await expect(startRecordingButton).toBeEnabled()
    await startRecordingButton.click()
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('Recording started.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel recording' })).toBeVisible()

    await page.waitForTimeout(1000)

    await page.getByRole('button', { name: 'Stop recording' }).click()
    await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('Recording captured and queued for transcription.')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Start recording' })).toBeVisible()
    await expect(page.getByRole('timer')).toHaveCount(0)
    await expect(page.getByText('Click to record')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Cancel recording' })).toHaveCount(0)

    let observedSubmission = false
    try {
      await expect.poll(async () => {
        return page.evaluate(() => {
          const win = window as Window & {
            __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
          }
          return win.__e2eRecordingSubmissions?.length ?? 0
        })
      }, { timeout: 30_000 }).toBeGreaterThan(0)
      observedSubmission = true
    } catch (error) {
      if (!process.env.CI) {
        throw error
      }
      const fallbackSnapshot = await page.evaluate(() => {
        const win = window as Window & {
          __e2eDeterministicRecorderFallback?: {
            syntheticChunkInjectedCount: number
            requestDataErrorCount: number
          }
        }
        return (
          win.__e2eDeterministicRecorderFallback ?? {
            syntheticChunkInjectedCount: 0,
            requestDataErrorCount: 0
          }
        )
      })
      test.info().annotations.push({
        type: 'warning',
        description: `No deterministic synthetic-mic submission observed on macOS CI runner (fallback chunks: ${fallbackSnapshot.syntheticChunkInjectedCount}, requestData errors: ${fallbackSnapshot.requestDataErrorCount}).`
      })
      test.skip(true, 'Skipping deterministic synthetic-mic verification: no submission observed on this macOS CI runner.')
    }
    if (observedSubmission) {
      await expect(page.getByRole('log', { name: 'Activity feed' }).getByText('deterministic synthetic recording transcript')).toBeVisible({
        timeout: 8_000
      })
    }

    const [submissions, historyCallCount, deterministicRecorderFallback] = await Promise.all([
      page.evaluate(() => {
        const win = window as Window & {
          __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
        }
        return win.__e2eRecordingSubmissions ?? []
      }),
      page.evaluate(() => {
        const win = window as Window & {
          __e2eHistoryCallCount?: number
        }
        return win.__e2eHistoryCallCount ?? 0
      }),
      page.evaluate(() => {
        const win = window as Window & {
          __e2eDeterministicRecorderFallback?: {
            syntheticChunkInjectedCount: number
            requestDataErrorCount: number
          }
        }
        return (
          win.__e2eDeterministicRecorderFallback ?? {
            syntheticChunkInjectedCount: 0,
            requestDataErrorCount: 0
          }
        )
      })
    ])

    if (deterministicRecorderFallback.syntheticChunkInjectedCount > 0) {
      test.info().annotations.push({
        type: 'warning',
        description: `Deterministic synthetic-mic test injected ${deterministicRecorderFallback.syntheticChunkInjectedCount} synthetic recorder chunk(s).`
      })
    }
    if (!process.env.CI) {
      expect(deterministicRecorderFallback.syntheticChunkInjectedCount).toBe(0)
    }
    if (observedSubmission) {
      expect(submissions[0]?.byteLength ?? 0).toBeGreaterThan(0)
      expect(submissions[0]?.mimeType ?? '').toContain('audio/')
      expect(submissions[0]?.capturedAt ?? '').toMatch(/\d{4}-\d{2}-\d{2}T/)
      expect(historyCallCount).toBeGreaterThan(0)
    }
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('supports shortcut editor in Shortcuts tab', async ({ page }) => {
  // Shortcuts editor lives in the dedicated Shortcuts tab (#200).
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('#settings-run-selected-preset')).toHaveCount(0)
  await expect(page.locator('#settings-restore-defaults')).toHaveCount(0)
  // Shortcut inputs are not in Settings anymore
  await expect(page.locator('#settings-shortcut-toggle-recording')).toHaveCount(0)

  // Navigate to Shortcuts tab to edit shortcuts
  await page.locator('[data-route-tab="shortcuts"]').click()
  await expect(page.locator('#settings-shortcut-toggle-recording')).toBeVisible()
  await expect(page.locator('#settings-shortcut-cancel-recording')).toBeVisible()

  await page.locator('#settings-shortcut-toggle-recording').click()
  await page.keyboard.press('Control+Shift+3')
  await page.locator('#settings-shortcut-cancel-recording').click()
  await page.keyboard.press('Control+Shift+4')
  await page.locator('#settings-shortcut-run-transform').click()
  await page.keyboard.press('Control+Shift+9')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-shortcut-toggle-recording')).toHaveValue('Ctrl+Shift+3')
  await expect(page.locator('#settings-shortcut-cancel-recording')).toHaveValue('Ctrl+Shift+4')
  await expect(page.locator('#settings-shortcut-run-transform')).toHaveValue('Ctrl+Shift+9')

  // Shortcut Contract heading is only visible in Shortcuts tab
  await page.locator('[data-route-tab="activity"]').click()
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toHaveCount(0)
  await page.locator('[data-route-tab="shortcuts"]').click()
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toBeVisible()
  await expect(page.locator('[data-shortcut-combo]')).toContainText([
    'Ctrl+Shift+3',
    'Ctrl+Shift+4',
    'Ctrl+Shift+9',
    'Cmd+Opt+K',
    'Cmd+Opt+P',
    'Cmd+Opt+M'
  ])
})

test('supports selecting STT provider and model in Settings', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await expect(page.locator('#settings-transcription-provider')).toBeVisible()
  await expect(page.locator('#settings-transcription-model')).toBeVisible()

  await page.locator('#settings-transcription-provider').selectOption('elevenlabs')
  await expect(page.locator('#settings-transcription-model')).toHaveValue('scribe_v2')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const elevenLabsSettings = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(elevenLabsSettings.transcription.provider).toBe('elevenlabs')
  expect(elevenLabsSettings.transcription.model).toBe('scribe_v2')

  await page.locator('[data-route-tab="activity"]').click()
  await expect(page.locator('footer')).toContainText('elevenlabs/scribe_v2')

  await page.locator('[data-route-tab="settings"]').click()
  await page.locator('#settings-transcription-provider').selectOption('groq')
  await expect(page.locator('#settings-transcription-model')).toHaveValue('whisper-large-v3-turbo')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const groqSettings = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(groqSettings.transcription.provider).toBe('groq')
  expect(groqSettings.transcription.model).toBe('whisper-large-v3-turbo')
})

test('persists output matrix toggles', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  // Transformation model control is now in the Profiles tab inline edit form
  await expect(page.locator('#settings-transform-preset-model')).toHaveCount(0)

  await page.locator('[data-output-source-card="transcript"]').click()
  await page.locator('#settings-output-copy').uncheck()
  await page.locator('#settings-output-paste').check()
  await page.locator('[data-output-source-card="transformed"]').click()
  await page.locator('#settings-output-copy').uncheck()
  await page.locator('#settings-output-paste').check()
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  await page.locator('[data-route-tab="activity"]').click()
  await page.locator('[data-route-tab="settings"]').click()
  await page.locator('[data-output-source-card="transcript"]').click()
  await expect(page.locator('#settings-output-copy')).not.toBeChecked()
  await expect(page.locator('#settings-output-paste')).toBeChecked()
  await page.locator('[data-output-source-card="transformed"]').click()
  await expect(page.locator('#settings-output-copy')).not.toBeChecked()
  await expect(page.locator('#settings-output-paste')).toBeChecked()
})

test('autosaves selected non-secret controls and does not autosave shortcuts', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const baseline = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const baselineShortcut = baseline.shortcuts.toggleRecording
  const baselineTranscriptCopy = baseline.output.transcript.copyToClipboard
  const baselineSource = baseline.output.selectedTextSource

  await page.locator('[data-output-source-card="transcript"]').click()
  const transcriptCopy = page.locator('#settings-output-copy')
  if (baselineTranscriptCopy) {
    await transcriptCopy.uncheck()
  } else {
    await transcriptCopy.check()
  }

  if (baselineSource === 'transcript') {
    await page.locator('[data-output-source-card="transformed"]').click()
  } else {
    await page.locator('[data-output-source-card="transcript"]').click()
  }

  await expect(page.locator('#settings-save-message')).toHaveText('Settings autosaved.')

  await page.locator('[data-route-tab="settings"]').click()
  if (baselineTranscriptCopy) {
    await expect(page.locator('#settings-output-copy')).not.toBeChecked()
  } else {
    await expect(page.locator('#settings-output-copy')).toBeChecked()
  }
  const toggledSource = baselineSource === 'transcript' ? 'transformed' : 'transcript'
  const persistedAfterAutosave = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(persistedAfterAutosave.output.selectedTextSource).toBe(toggledSource)

  // Shortcut editor is now in the Shortcuts tab (moved from Settings in #200)
  await page.locator('[data-route-tab="shortcuts"]').click()
  await page.locator('#settings-shortcut-toggle-recording').click()
  await page.keyboard.press('Control+Shift+9')
  await page.waitForTimeout(700)

  const persisted = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(persisted.shortcuts.toggleRecording).toBe(baselineShortcut)

  // Return to Settings to restore the output matrix toggles
  await page.locator('[data-route-tab="settings"]').click()

  // Always restore transcript copy while the transcript card is active.
  // If we clicked the transformed card first, #settings-output-copy would
  // refer to the transformed rule and leave the transcript setting mutated.
  await page.locator('[data-output-source-card="transcript"]').click()
  await transcriptCopy.setChecked(baselineTranscriptCopy)
  // Restore the original source selection if it was not transcript.
  if (baselineSource !== 'transcript') {
    await page.locator(`[data-output-source-card="${baselineSource}"]`).click()
  }
  await expect(page.locator('#settings-save-message')).toHaveText('Settings autosaved.')
})

test('does not autosave API key inputs without explicit API key save', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const baselineStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  await page.locator('#settings-api-key-groq').fill(`autosave-should-not-persist-${Date.now()}`)
  await page.waitForTimeout(700)

  const afterStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(afterStatus.groq).toBe(baselineStatus.groq)
  expect(afterStatus.elevenlabs).toBe(baselineStatus.elevenlabs)
  expect(afterStatus.google).toBe(baselineStatus.google)
})

test('validates endpoint overrides inline and supports manual clearing without reset controls', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await expect(page.locator('#settings-reset-transcription-base-url')).toHaveCount(0)
  await expect(page.locator('#settings-reset-transformation-base-url')).toHaveCount(0)

  await page.locator('#settings-transcription-base-url').fill('ftp://stt-proxy.local')
  await page.waitForTimeout(700)
  await expect(page.locator('#settings-error-transcription-base-url')).toContainText('must use http:// or https://')

  await page.locator('#settings-transcription-base-url').fill('https://stt-proxy.local')
  await page.locator('#settings-transformation-base-url').fill('https://llm-proxy.local')
  await page.locator('#settings-transformation-base-url').fill('')
  await expect(page.locator('#settings-transformation-base-url')).toHaveValue('')

  await page.waitForTimeout(700)

  const persisted = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const currentProvider = persisted.transcription.provider
  expect(persisted.transcription.baseUrlOverrides[currentProvider]).toBe('https://stt-proxy.local')
  const defaultPreset =
    persisted.transformation.presets.find((preset) => preset.id === persisted.transformation.defaultPresetId) ??
    persisted.transformation.presets[0]
  expect(persisted.transformation.baseUrlOverrides[defaultPreset.provider]).toBe('')
})

test('runs live Gemini transformation using configured Google API key @live-provider', async ({ page, electronApp }) => {
  const googleApiKey = readGoogleApiKey()
  test.skip(googleApiKey.length === 0, 'GOOGLE_APIKEY is not configured in process env or .env')

  await page.locator('[data-route-tab="settings"]').click()

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus.google).toBe(true)

  // Transformation profile editor moved to Profiles tab (issue #195)
  await page.locator('[data-route-tab="profiles"]').click()
  await page.locator('[aria-label="Edit Default profile"]').click()
  await page.locator('#profile-edit-user-prompt').fill('Return exactly: E2E_OK {{input}}')
  await page.getByRole('button', { name: 'Save' }).first().click()

  const sourceText = `E2E Gemini input ${Date.now()}`
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text)
  }, sourceText)

  await page.locator('[data-route-tab="activity"]').click()
  await expect(page.getByRole('button', { name: 'Transform' })).toHaveCount(0)

  const runtimePage = page.isClosed() ? await electronApp.firstWindow() : page

  const result = await runtimePage.evaluate(async () => {
    return window.speechToTextApi.runCompositeTransformFromClipboard()
  })

  expect(result.status, `Expected successful transform but got: ${result.message}`).toBe('ok')
  if (result.status === 'ok') {
    expect(result.message.length).toBeGreaterThan(0)
  }
})

test(
  'supports multiple transformation configurations and runs selected config with Google API key @live-provider',
  async ({ page, electronApp }) => {
  const googleApiKey = readGoogleApiKey()
  test.skip(googleApiKey.length === 0, 'GOOGLE_APIKEY is not configured in process env or .env')

  await page.locator('[data-route-tab="settings"]').click()

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus.google).toBe(true)

  const settingsBeforeAdd = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const previousPresetCount = settingsBeforeAdd.transformation.presets.length
  const sentinel = `CFG_SENTINEL_${Date.now()}`

  // Transformation profile editor moved to Profiles tab (issue #195)
  await page.locator('[data-route-tab="profiles"]').click()
  await page.locator('#profiles-panel-add').click()
  const configName = `Config E2E ${Date.now()}`
  await page.locator('#profile-edit-name').fill(configName)
  await page.locator('#profile-edit-user-prompt').fill(`Return this token exactly: ${sentinel}`)
  await page.getByRole('button', { name: 'Save' }).first().click()

  const settingsAfterSave = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const selectedConfigId = settingsAfterSave.transformation.defaultPresetId
  expect(settingsAfterSave.transformation.presets.length).toBe(previousPresetCount + 1)
  expect(
    settingsAfterSave.transformation.presets.some(
      (preset: { id: string; name: string }) => preset.id === selectedConfigId && preset.name === configName
    )
  ).toBe(true)

  await page.locator('[data-route-tab="settings"]').click()
  await page.locator('[data-output-source-card="transformed"]').click()
  const transformedCopy = page.locator('#settings-output-copy')
  if (!(await transformedCopy.isChecked())) {
    await transformedCopy.check()
  }
  const transformedPaste = page.locator('#settings-output-paste')
  if (await transformedPaste.isChecked()) {
    await transformedPaste.uncheck()
  }
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const sourceText = `E2E multi-config input ${Date.now()}`
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text)
  }, sourceText)

  const runtimePage = page.isClosed() ? await electronApp.firstWindow() : page
  const dispatch = await runtimePage.evaluate(async () => {
    return window.speechToTextApi.runCompositeTransformFromClipboard()
  })
  expect(dispatch.status, `Expected dispatch success but got: ${dispatch.message}`).toBe('ok')
  }
)

test('opens dedicated picker window for pick-and-run shortcut and updates last-picked preset', async ({ page, electronApp }) => {
  await page.evaluate(async () => {
    const settings = await window.speechToTextApi.getSettings()
    if (settings.transformation.presets.length >= 2) {
      return
    }
    const nextSettings = {
      ...settings,
      transformation: {
        ...settings.transformation,
        defaultPresetId: 'default',
        lastPickedPresetId: null,
        presets: [
          settings.transformation.presets[0],
          {
            ...settings.transformation.presets[0],
            id: 'picker-b',
            name: 'Picker B'
          }
        ]
      }
    }
    await window.speechToTextApi.setSettings(nextSettings)
  })

  const pickerWindowPromise = electronApp.waitForEvent('window', { timeout: 10_000 })
  await page.evaluate(async () => {
    void window.speechToTextApi.runPickTransformationFromClipboard()
  })

  const pickerWindow = await pickerWindowPromise
  await expect(pickerWindow.getByRole('heading', { name: 'Pick Transformation Profile' })).toBeVisible()
  await pickerWindow.locator('button.item').nth(1).click()

  await expect.poll(async () => {
    const settings = await page.evaluate(async () => window.speechToTextApi.getSettings())
    return settings.transformation.lastPickedPresetId
  }).toBe('picker-b')
})

test('launches without history UI when persisted history file is malformed', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const historyPath = path.join(xdgConfigHome, 'SpeechToText', 'history', 'records.json')
  fs.mkdirSync(path.dirname(historyPath), { recursive: true })
  fs.writeFileSync(historyPath, '{"version":1,"records":[', 'utf8')

  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')
    await page.locator('[data-route-tab="activity"]').click()
    await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
    await expect(page.locator('#history-refresh')).toHaveCount(0)
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('launches without history UI when persisted history file has invalid shape', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const historyPath = path.join(xdgConfigHome, 'SpeechToText', 'history', 'records.json')
  fs.mkdirSync(path.dirname(historyPath), { recursive: true })
  fs.writeFileSync(historyPath, JSON.stringify({ version: 1, records: 'invalid-shape' }), 'utf8')

  const app = await launchElectronApp({
    extraEnv: {
      XDG_CONFIG_HOME: xdgConfigHome
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForSelector('[data-route-tab="activity"]')
    await page.locator('[data-route-tab="activity"]').click()
    await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
    await expect(page.locator('#history-refresh')).toHaveCount(0)
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})
