/**
 * Where: src/main/services/hotkey-service.test.ts
 * What:  Unit tests for shortcut accelerator mapping and lifecycle behavior.
 * Why:   Protect Phase 3C requirements: live incremental re-register, failure
 *        fallback, and shortcut command semantics.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { RecordingCommand } from '../../shared/ipc'
import { HotkeyService, toElectronAccelerator } from './hotkey-service'

const DEFAULT_ACCELERATORS = {
  startRecording: 'CommandOrControl+Alt+R',
  runTransform: 'CommandOrControl+Alt+L',
  runTransformOnSelection: 'CommandOrControl+Alt+K',
  pickTransformation: 'CommandOrControl+Alt+P',
  changeTransformationDefault: 'CommandOrControl+Alt+M'
} as const

const getRegisteredCallback = (
  callbacksByAccelerator: ReadonlyMap<string, () => void>,
  accelerator: string
): (() => void) => {
  const callback = callbacksByAccelerator.get(accelerator)
  if (!callback) {
    throw new Error(`Missing registered callback for accelerator: ${accelerator}`)
  }
  return callback
}

describe('toElectronAccelerator', () => {
  it('converts renderer shortcut format to Electron accelerator', () => {
    expect(toElectronAccelerator('Cmd+Opt+L')).toBe('CommandOrControl+Alt+L')
    expect(toElectronAccelerator('Ctrl+Shift+P')).toBe('Control+Shift+P')
  })

  it('returns null for empty values', () => {
    expect(toElectronAccelerator('')).toBeNull()
    expect(toElectronAccelerator('  ')).toBeNull()
  })
})

describe('HotkeyService', () => {
  const makeSettings = (): Settings => ({
    ...DEFAULT_SETTINGS,
    shortcuts: {
      ...DEFAULT_SETTINGS.shortcuts
    },
    transformation: {
      ...DEFAULT_SETTINGS.transformation,
      defaultPresetId: 'a',
      lastPickedPresetId: 'a',
      presets: [
        { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'a', name: 'A' },
        { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'b', name: 'B' }
      ]
    }
  })

  it('registers all recording and transformation shortcuts from settings', () => {
    const register = vi.fn(() => true)
    const unregisterAll = vi.fn()
    const settings = makeSettings()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()

    expect(unregisterAll).toHaveBeenCalledTimes(0)
    expect(register).toHaveBeenCalledTimes(8)
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+R', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+S', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+T', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+C', expect.any(Function))
  })

  it('re-registers only changed shortcuts without calling unregisterAll', () => {
    const register = vi.fn(() => true)
    const unregister = vi.fn()
    const unregisterAll = vi.fn()
    const settings = makeSettings()
    const service = new HotkeyService({
      globalShortcut: { register, unregister, unregisterAll },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    expect(register).toHaveBeenCalledTimes(8)

    settings.shortcuts.startRecording = 'Ctrl+Shift+1'
    service.registerFromSettings()

    // Only changed binding re-registers.
    expect(register).toHaveBeenCalledTimes(9)
    expect(register).toHaveBeenLastCalledWith('Control+Shift+1', expect.any(Function))
    expect(unregister).toHaveBeenCalledWith('CommandOrControl+Alt+R')
    expect(unregisterAll).toHaveBeenCalledTimes(0)
  })

  it('keeps existing shortcut active when hot-swap registration fails', () => {
    const register = vi.fn(() => true)
    const unregister = vi.fn()
    const onShortcutError = vi.fn()
    const settings = makeSettings()

    const service = new HotkeyService({
      globalShortcut: { register, unregister, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected'),
      onShortcutError
    })

    service.registerFromSettings()
    settings.shortcuts.startRecording = 'Ctrl+Shift+1'
    // Fail only the follow-up re-registration for the changed shortcut.
    register.mockImplementationOnce(() => false)
    service.registerFromSettings()

    // Previous accelerator is kept when new registration fails.
    expect(unregister).not.toHaveBeenCalledWith('CommandOrControl+Alt+R')
    expect(onShortcutError).toHaveBeenCalledWith(
      expect.objectContaining({
        combo: 'Ctrl+Shift+1',
        accelerator: 'Control+Shift+1',
        message: 'Global shortcut registration failed.'
      })
    )
  })

  it('pick-and-run runs transform with picked preset and persists lastPickedPresetId only', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const unregisterAll = vi.fn()

    const setSettings = vi.fn()
    const runCompositeFromClipboardWithPreset = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const runCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const pickProfile = vi.fn(async () => 'b')
    const settings = makeSettings()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll },
      settingsService: { getSettings: () => settings, setSettings },
      commandRouter: {
        runCompositeFromClipboard,
        runCompositeFromClipboardWithPreset,
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile,
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()

    const pickAndRun = getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.pickTransformation)
    pickAndRun()
    await Promise.resolve()

    expect(pickProfile).toHaveBeenCalledWith(settings.transformation.presets, 'a')
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          lastPickedPresetId: 'b',
          defaultPresetId: 'a'
        })
      })
    )
    // The picked preset id is passed directly to the router for this request only.
    expect(runCompositeFromClipboardWithPreset).toHaveBeenCalledWith('b')
    expect(runCompositeFromClipboard).not.toHaveBeenCalled()
  })

  it('pick-and-run prioritizes lastPickedPresetId as picker focus over defaultPresetId', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const settings = makeSettings()
    settings.transformation.defaultPresetId = 'b'
    settings.transformation.lastPickedPresetId = 'a'
    const pickProfile = vi.fn(async () => null)

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile,
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.pickTransformation)()
    await Promise.resolve()

    expect(pickProfile).toHaveBeenCalledWith(settings.transformation.presets, 'a')
  })

  it('pick-and-run does nothing when picker is cancelled', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const setSettings = vi.fn()
    const runCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const runCompositeFromClipboardWithPreset = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings },
      commandRouter: {
        runCompositeFromClipboard,
        runCompositeFromClipboardWithPreset,
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => null),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.pickTransformation)()
    await Promise.resolve()

    expect(setSettings).not.toHaveBeenCalled()
    expect(runCompositeFromClipboard).not.toHaveBeenCalled()
    expect(runCompositeFromClipboardWithPreset).not.toHaveBeenCalled()
  })

  it('ignores duplicate pick-and-run triggers while a picker selection is in-flight', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const resolvePickRef: { current: ((value: string | null) => void) | null } = { current: null }
    const pickProfile = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolvePickRef.current = resolve
        })
    )
    const runCompositeFromClipboardWithPreset = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset,
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile,
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    const pickAndRun = getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.pickTransformation)
    pickAndRun()
    pickAndRun()
    expect(pickProfile).toHaveBeenCalledTimes(1)

    if (!resolvePickRef.current) {
      throw new Error('Expected picker promise resolver to be set')
    }
    resolvePickRef.current('b')
    await Promise.resolve()
    await Promise.resolve()
    expect(runCompositeFromClipboardWithPreset).toHaveBeenCalledTimes(1)
    expect(runCompositeFromClipboardWithPreset).toHaveBeenCalledWith('b')
  })

  it('pick-and-run falls back to default profile when remembered last-picked profile is stale', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const settings = makeSettings()
    settings.transformation.lastPickedPresetId = 'missing-id'
    settings.transformation.defaultPresetId = 'b'
    const pickProfile = vi.fn(async () => null)

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile,
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.pickTransformation)()
    await Promise.resolve()

    expect(pickProfile).toHaveBeenCalledWith(settings.transformation.presets, 'b')
  })

  it('change-default toggles to the other profile directly when exactly two profiles exist', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const setSettings = vi.fn()
    const settings = makeSettings()
    settings.transformation.defaultPresetId = 'a'
    settings.transformation.lastPickedPresetId = 'a'
    const runCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const runDefaultCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const onCompositeResult = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings },
      commandRouter: {
        runCompositeFromClipboard,
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard,
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'b'),
      readSelectionText: vi.fn(async () => 'selected'),
      onCompositeResult
    })

    service.registerFromSettings()

    const changeDefault = getRegisteredCallback(
      callbacksByAccelerator,
      DEFAULT_ACCELERATORS.changeTransformationDefault
    )
    changeDefault()
    await Promise.resolve()

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          defaultPresetId: 'b'
        })
      })
    )
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          lastPickedPresetId: 'a'
        })
      })
    )
    expect(runCompositeFromClipboard).not.toHaveBeenCalled()
    expect(runCompositeFromSelection).not.toHaveBeenCalled()
    expect(runDefaultCompositeFromClipboard).not.toHaveBeenCalled()
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        message: expect.stringContaining('Default transformation profile changed')
      })
    )
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('"B"')
      })
    )
  })

  it('change-default opens picker for 3+ profiles and updates default only', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const setSettings = vi.fn()
    const settings = makeSettings()
    settings.transformation.defaultPresetId = 'b'
    settings.transformation.lastPickedPresetId = 'a'
    settings.transformation.presets = [
      { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'a', name: 'A' },
      { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'b', name: 'B' },
      { ...DEFAULT_SETTINGS.transformation.presets[0], id: 'c', name: 'C' }
    ]
    const pickProfile = vi.fn(async () => 'c')
    const onCompositeResult = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile,
      readSelectionText: vi.fn(async () => 'selected'),
      onCompositeResult
    })

    service.registerFromSettings()

    const changeDefault = getRegisteredCallback(
      callbacksByAccelerator,
      DEFAULT_ACCELERATORS.changeTransformationDefault
    )
    changeDefault()
    await Promise.resolve()

    expect(pickProfile).toHaveBeenCalledWith(settings.transformation.presets, 'b')
    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          defaultPresetId: 'c',
          lastPickedPresetId: 'a'
        })
      })
    )
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        message: expect.stringContaining('"C"')
      })
    )
  })

  it('change-default reports actionable error when no preset is available', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const settings = makeSettings()
    settings.transformation.presets = []
    settings.transformation.defaultPresetId = ''
    settings.transformation.lastPickedPresetId = null

    const setSettings = vi.fn()
    const onCompositeResult = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected'),
      onCompositeResult
    })

    service.registerFromSettings()

    const changeDefault = getRegisteredCallback(
      callbacksByAccelerator,
      DEFAULT_ACCELERATORS.changeTransformationDefault
    )
    changeDefault()
    await Promise.resolve()

    expect(setSettings).not.toHaveBeenCalled()
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('No transformation preset')
      })
    )
  })

  it('executes recording command when recording shortcut callback fires', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const runRecordingCommand = vi.fn(async (_command: RecordingCommand) => undefined)
    const settings = makeSettings()
    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand,
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    const startRecordingShortcut = getRegisteredCallback(
      callbacksByAccelerator,
      DEFAULT_ACCELERATORS.startRecording
    )
    startRecordingShortcut()
    await Promise.resolve()

    expect(runRecordingCommand).toHaveBeenCalledWith('startRecording')
  })

  it('uses recording shortcut combos from settings', () => {
    const register = vi.fn(() => true)
    const settings = makeSettings()
    settings.shortcuts.startRecording = 'Ctrl+Shift+1'
    settings.shortcuts.stopRecording = 'Ctrl+Shift+2'
    settings.shortcuts.toggleRecording = 'Ctrl+Shift+3'
    settings.shortcuts.cancelRecording = 'Ctrl+Shift+4'

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()

    expect(register).toHaveBeenCalledWith('Control+Shift+1', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+2', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+3', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+4', expect.any(Function))
  })

  it('reports callback failures through onShortcutError', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const onShortcutError = vi.fn()
    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => {
        throw new Error('No active renderer window is available to handle recording commands.')
      }),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected'),
      onShortcutError
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.startRecording)()
    await Promise.resolve()
    await Promise.resolve()

    expect(onShortcutError).toHaveBeenCalledWith(
      expect.objectContaining({
        combo: 'Cmd+Opt+R',
        accelerator: 'CommandOrControl+Alt+R',
        message: 'No active renderer window is available to handle recording commands.'
      })
    )
  })

  it('does not report errors when recording shortcut callback succeeds', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })

    const onShortcutError = vi.fn()
    const runRecordingCommand = vi.fn(async () => undefined)
    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand,
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected'),
      onShortcutError
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.startRecording)()
    await Promise.resolve()

    expect(runRecordingCommand).toHaveBeenCalledWith('startRecording')
    expect(onShortcutError).not.toHaveBeenCalled()
  })

  it('reports registration failures through onShortcutError', () => {
    const register = vi.fn(() => false)
    const onShortcutError = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected'),
      onShortcutError
    })

    service.registerFromSettings()

    expect(onShortcutError).toHaveBeenCalled()
    expect(onShortcutError).toHaveBeenCalledWith(
      expect.objectContaining({
        combo: 'Cmd+Opt+R',
        accelerator: 'CommandOrControl+Alt+R',
        message: 'Global shortcut registration failed.'
      })
    )
  })

  it('run transform shortcut uses default-profile command router path', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const runDefaultCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard,
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected')
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransform)()
    await Promise.resolve()

    expect(runDefaultCompositeFromClipboard).toHaveBeenCalledTimes(1)
  })

  it('run selection shortcut reports actionable feedback when no text is selected', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const onCompositeResult = vi.fn()
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => null),
      onCompositeResult
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()

    expect(runCompositeFromSelection).not.toHaveBeenCalled()
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('No text selected')
      })
    )
  })

  it('run selection shortcut treats whitespace-only selection as empty', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const onCompositeResult = vi.fn()
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => '   '),
      onCompositeResult
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()

    expect(runCompositeFromSelection).not.toHaveBeenCalled()
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('No text selected')
      })
    )
  })

  it('run selection shortcut dispatches selection transformation when text exists', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'enqueued' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected text')
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()

    expect(runCompositeFromSelection).toHaveBeenCalledWith('selected text')
  })

  it('ignores duplicate run-selection triggers while selection read is in-flight', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'enqueued' }))
    const resolveSelectionRef: { current: ((value: string | null) => void) | null } = { current: null }
    const readSelectionText = vi.fn(
      async () =>
        await new Promise<string | null>((resolve) => {
          resolveSelectionRef.current = resolve
        })
    )

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText
    })

    service.registerFromSettings()
    const runSelection = getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)
    runSelection()
    runSelection()

    expect(readSelectionText).toHaveBeenCalledTimes(1)
    if (!resolveSelectionRef.current) {
      throw new Error('Selection resolver was not captured.')
    }
    resolveSelectionRef.current('selected text')
    await Promise.resolve()
    await Promise.resolve()

    expect(runCompositeFromSelection).toHaveBeenCalledTimes(1)
    expect(runCompositeFromSelection).toHaveBeenCalledWith('selected text')
  })

  it('run selection shortcut reports read-failure feedback when selection read throws', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const onCompositeResult = vi.fn()
    const onShortcutError = vi.fn()
    const runCompositeFromSelection = vi.fn(async () => ({ status: 'ok' as const, message: 'enqueued' }))

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => {
        throw new Error('osascript failed')
      }),
      onCompositeResult,
      onShortcutError
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()

    expect(runCompositeFromSelection).not.toHaveBeenCalled()
    expect(onCompositeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error',
        message: expect.stringContaining('Failed to read selected text')
      })
    )
    expect(onShortcutError).not.toHaveBeenCalled()
  })

  it('run selection shortcut remains no-op-safe when read fails and no composite callback is wired', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const onShortcutError = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection: vi.fn(async () => ({ status: 'ok' as const, message: 'enqueued' }))
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => {
        throw new Error('osascript failed')
      }),
      onShortcutError
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()

    expect(onShortcutError).not.toHaveBeenCalled()
  })

  it('run selection shortcut forwards router failures to shortcut error handler', async () => {
    const callbacksByAccelerator = new Map<string, () => void>()
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacksByAccelerator.set(_acc, callback)
      return true
    })
    const onShortcutError = vi.fn()
    const runCompositeFromSelection = vi.fn(async () => {
      throw new Error('router transform failure')
    })

    const service = new HotkeyService({
      globalShortcut: { register, unregister: vi.fn(), unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      commandRouter: {
        runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromClipboardWithPreset: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runDefaultCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })),
        runCompositeFromSelection
      },
      runRecordingCommand: vi.fn(async () => undefined),
      pickProfile: vi.fn(async () => 'a'),
      readSelectionText: vi.fn(async () => 'selected text'),
      onShortcutError
    })

    service.registerFromSettings()
    getRegisteredCallback(callbacksByAccelerator, DEFAULT_ACCELERATORS.runTransformOnSelection)()
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runCompositeFromSelection).toHaveBeenCalledWith('selected text')
    expect(onShortcutError).toHaveBeenCalledWith(
      expect.objectContaining({
        combo: 'Cmd+Opt+K',
        accelerator: 'CommandOrControl+Alt+K',
        message: 'router transform failure'
      })
    )
  })
})
