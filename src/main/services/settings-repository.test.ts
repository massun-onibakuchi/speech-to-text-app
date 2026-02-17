// src/main/services/settings-repository.test.ts
// Tests for InMemorySettingsRepository: defaults, clone isolation, persistence.

import { describe, expect, it } from 'vitest'
import { InMemorySettingsRepository } from './settings-repository'
import { DEFAULT_SETTINGS } from '../../shared/domain'

describe('InMemorySettingsRepository', () => {
  it('loads default settings when no initial value provided', () => {
    const repo = new InMemorySettingsRepository()
    expect(repo.load()).toEqual(DEFAULT_SETTINGS)
  })

  it('loads provided initial settings', () => {
    const custom = { ...DEFAULT_SETTINGS, recording: { ...DEFAULT_SETTINGS.recording, device: 'custom' } }
    const repo = new InMemorySettingsRepository(custom)
    expect(repo.load().recording.device).toBe('custom')
  })

  it('returns cloned data — not shared reference', () => {
    const repo = new InMemorySettingsRepository()
    const a = repo.load()
    const b = repo.load()
    expect(a).not.toBe(b)
    expect(a).toEqual(b)
  })

  it('persists saved settings', () => {
    const repo = new InMemorySettingsRepository()
    const modified = {
      ...repo.load(),
      recording: { ...repo.load().recording, device: 'test-mic' }
    }
    repo.save(modified)
    expect(repo.load().recording.device).toBe('test-mic')
  })

  it('save does not retain reference to caller object', () => {
    const repo = new InMemorySettingsRepository()
    const settings = repo.load()
    settings.recording.device = 'written'
    repo.save(settings)
    settings.recording.device = 'mutated-after-save'
    expect(repo.load().recording.device).toBe('written')
  })

  it('constructor does not retain reference to initial object', () => {
    const initial = { ...DEFAULT_SETTINGS, recording: { ...DEFAULT_SETTINGS.recording, device: 'init' } }
    const repo = new InMemorySettingsRepository(initial)
    initial.recording.device = 'mutated-after-construction'
    expect(repo.load().recording.device).toBe('init')
  })
})
