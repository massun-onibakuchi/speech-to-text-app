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

const resolveFakeAudioFixturePath = (): string => path.join(process.cwd(), 'e2e', 'fixtures', 'fake-mic-tone.wav')

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

const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const app = await launchElectronApp()
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow()
    await window.waitForSelector('h1:has-text("Speech-to-Text v1")')
    await use(window)
  }
})

test('launches app and navigates Home/Settings', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Speech-to-Text v1' })).toBeVisible()
  await expect(page.locator('[data-route-tab="home"]')).toBeVisible()
  await expect(page.locator('[data-route-tab="settings"]')).toBeVisible()

  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('shows Home operational cards and hides Session Activity panel by default', async ({ page }) => {
  await page.locator('[data-route-tab="home"]').click()

  await expect(page.getByRole('heading', { name: 'Recording Controls' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Transform Shortcut' })).toBeVisible()
  await expect(page.locator('article').filter({ has: page.getByRole('heading', { name: 'Recording Controls' }) }).locator('[role="status"]')).toHaveText('Idle')
  await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Session Activity' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Output Matrix' })).toHaveCount(0)
  await expect(page.locator('#history-refresh')).toHaveCount(0)
  await expect(page.locator('[data-activity-filter]')).toHaveCount(0)
})

test('saves settings and reflects transformed warning state', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const transformEnabled = page.locator('#settings-transform-enabled')
  const initiallyEnabled = await transformEnabled.isChecked()
  await transformEnabled.click()

  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')
  await expect(page.locator('#toast-layer .toast-item')).toContainText('Settings saved.')

  await page.locator('[data-route-tab="home"]').click()

  if (initiallyEnabled) {
    await expect(page.getByText('Transformation is blocked because it is disabled.')).toBeVisible()
  } else {
    await expect(page.getByText('Transformation is blocked because it is disabled.')).toHaveCount(0)
  }
})

test('shows error toast when recording command fails', async ({ page, electronApp }) => {
  await page.locator('[data-route-tab="home"]').click()

  await electronApp.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.send('recording:on-command', {
      command: 'startRecording'
    })
  })
  await expect(page.locator('#toast-layer .toast-item')).toContainText('startRecording failed:')
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

  await expect(page.locator('#toast-layer .toast-item')).toContainText(
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
    await page.waitForSelector('h1:has-text("Speech-to-Text v1")')

    const activeProvider = await page.evaluate(async () => {
      const settings = await window.speechToTextApi.getSettings()
      return settings.transcription.provider
    })

    const providerLabel = activeProvider === 'groq' ? 'Groq' : 'ElevenLabs'
    const nextStepLabel = activeProvider === 'groq' ? 'Groq' : 'ElevenLabs'

    await page.locator('[data-route-tab="home"]').click()
    await expect(page.getByText(`Recording is blocked because the ${providerLabel} API key is missing.`)).toBeVisible()
    await expect(page.getByText(`Open Settings > Provider API Keys and save a ${nextStepLabel} key.`)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start' })).toBeDisabled()
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('blocks composite transform when Google API key is missing', async () => {
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
    await page.waitForSelector('h1:has-text("Speech-to-Text v1")')

    await page.locator('[data-route-tab="settings"]').click()
    const transformEnabled = page.locator('#settings-transform-enabled')
    if (!(await transformEnabled.isChecked())) {
      await transformEnabled.click()
      await page.getByRole('button', { name: 'Save Settings' }).click()
      await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')
    }

    await page.locator('[data-route-tab="home"]').click()
    await expect(page.getByText('Transformation is blocked because the Google API key is missing.')).toBeVisible()
    await expect(page.getByText('Open Settings > Provider API Keys and save a Google key.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run Composite Transform' })).toBeDisabled()
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('shows blocked transform reason and deep-links to Settings when disabled', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (await transformEnabled.isChecked()) {
    await transformEnabled.click()
  }
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  await page.locator('[data-route-tab="home"]').click()
  await expect(page.getByText('Transformation is blocked because it is disabled.')).toBeVisible()
  await expect(page.getByText('Open Settings > Transformation and enable transformation.')).toBeVisible()
  await page.getByRole('button', { name: 'Open Settings' }).first().click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})

test('shows disabled-transform toast when Home composite transform button is pressed', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (await transformEnabled.isChecked()) {
    await transformEnabled.click()
  }
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  await page.locator('[data-route-tab="home"]').click()
  await expect(page.getByRole('button', { name: 'Run Composite Transform' })).toBeDisabled()
  await expect(page.getByText('Transformation is blocked because it is disabled.')).toBeVisible()
})

test('shows provider API key inputs in Settings', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('#settings-api-key-groq')).toBeVisible()
  await expect(page.locator('#settings-api-key-elevenlabs')).toBeVisible()
  await expect(page.locator('#settings-api-key-google')).toBeVisible()
})

