import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { test as base, expect, type Page } from '@playwright/test'
import { _electron as electron, type ElectronApplication } from 'playwright'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
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

const launchElectronApp = async (extraEnv?: Record<string, string>): Promise<ElectronApplication> => {
  const entry = path.join(process.cwd(), 'out/main/index.js')
  const args = [entry]
  const env: Record<string, string> = { ...process.env } as Record<string, string>
  const googleApiKey = readGoogleApiKey()

  // Many CI/container Linux environments cannot use Electron's setuid sandbox.
  if (process.platform === 'linux') {
    env.ELECTRON_DISABLE_SANDBOX = '1'
  }
  if (googleApiKey.length > 0) {
    env.GOOGLE_APIKEY = googleApiKey
  }
  if (extraEnv) {
    for (const [key, value] of Object.entries(extraEnv)) {
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
  await expect(page.getByRole('heading', { name: 'Processing History' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Session Activity' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Output Matrix' })).toHaveCount(0)
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
    await expect(page.getByText('Transformation is disabled. Enable it in Settings > Transformation.')).toBeVisible()
  } else {
    await expect(page.getByText('Transformation is disabled. Enable it in Settings > Transformation.')).toHaveCount(0)
  }
})

test('shows error toast when recording command fails', async ({ page }) => {
  await page.locator('[data-route-tab="home"]').click()
  await page.locator('[data-recording-command="startRecording"]').click()
  await expect(page.locator('#toast-layer .toast-item')).toContainText('startRecording failed:')
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
  await expect(page.getByText('Transformation is disabled. Enable it in Settings > Transformation.')).toBeVisible()
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
  await page.locator('#run-composite-transform').click()
  await expect(
    page.locator('#toast-layer .toast-item').filter({
      hasText: 'Transformation is disabled. Enable it in Settings > Transformation.'
    })
  ).toBeVisible()
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
  await expect(page.locator('#toast-layer .toast-item').filter({ hasText: 'Transformation is disabled.' })).toBeVisible()

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
  await expect(page.getByRole('heading', { name: 'Shortcut Contract' })).toBeVisible()
  await expect(page.locator('.shortcut-combo')).toContainText(['Cmd+Shift+1', 'Cmd+Shift+2', 'Cmd+Shift+3', 'Cmd+Shift+4'])
  await page.locator('[data-route-tab="settings"]').click()

  await page.locator('#settings-restore-defaults').click()
  await expect(page.locator('#settings-save-message')).toHaveText('Defaults restored.')
  await expect(page.locator('#settings-shortcut-start-recording')).toHaveValue('Cmd+Opt+R')
  await expect(page.locator('#settings-shortcut-stop-recording')).toHaveValue('Cmd+Opt+S')
  await expect(page.locator('#settings-shortcut-toggle-recording')).toHaveValue('Cmd+Opt+T')
  await expect(page.locator('#settings-shortcut-cancel-recording')).toHaveValue('Cmd+Opt+C')
  await expect(page.locator('#settings-shortcut-run-transform')).toHaveValue('Cmd+Opt+L')
  await expect(page.locator('#settings-transcript-copy')).toBeChecked()
})

test('persists output matrix toggles and exposes transformation model controls', async ({ page }) => {
  await page.locator('[data-route-tab="settings"]').click()

  await expect(page.locator('#settings-transform-enabled')).toBeVisible()
  await expect(page.locator('#settings-transform-preset-model')).toBeVisible()
  await expect(page.locator('#settings-transform-preset-model')).toHaveValue('gemini-1.5-flash-8b')

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

test('runs live Gemini transformation using configured Google API key', async ({ page, electronApp }) => {
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
  await expect(page.locator('#run-composite-transform')).toBeVisible()

  const result = await page.evaluate(async () => {
    return window.speechToTextApi.runCompositeTransformFromClipboard()
  })

  expect(result.status, `Expected successful transform but got: ${result.message}`).toBe('ok')
  if (result.status === 'ok') {
    expect(result.message.length).toBeGreaterThan(0)
  }
})

test('supports multiple transformation configurations and runs selected config with Google API key', async ({ page, electronApp }) => {
  const googleApiKey = readGoogleApiKey()
  test.skip(googleApiKey.length === 0, 'GOOGLE_APIKEY is not configured in process env or .env')

  await page.locator('[data-route-tab="settings"]').click()

  const keyStatus = await page.evaluate(async () => window.speechToTextApi.getApiKeyStatus())
  expect(keyStatus.google).toBe(true)

  const transformEnabled = page.locator('#settings-transform-enabled')
  if (!(await transformEnabled.isChecked())) {
    await transformEnabled.click()
  }

  await page.locator('#settings-preset-add').click()
  const activeConfigSelect = page.locator('#settings-transform-active-preset')
  const selectedConfigId = await activeConfigSelect.inputValue()
  await page.locator('#settings-transform-preset-name').fill(`Config E2E ${Date.now()}`)
  await page.locator('#settings-user-prompt').fill('Rewrite this text in one concise sentence: {{input}}')
  await page.getByRole('button', { name: 'Save Settings' }).click()
  await expect(page.locator('#settings-save-message')).toHaveText('Settings saved.')

  const settingsAfterSave = await page.evaluate(async () => window.speechToTextApi.getSettings())
  expect(settingsAfterSave.transformation.presets.length).toBeGreaterThan(1)
  expect(settingsAfterSave.transformation.activePresetId).toBe(selectedConfigId)
  expect(settingsAfterSave.transformation.presets.some((preset: { id: string }) => preset.id === selectedConfigId)).toBe(true)

  const sourceText = `E2E multi-config input ${Date.now()}`
  await electronApp.evaluate(({ clipboard }, text) => {
    clipboard.writeText(text)
  }, sourceText)

  const result = await page.evaluate(async () => {
    return window.speechToTextApi.runCompositeTransformFromClipboard()
  })

  expect(result.status, `Expected successful transform but got: ${result.message}`).toBe('ok')
  if (result.status === 'ok') {
    expect(result.message.length).toBeGreaterThan(0)
  }
})

test('launches without history UI when persisted history file is malformed', async () => {
  const profileRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'speech-to-text-e2e-'))
  const xdgConfigHome = path.join(profileRoot, 'xdg-config')
  const historyPath = path.join(xdgConfigHome, 'SpeechToText', 'history', 'records.json')
  fs.mkdirSync(path.dirname(historyPath), { recursive: true })
  fs.writeFileSync(historyPath, '{"version":1,"records":[', 'utf8')

  const app = await launchElectronApp({
    XDG_CONFIG_HOME: xdgConfigHome
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
    XDG_CONFIG_HOME: xdgConfigHome
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
