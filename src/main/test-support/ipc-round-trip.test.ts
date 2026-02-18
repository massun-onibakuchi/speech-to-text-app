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

  it('invoke on unregistered channel throws descriptive error', async () => {
    const harness = new IpcTestHarness()

    await expect(harness.invoke('nonexistent:channel')).rejects.toThrow(
      'No handler registered for channel: nonexistent:channel'
    )
  })
})