test('supports API key show/hide toggle and per-provider connection status', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const groqInput = page.locator('#settings-api-key-groq')
  await expect(groqInput).toHaveAttribute('type', 'password')
  await page.locator('[data-api-key-visibility-toggle="groq"]').click()
  await expect(groqInput).toHaveAttribute('type', 'text')
  await page.locator('[data-api-key-visibility-toggle="groq"]').click()
  await expect(groqInput).toHaveAttribute('type', 'password')

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

  await page.locator('[data-route-tab="settings"]').click()

  const keyValue = `macos-e2e-${Date.now()}`
  await page.locator('#settings-api-key-groq').fill(keyValue)
  await page.getByRole('button', { name: 'Save API Keys' }).click()
  await expect(page.locator('#api-keys-save-message')).toHaveText('API keys saved.')
  await expect(page.locator('#api-key-save-status-groq')).toHaveText('Saved.')

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus.groq).toBe(true)
})

test('records and stops with fake microphone audio fixture @macos', async () => {
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
    await page.waitForSelector('h1:has-text("Speech-to-Text v1")')
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
    })
    await page.locator('[data-route-tab="home"]').click()

    await page.evaluate(() => {
      const win = window as Window & {
        __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
        speechToTextApi: typeof window.speechToTextApi
      }
      win.__e2eRecordingSubmissions = []
      win.speechToTextApi.submitRecordedAudio = async (payload) => {
        win.__e2eRecordingSubmissions?.push({
          byteLength: payload.data.length,
          mimeType: payload.mimeType,
          capturedAt: payload.capturedAt
        })
      }
    })

    const recordingStatus = page.locator('.status-dot[role="status"]')
    await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled()
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(recordingStatus).toHaveText('Recording')
    await expect(
      page.locator('#toast-layer .toast-item').filter({ hasText: 'Recording started.' })
    ).toHaveCount(1)

    // Allow MediaRecorder to collect a non-empty chunk from the fake WAV input.
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Stop' }).click()
    await expect(
      page.locator('#toast-layer .toast-item').filter({ hasText: 'Recording stopped. Capture queued for transcription.' })
    ).toHaveCount(1)
    await expect(recordingStatus).toHaveText('Idle')

    await expect.poll(async () => {
      return page.evaluate(() => {
        const win = window as Window & {
          __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
        }
        return win.__e2eRecordingSubmissions?.length ?? 0
      })
    }).toBe(1)

    const submissions = await page.evaluate(() => {
      const win = window as Window & {
        __e2eRecordingSubmissions?: Array<{ byteLength: number; mimeType: string; capturedAt: string }>
      }
      return win.__e2eRecordingSubmissions ?? []
    })
    expect(submissions[0]?.byteLength ?? 0).toBeGreaterThan(0)
    expect(submissions[0]?.mimeType ?? '').toContain('audio/')
    expect(submissions[0]?.capturedAt ?? '').toMatch(/\d{4}-\d{2}-\d{2}T/)
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})

