/**
 * Where: src/main/tray/tray-menu-template.test.ts
 * What:  Unit tests for the native tray menu template builder.
 * Why:   Guard menu structure, checked-state rendering, and click wiring for
 *        the menu-bar output controls without needing full Electron startup.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { buildDefaultTrayMenuTemplate, buildTrayMenuTemplate } from './tray-menu-template'

describe('buildDefaultTrayMenuTemplate', () => {
  it('returns the existing Settings and Quit menu structure', () => {
    const openSettings = vi.fn()

    const template = buildDefaultTrayMenuTemplate({ openSettings })

    expect(template[0]?.label).toBe('Settings...')
    expect(template[1]?.type).toBe('separator')
    expect(template[2]?.label).toBe('Quit')
  })
})

describe('buildTrayMenuTemplate', () => {
  it('renders output mode radios and destination checkboxes from persisted settings', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.output.selectedTextSource = 'transcript'
    settings.output.transcript.copyToClipboard = false
    settings.output.transcript.pasteAtCursor = true
    settings.output.transformed.copyToClipboard = false
    settings.output.transformed.pasteAtCursor = true

    const template = buildTrayMenuTemplate(settings, {
      openSettings: vi.fn(),
      setOutputSource: vi.fn(),
      toggleDestination: vi.fn()
    })

    expect(template[0]?.label).toBe('Settings...')
    expect(template[1]?.label).toBe('Output Mode')
    expect(template[2]?.label).toBe('Output Destinations')
    expect(template[3]?.type).toBe('separator')
    expect(template[4]?.label).toBe('Quit')

    const modeItems = template[1]?.submenu as Array<Record<string, unknown>>
    expect(modeItems[0]?.label).toBe('Raw dictation')
    expect(modeItems[0]?.type).toBe('radio')
    expect(modeItems[0]?.checked).toBe(true)
    expect(modeItems[1]?.checked).toBe(false)

    const destinationItems = template[2]?.submenu as Array<Record<string, unknown>>
    expect(destinationItems[0]?.label).toBe('Copy to clipboard')
    expect(destinationItems[0]?.type).toBe('checkbox')
    expect(destinationItems[0]?.checked).toBe(false)
    expect(destinationItems[1]?.checked).toBe(true)
  })

  it('wires menu item clicks to the provided tray actions', () => {
    const openSettings = vi.fn()
    const setOutputSource = vi.fn()
    const toggleDestination = vi.fn()

    const template = buildTrayMenuTemplate(DEFAULT_SETTINGS, {
      openSettings,
      setOutputSource,
      toggleDestination
    })

    ;(template[0]?.click as (() => void) | undefined)?.()
    const modeItems = template[1]?.submenu as Array<{ click?: () => void }>
    modeItems[0]?.click?.()
    const destinationItems = template[2]?.submenu as Array<{ click?: () => void }>
    destinationItems[1]?.click?.()

    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(setOutputSource).toHaveBeenCalledWith('transcript')
    expect(toggleDestination).toHaveBeenCalledWith('pasteAtCursor')
  })
})
