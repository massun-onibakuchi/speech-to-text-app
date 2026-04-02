// src/main/test-support/ipc-round-trip.test.ts
// Integration test establishing the IPC round-trip test pattern.
// Validates that settings can be read and written through the IPC boundary
// without requiring Electron runtime.

import { describe, expect, it } from 'vitest'
import { IpcTestHarness } from './ipc-test-harness'
import { IPC_CHANNELS } from '../../shared/ipc'
import { SettingsService, type SettingsStoreSchema } from '../services/settings-service'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'

const createMockStore = () => {
  const data: SettingsStoreSchema = { settings: structuredClone(DEFAULT_SETTINGS) }
  return {
    get: (key: 'settings') => data[key],
    set: (key: 'settings', value: Settings) => {
      data[key] = value
    }
  } as any
}

describe('IPC round-trip integration', () => {
  it('settings:get returns current settings through IPC boundary', async () => {
    const harness = new IpcTestHarness()
    const settingsService = new SettingsService(createMockStore())

    harness.handle(IPC_CHANNELS.getSettings, async () => settingsService.getSettings())

    const result = await harness.invoke(IPC_CHANNELS.getSettings)
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('settings:set persists and returns updated settings through IPC boundary', async () => {
    const harness = new IpcTestHarness()
    const settingsService = new SettingsService(createMockStore())

    harness.handle(IPC_CHANNELS.getSettings, async () => settingsService.getSettings())
    harness.handle(IPC_CHANNELS.setSettings, async (_event, next) =>
      settingsService.setSettings(next as Settings)
    )

    const base = (await harness.invoke(IPC_CHANNELS.getSettings)) as Settings
    const updated: Settings = {
      ...base,
      recording: { ...base.recording, device: 'test-mic' }
    }
    const saved = (await harness.invoke(IPC_CHANNELS.setSettings, updated)) as Settings

    expect(saved.recording.device).toBe('test-mic')

    // Verify subsequent read reflects the write
    const reloaded = (await harness.invoke(IPC_CHANNELS.getSettings)) as Settings
    expect(reloaded.recording.device).toBe('test-mic')
  })

  it('settings:set round-trips dictionary entries through IPC boundary', async () => {
    const harness = new IpcTestHarness()
    const settingsService = new SettingsService(createMockStore())

    harness.handle(IPC_CHANNELS.getSettings, async () => settingsService.getSettings())
    harness.handle(IPC_CHANNELS.setSettings, async (_event, next) =>
      settingsService.setSettings(next as Settings)
    )

    const base = (await harness.invoke(IPC_CHANNELS.getSettings)) as Settings
    const updated: Settings = {
      ...base,
      correction: {
        ...base.correction,
        dictionary: {
          ...base.correction.dictionary,
          entries: [
            { key: 'teh', value: 'the' },
            { key: 'lang chain', value: 'LangChain' }
          ]
        }
      }
    }

    const saved = (await harness.invoke(IPC_CHANNELS.setSettings, updated)) as Settings
    expect(saved.correction.dictionary.entries).toEqual([
      { key: 'lang chain', value: 'LangChain' },
      { key: 'teh', value: 'the' }
    ])

    const reloaded = (await harness.invoke(IPC_CHANNELS.getSettings)) as Settings
    expect(reloaded.correction.dictionary.entries).toEqual([
      { key: 'lang chain', value: 'LangChain' },
      { key: 'teh', value: 'the' }
    ])
  })

  it('local-cleanup:get-status returns readiness and available models through IPC boundary', async () => {
    const harness = new IpcTestHarness()
    const availableModels = [
      { id: 'qwen3.5:2b', label: 'Qwen 3.5 2B' },
      { id: 'qwen3.5:4b', label: 'Qwen 3.5 4B' }
    ]
    harness.handle(IPC_CHANNELS.getLocalCleanupStatus, async () => ({
      runtime: 'ollama',
      status: { kind: 'ready', message: 'Ollama is available.' },
      availableModels,
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: true
    }))

    const result = await harness.invoke(IPC_CHANNELS.getLocalCleanupStatus)
    expect(result).toEqual({
      runtime: 'ollama',
      status: { kind: 'ready', message: 'Ollama is available.' },
      availableModels,
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: true
    })
  })

  it('local-cleanup:get-status returns server_unreachable when Ollama is not running', async () => {
    const harness = new IpcTestHarness()
    harness.handle(IPC_CHANNELS.getLocalCleanupStatus, async () => ({
      runtime: 'ollama',
      status: { kind: 'server_unreachable', message: 'connect ECONNREFUSED 127.0.0.1:11434' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    }))

    const result = await harness.invoke(IPC_CHANNELS.getLocalCleanupStatus) as { status: { kind: string } }
    expect(result).toMatchObject({
      runtime: 'ollama',
      status: { kind: 'server_unreachable' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    })
  })

  it('local-cleanup:get-status round-trips unknown readiness states through IPC', async () => {
    const harness = new IpcTestHarness()
    harness.handle(IPC_CHANNELS.getLocalCleanupStatus, async () => ({
      runtime: 'ollama',
      status: { kind: 'unknown', message: 'unexpected diagnostics failure' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    }))

    const result = await harness.invoke(IPC_CHANNELS.getLocalCleanupStatus) as { status: { kind: string; message: string } }
    expect(result).toMatchObject({
      runtime: 'ollama',
      status: { kind: 'unknown', message: 'unexpected diagnostics failure' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    })
  })

  it('local-cleanup:get-status round-trips auth_error readiness states through IPC', async () => {
    const harness = new IpcTestHarness()
    harness.handle(IPC_CHANNELS.getLocalCleanupStatus, async () => ({
      runtime: 'ollama',
      status: { kind: 'auth_error', message: 'Ollama request failed with status 401' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    }))

    const result = await harness.invoke(IPC_CHANNELS.getLocalCleanupStatus) as { status: { kind: string; message: string } }
    expect(result).toMatchObject({
      runtime: 'ollama',
      status: { kind: 'auth_error', message: 'Ollama request failed with status 401' },
      availableModels: [],
      selectedModelId: 'qwen3.5:2b',
      selectedModelInstalled: false
    })
  })

  it('invoke on unregistered channel throws descriptive error', async () => {
    const harness = new IpcTestHarness()

    await expect(harness.invoke('nonexistent:channel')).rejects.toThrow(
      'No handler registered for channel: nonexistent:channel'
    )
  })

  it('secrets:delete-api-key clears provider status through IPC boundary', async () => {
    const harness = new IpcTestHarness()
    const status = { groq: true, elevenlabs: false, google: false }

    harness.handle(IPC_CHANNELS.getApiKeyStatus, async () => ({ ...status }))
    harness.handle(IPC_CHANNELS.deleteApiKey, async (_event, provider) => {
      status[provider as 'groq' | 'elevenlabs' | 'google'] = false
    })

    expect(await harness.invoke(IPC_CHANNELS.getApiKeyStatus)).toEqual({
      groq: true,
      elevenlabs: false,
      google: false
    })

    await harness.invoke(IPC_CHANNELS.deleteApiKey, 'groq')

    expect(await harness.invoke(IPC_CHANNELS.getApiKeyStatus)).toEqual({
      groq: false,
      elevenlabs: false,
      google: false
    })
  })
})