test('supports run-selected preset, restore-defaults, and recording roadmap link in Settings', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await expect(page.locator('#settings-run-selected-preset')).toBeVisible()
  await expect(page.locator('#settings-restore-defaults')).toBeVisible()
  await expect(page.locator('a.inline-link[href*="/issues/8"]')).toBeVisible()
  await expect(page.locator('#settings-shortcut-start-recording')).toBeVisible()
  await expect(page.locator('#settings-shortcut-stop-recording')).toBeVisible()
  await expect(page.locator('#settings-shortcut-toggle-recording')).toBeVisible()
  await expect(page.locator('#settings-shortcut-cancel-recording')).toBeVisible()

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (await transformEnabled.isChecked()) {
    await transformEnabled.click()
  }
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  await page.locator('#settings-run-selected-preset').click()
  await expect(
    page
      .locator('#toast-layer .toast-item')
      .filter({ hasText: 'Transformation is blocked because it is disabled. Open Settings > Transformation and enable transformation.' })
  ).toBeVisible()

  await page.locator('#settings-shortcut-start-recording').fill('Cmd+Shift+1')
  await page.locator('#settings-shortcut-stop-recording').fill('Cmd+Shift+2')
  await page.locator('#settings-shortcut-toggle-recording').fill('Cmd+Shift+3')
  await page.locator('#settings-shortcut-cancel-recording').fill('Cmd+Shift+4')
  await page.locator('#settings-shortcut-run-transform').fill('Cmd+Shift+9')
  await page.locator('#settings-transcript-copy').uncheck()
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-shortcut-start-recording')).toHaveValue('Cmd+Shift+1')
  await expect(page.locator('#settings-shortcut-stop-recording')).toHaveValue('Cmd+Shift+2')
  await expect(page.locator('#settings-shortcut-toggle-recording')).toHaveValue('Cmd+Shift+3')
  await expect(page.locator('#settings-shortcut-cancel-recording')).toHaveValue('Cmd+Shift+4')
  await expect(page.locator('#settings-shortcut-run-transform')).toHaveValue('Cmd+Shift+9')
  await expect(page.locator('#settings-transcript-copy')).not.toBeChecked()

  await page.locator('[data-route-tab="home"]').click()
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toHaveCount(0)
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toBeVisible()
  await expect(page.locator('.shortcut-combo')).toContainText(['Cmd+Shift+1', 'Cmd+Shift+2', 'Cmd+Shift+3', 'Cmd+Shift+4'])

  await page.locator('#settings-restore-defaults').click()
  await expect(page.locator('#settings-save-message')).toHaveText('Defaults restored.')
  await expect(page.locator('#settings-shortcut-start-recording')).toHaveValue('Cmd+Opt+R')
  await expect(page.locator('#settings-shortcut-stop-recording')).toHaveValue('Cmd+Opt+S')
  await expect(page.locator('#settings-shortcut-toggle-recording')).toHaveValue('Cmd+Opt+T')
  await expect(page.locator('#settings-shortcut-cancel-recording')).toHaveValue('Cmd+Opt+C')
  await expect(page.locator('#settings-shortcut-run-transform')).toHaveValue('Cmd+Opt+L')
  await expect(page.locator('#settings-transcript-copy')).toBeChecked()
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

  await page.locator('[data-route-tab="home"]').click()
  await expect(page.getByText('STT elevenlabs / scribe_v2')).toBeVisible()

  await page.locator('[data-route-tab="settings"]').click()
  await page.locator('#settings-transcription-provider').selectOption('groq')
  await expect(page.locator('#settings-transcription-model')).toHaveValue('whisper-large-v3-turbo')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const groqSettings = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(groqSettings.transcription.provider).toBe('groq')
  expect(groqSettings.transcription.model).toBe('whisper-large-v3-turbo')
})

test('persists output matrix toggles and exposes transformation model controls', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await expect(page.locator('#settings-transform-enabled')).toBeVisible()
  await expect(page.locator('#settings-transform-preset-model')).toBeVisible()
  await expect(page.locator('#settings-transform-preset-model')).toHaveValue(/gemini-(1\.5-flash-8b|2\.5-flash)/)

  await page.locator('#settings-transcript-copy').uncheck()
  await page.locator('#settings-transcript-paste').check()
  await page.locator('#settings-transformed-copy').uncheck()
  await page.locator('#settings-transformed-paste').check()
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  await page.locator('[data-route-tab="home"]').click()
  await page.locator('[data-route-tab="settings"]').click()
  await expect(page.locator('#settings-transcript-copy')).not.toBeChecked()
  await expect(page.locator('#settings-transcript-paste')).toBeChecked()
  await expect(page.locator('#settings-transformed-copy')).not.toBeChecked()
  await expect(page.locator('#settings-transformed-paste')).toBeChecked()
})

