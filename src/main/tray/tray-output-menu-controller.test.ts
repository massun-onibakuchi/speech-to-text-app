/**
 * Where: src/main/tray/tray-output-menu-controller.test.ts
 * What:  Unit tests for tray-driven output settings persistence and refresh.
 * Why:   Guard the highest-risk integration seam without mocking the full
 *        register-handlers composition root.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { TrayOutputMenuController } from './tray-output-menu-controller'

describe('TrayOutputMenuController', () => {
  it('persists output mode changes, refreshes the tray, and broadcasts settings updates', () => {
    let currentSettings = structuredClone(DEFAULT_SETTINGS)
    const setSettings = vi.fn((nextSettings: typeof DEFAULT_SETTINGS) => {
      currentSettings = structuredClone(nextSettings)
      return nextSettings
    })
    const setTrayContextMenu = vi.fn()
    const broadcastSettingsUpdated = vi.fn()

    const controller = new TrayOutputMenuController({
      settingsService: {
        getSettings: () => structuredClone(currentSettings),
        setSettings
      },
      setTrayContextMenu,
      openSettings: vi.fn(),
      broadcastSettingsUpdated
    })

    controller.refresh()
    const firstTemplate = setTrayContextMenu.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    const modeItems = firstTemplate[1]?.submenu as Array<{ click?: () => void }>
    modeItems[0]?.click?.()

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          selectedTextSource: 'transcript'
        })
      })
    )
    expect(setTrayContextMenu).toHaveBeenCalledTimes(2)
    expect(broadcastSettingsUpdated).toHaveBeenCalledTimes(1)
  })

  it('toggles output destinations through the shared synchronized output model', () => {
    let currentSettings = structuredClone(DEFAULT_SETTINGS)
    const setSettings = vi.fn((nextSettings: typeof DEFAULT_SETTINGS) => {
      currentSettings = structuredClone(nextSettings)
      return nextSettings
    })
    const setTrayContextMenu = vi.fn()

    const controller = new TrayOutputMenuController({
      settingsService: {
        getSettings: () => structuredClone(currentSettings),
        setSettings
      },
      setTrayContextMenu,
      openSettings: vi.fn(),
      broadcastSettingsUpdated: vi.fn()
    })

    controller.refresh()
    const template = setTrayContextMenu.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    const destinationItems = template[2]?.submenu as Array<{ click?: () => void }>
    destinationItems[1]?.click?.()

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          transcript: expect.objectContaining({
            pasteAtCursor: true
          }),
          transformed: expect.objectContaining({
            pasteAtCursor: true
          })
        })
      })
    )
  })

  it('refreshes tray check state after renderer-owned settings saves without broadcasting back out', () => {
    const currentSettings = structuredClone(DEFAULT_SETTINGS)
    currentSettings.output.selectedTextSource = 'transcript'
    const setTrayContextMenu = vi.fn()
    const broadcastSettingsUpdated = vi.fn()

    const controller = new TrayOutputMenuController({
      settingsService: {
        getSettings: () => structuredClone(currentSettings),
        setSettings: vi.fn()
      },
      setTrayContextMenu,
      openSettings: vi.fn(),
      broadcastSettingsUpdated
    })

    controller.handleRendererSettingsSaved()

    const template = setTrayContextMenu.mock.calls.at(-1)?.[0] as Array<Record<string, unknown>>
    const modeItems = template[1]?.submenu as Array<Record<string, unknown>>
    expect(modeItems[0]?.checked).toBe(true)
    expect(modeItems[1]?.checked).toBe(false)
    expect(broadcastSettingsUpdated).not.toHaveBeenCalled()
  })
})
