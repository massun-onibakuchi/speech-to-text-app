import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { RecordingCommand } from '../../shared/ipc'
import { HotkeyService, toElectronAccelerator } from './hotkey-service'

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
      activePresetId: 'a',
      defaultPresetId: 'a',
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
      globalShortcut: { register, unregisterAll },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand: vi.fn(async () => undefined)
    })

    service.registerFromSettings()

    expect(unregisterAll).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledTimes(7)
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+R', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+S', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+T', expect.any(Function))
    expect(register).toHaveBeenCalledWith('CommandOrControl+Alt+C', expect.any(Function))
  })

  it('pick-and-run updates active preset and runs transform', async () => {
    const callbacks: Array<() => void> = []
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacks.push(callback)
      return true
    })
    const unregisterAll = vi.fn()

    const setSettings = vi.fn()
    const runCompositeFromClipboard = vi.fn(async () => ({ status: 'ok' as const, message: 'x' }))
    const settings = makeSettings()

    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll },
      settingsService: { getSettings: () => settings, setSettings },
      transformationOrchestrator: { runCompositeFromClipboard },
      runRecordingCommand: vi.fn(async () => undefined)
    })

    service.registerFromSettings()

    const pickAndRun = callbacks[5]
    pickAndRun()
    await Promise.resolve()

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          activePresetId: 'b'
        })
      })
    )
    expect(runCompositeFromClipboard).toHaveBeenCalled()
  })

  it('change-default updates default preset to active preset', async () => {
    const callbacks: Array<() => void> = []
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacks.push(callback)
      return true
    })

    const setSettings = vi.fn()
    const settings = makeSettings()

    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand: vi.fn(async () => undefined)
    })

    service.registerFromSettings()

    const changeDefault = callbacks[6]
    changeDefault()
    await Promise.resolve()

    expect(setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        transformation: expect.objectContaining({
          defaultPresetId: 'a'
        })
      })
    )
  })

  it('executes recording command when recording shortcut callback fires', async () => {
    const callbacks: Array<() => void> = []
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacks.push(callback)
      return true
    })

    const runRecordingCommand = vi.fn(async (_command: RecordingCommand) => undefined)
    const settings = makeSettings()
    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand
    })

    service.registerFromSettings()
    const startRecordingShortcut = callbacks[0]
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
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => settings, setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand: vi.fn(async () => undefined)
    })

    service.registerFromSettings()

    expect(register).toHaveBeenCalledWith('Control+Shift+1', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+2', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+3', expect.any(Function))
    expect(register).toHaveBeenCalledWith('Control+Shift+4', expect.any(Function))
  })

  it('reports callback failures through onShortcutError', async () => {
    const callbacks: Array<() => void> = []
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacks.push(callback)
      return true
    })

    const onShortcutError = vi.fn()
    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand: vi.fn(async () => {
        throw new Error('No active renderer window is available to handle recording commands.')
      }),
      onShortcutError
    })

    service.registerFromSettings()
    callbacks[0]()
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
    const callbacks: Array<() => void> = []
    const register = vi.fn((_acc: string, callback: () => void) => {
      callbacks.push(callback)
      return true
    })

    const onShortcutError = vi.fn()
    const runRecordingCommand = vi.fn(async () => undefined)
    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand,
      onShortcutError
    })

    service.registerFromSettings()
    callbacks[0]()
    await Promise.resolve()

    expect(runRecordingCommand).toHaveBeenCalledWith('startRecording')
    expect(onShortcutError).not.toHaveBeenCalled()
  })

  it('reports registration failures through onShortcutError', () => {
    const register = vi.fn(() => false)
    const onShortcutError = vi.fn()

    const service = new HotkeyService({
      globalShortcut: { register, unregisterAll: vi.fn() },
      settingsService: { getSettings: () => makeSettings(), setSettings: vi.fn() },
      transformationOrchestrator: { runCompositeFromClipboard: vi.fn(async () => ({ status: 'ok' as const, message: 'x' })) },
      runRecordingCommand: vi.fn(async () => undefined),
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
})
