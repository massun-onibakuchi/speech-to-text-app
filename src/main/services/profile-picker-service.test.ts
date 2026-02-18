// src/main/services/profile-picker-service.test.ts
// Tests for ProfilePickerService: native context menu profile picker.

import { describe, expect, it, vi } from 'vitest'
import { ProfilePickerService, type MenuFactoryLike, type MenuItemTemplate } from './profile-picker-service'
import type { TransformationPreset } from '../../shared/domain'

const makePreset = (id: string, name: string): TransformationPreset => ({
  id,
  name,
  provider: 'google',
  model: 'gemini-2.5-flash',
  systemPrompt: '',
  userPrompt: '',
  shortcut: ''
})

/** Creates a mock MenuFactory that captures built templates and simulates user behavior. */
const createMockMenuFactory = (
  simulateAction: (items: MenuItemTemplate[]) => void
): MenuFactoryLike => ({
  buildFromTemplate: vi.fn((template: MenuItemTemplate[]) => ({
    popup: vi.fn((options?: { callback?: () => void }) => {
      // Simulate user interaction asynchronously (like real macOS menus)
      setTimeout(() => {
        simulateAction(template)
        options?.callback?.()
      }, 0)
    })
  }))
})

describe('ProfilePickerService', () => {
  it('returns picked profile id when user clicks an item', async () => {
    // Simulate user clicking the second item
    const factory = createMockMenuFactory((items) => {
      items[1].click?.()
    })

    const service = new ProfilePickerService(factory)
    const result = await service.pickProfile(
      [makePreset('p1', 'First'), makePreset('p2', 'Second')],
      'p1'
    )

    expect(result).toBe('p2')
  })

  it('returns null when user dismisses the menu', async () => {
    // Simulate user dismissing (no click, just callback)
    const factory = createMockMenuFactory(() => {
      // No item clicked
    })

    const service = new ProfilePickerService(factory)
    const result = await service.pickProfile(
      [makePreset('p1', 'First'), makePreset('p2', 'Second')],
      'p1'
    )

    expect(result).toBeNull()
  })

  it('returns null when presets array is empty', async () => {
    const factory = createMockMenuFactory(() => {})
    const service = new ProfilePickerService(factory)

    const result = await service.pickProfile([], 'anything')
    expect(result).toBeNull()
  })

  it('auto-selects when only one profile exists', async () => {
    const factory = createMockMenuFactory(() => {})
    const service = new ProfilePickerService(factory)

    const result = await service.pickProfile([makePreset('only', 'Only One')], 'only')
    expect(result).toBe('only')

    // Menu should NOT have been built (no popup needed)
    expect(factory.buildFromTemplate).not.toHaveBeenCalled()
  })

  it('marks current active profile as checked', async () => {
    let capturedTemplate: MenuItemTemplate[] = []
    const factory: MenuFactoryLike = {
      buildFromTemplate: vi.fn((template: MenuItemTemplate[]) => {
        capturedTemplate = template
        return {
          popup: vi.fn((options?: { callback?: () => void }) => {
            setTimeout(() => options?.callback?.(), 0)
          })
        }
      })
    }

    const service = new ProfilePickerService(factory)
    await service.pickProfile(
      [makePreset('p1', 'First'), makePreset('p2', 'Second'), makePreset('p3', 'Third')],
      'p2'
    )

    expect(capturedTemplate[0].checked).toBe(false)
    expect(capturedTemplate[1].checked).toBe(true)
    expect(capturedTemplate[2].checked).toBe(false)
  })

  it('uses profile name as menu label', async () => {
    let capturedTemplate: MenuItemTemplate[] = []
    const factory: MenuFactoryLike = {
      buildFromTemplate: vi.fn((template: MenuItemTemplate[]) => {
        capturedTemplate = template
        return {
          popup: vi.fn((options?: { callback?: () => void }) => {
            setTimeout(() => options?.callback?.(), 0)
          })
        }
      })
    }

    const service = new ProfilePickerService(factory)
    await service.pickProfile(
      [makePreset('p1', 'Email Rewrite'), makePreset('p2', 'Code Review')],
      'p1'
    )

    expect(capturedTemplate[0].label).toBe('Email Rewrite')
    expect(capturedTemplate[1].label).toBe('Code Review')
  })
})