test('autosaves selected non-secret controls and does not autosave shortcuts', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  const baseline = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const baselineShortcut = baseline.shortcuts.startRecording
  const baselineTranscriptCopy = baseline.output.transcript.copyToClipboard
  const baselineTransformEnabled = baseline.transformation.enabled

  const transcriptCopy = page.locator('#settings-transcript-copy')
  if (baselineTranscriptCopy) {
    await transcriptCopy.uncheck()
  } else {
    await transcriptCopy.check()
  }

  const transformEnabled = page.locator('#settings-transform-enabled')
  await transformEnabled.setChecked(!baselineTransformEnabled)

  await expect(page.locator('#settings-save-message')).toHaveText('Settings autosaved.')

  await page.locator('[data-route-tab="home"]').click()
  if (baselineTransformEnabled) {
    await expect(page.getByText('Transformation is blocked because it is disabled.')).toBeVisible()
  } else {
    await expect(page.getByText('Transformation is blocked because it is disabled.')).toHaveCount(0)
  }
  await page.locator('[data-route-tab="settings"]').click()
  if (baselineTranscriptCopy) {
    await expect(page.locator('#settings-transcript-copy')).not.toBeChecked()
  } else {
    await expect(page.locator('#settings-transcript-copy')).toBeChecked()
  }

  await page.locator('#settings-shortcut-start-recording').fill('Cmd+Shift+9')
  await page.waitForTimeout(700)

  const persisted = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(persisted.shortcuts.startRecording).toBe(baselineShortcut)

  await transformEnabled.setChecked(baselineTransformEnabled)
  await transcriptCopy.setChecked(baselineTranscriptCopy)
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

test('validates endpoint overrides inline and supports reset controls', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await page.locator('#settings-transcription-base-url').fill('ftp://stt-proxy.local')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Fix the highlighted validation errors before saving.')
  await expect(page.locator('#settings-error-transcription-base-url')).toContainText('must use http:// or https://')

  await page.locator('#settings-transcription-base-url').fill('https://stt-proxy.local')
  await page.locator('#settings-transformation-base-url').fill('https://llm-proxy.local')
  await page.locator('#settings-reset-transformation-base-url').click()
  await expect(page.locator('#settings-transformation-base-url')).toHaveValue('')

  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')
})

test('runs live Gemini transformation using configured Google API key @live-provider', async ({ page, electronApp }) => {
  const googleApiKey = readGoogleApiKey()
  test.skip(googleApiKey.length === 0, 'GOOGLE_APIKEY is not configured in process env or .env')

  await page.locator('[data-route-tab="settings"]').click()

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus.google).toBe(true)

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (!(await transformEnabled.isChecked())) {
    await transformEnabled.click()
  }

  await page.locator('#settings-user-prompt').fill('Return exactly: E2E_OK {{input}}')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const sourceText = `E2E Gemini input ${Date.now()}`
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text)
  }, sourceText)

  await page.locator('[data-route-tab="home"]').click()
  await expect(page.getByRole('button', { name: 'Run Composite Transform' })).toBeVisible()

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

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (!(await transformEnabled.isChecked())) {
    await transformEnabled.click()
  }

  const settingsBeforeAdd = await page.evaluate(async () => window.speechToTextApi.getSettings())
  const previousPresetCount = settingsBeforeAdd.transformation.presets.length
  const sentinel = `CFG_SENTINEL_${Date.now()}`

  await page.locator('#settings-preset-add').click()
  const activeConfigSelect = page.locator('#settings-transform-active-preset')
  const selectedConfigId = await activeConfigSelect.inputValue()
  const configName = `Config E2E ${Date.now()}`
  await page.locator('#settings-transform-preset-name').fill(configName)
  await page.locator('#settings-user-prompt').fill(`Return this token exactly: ${sentinel}`)
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const settingsAfterSave = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(settingsAfterSave.transformation.presets.length).toBe(previousPresetCount + 1)
  expect(settingsAfterSave.transformation.activePresetId).toBe(selectedConfigId)
  expect(
    settingsAfterSave.transformation.presets.some(
      (preset: { id: string; name: string }) => preset.id === selectedConfigId && preset.name === configName
    )
  ).toBe(true)

  const transformedCopy = page.locator('#settings-transformed-copy')
  if (!(await transformedCopy.isChecked())) {
    await transformedCopy.check()
  }
  const transformedPaste = page.locator('#settings-transformed-paste')
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

test('opens dedicated picker window for pick-and-run shortcut and updates active preset', async ({ page, electronApp }) => {
  await page.evaluate(async () => {
    const settings = await window.speechToTextApi.getSettings()
    if (settings.transformation.presets.length >= 2) {
      return
    }
    const nextSettings = {
      ...settings,
      transformation: {
        ...settings.transformation,
        activePresetId: 'default',
        defaultPresetId: 'default',
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
    return settings.transformation.activePresetId
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
    await page.waitForSelector('h1:has-text("Speech-to-Text v1")')
    await page.locator('[data-route-tab="home"]').click()
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
    await page.waitForSelector('h1:has-text("Speech-to-Text v1")')
    await page.locator('[data-route-tab="home"]').click()
    await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
    await expect(page.locator('#history-refresh')).toHaveCount(0)
  } finally {
    await app.close()
    fs.rmSync(profileRoot, { recursive: true, force: true })
  }
})
