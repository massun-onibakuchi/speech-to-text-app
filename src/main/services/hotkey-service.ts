/**
 * Where: src/main/services/hotkey-service.ts
 * What:  Global shortcut lifecycle manager: register, incremental re-register,
 *        and dispatch to recording/transformation commands.
 * Why:   Spec §4.2 requires shortcut updates to apply live without restart and
 *        without creating a full unregister/re-register gap window.
 */

import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import type { TransformationPreset } from '../../shared/domain'
import { SettingsService } from './settings-service'
import type { CommandRouter } from '../core/command-router'
import { SELECTION_EMPTY_MESSAGE, SELECTION_READ_FAILED_MESSAGE } from '../core/transformation-error-messages'
import type { CompositeTransformResult, RecordingCommand } from '../../shared/ipc'

interface GlobalShortcutLike {
  register: (accelerator: string, callback: () => void) => boolean
  unregister: (accelerator: string) => void
  unregisterAll: () => void
}

interface ShortcutBinding {
  readonly action: ShortcutAction
  readonly combo: string
  readonly run: () => Promise<void>
}

type ShortcutAction =
  | 'toggleRecording'
  | 'cancelRecording'
  | 'runTransform'
  | 'runTransformOnSelection'
  | 'pickTransformation'
  | 'changeTransformationDefault'

interface RegisteredShortcut {
  readonly combo: string
  readonly accelerator: string
}

interface HotkeyDependencies {
  globalShortcut: GlobalShortcutLike
  settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  commandRouter: Pick<CommandRouter, 'runCompositeFromClipboard' | 'runCompositeFromClipboardWithPreset' | 'runDefaultCompositeFromClipboard' | 'runCompositeFromSelection'>
  runRecordingCommand: (command: RecordingCommand) => Promise<void>
  pickProfile: (presets: readonly TransformationPreset[], focusedPresetId: string) => Promise<string | null>
  readSelectionText: () => Promise<string | null>
  onCompositeResult?: (result: CompositeTransformResult) => void
  onShortcutError?: (payload: { combo: string; accelerator: string; message: string }) => void
}

const toElectronAccelerator = (combo: string): string | null => {
  const parts = combo
    .split('+')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  if (parts.length === 0) {
    return null
  }

  const mapped = parts.map((part, index) => {
    const normalized = part.toLowerCase()

    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      return 'CommandOrControl'
    }

    if (normalized === 'ctrl' || normalized === 'control') {
      return 'Control'
    }

    if (normalized === 'opt' || normalized === 'option' || normalized === 'alt') {
      return 'Alt'
    }

    if (normalized === 'shift') {
      return 'Shift'
    }

    if (index === parts.length - 1) {
      if (normalized.length === 1) {
        return normalized.toUpperCase()
      }
      return normalized[0].toUpperCase() + normalized.slice(1)
    }

    return null
  })

  if (mapped.some((part) => part === null)) {
    return null
  }

  return mapped.join('+')
}

export class HotkeyService {
  private readonly globalShortcut: GlobalShortcutLike
  private readonly settingsService: Pick<SettingsService, 'getSettings' | 'setSettings'>
  private readonly commandRouter: Pick<CommandRouter, 'runCompositeFromClipboard' | 'runCompositeFromClipboardWithPreset' | 'runDefaultCompositeFromClipboard' | 'runCompositeFromSelection'>
  private readonly runRecordingCommandHandler: (command: RecordingCommand) => Promise<void>
  private readonly pickProfileHandler: (presets: readonly TransformationPreset[], focusedPresetId: string) => Promise<string | null>
  private readonly readSelectionTextHandler: () => Promise<string | null>
  private readonly onCompositeResult?: (result: CompositeTransformResult) => void
  private readonly onShortcutError?: (payload: { combo: string; accelerator: string; message: string }) => void
  private readonly registeredShortcuts = new Map<ShortcutAction, RegisteredShortcut>()
  private pickAndRunInFlight = false
  private selectionTransformInFlight = false

  constructor(dependencies: HotkeyDependencies) {
    this.globalShortcut = dependencies.globalShortcut
    this.settingsService = dependencies.settingsService
    this.commandRouter = dependencies.commandRouter
    this.runRecordingCommandHandler = dependencies.runRecordingCommand
    this.pickProfileHandler = dependencies.pickProfile
    this.readSelectionTextHandler = dependencies.readSelectionText
    this.onCompositeResult = dependencies.onCompositeResult
    this.onShortcutError = dependencies.onShortcutError
  }

  registerFromSettings(): void {
    const settings = this.settingsService.getSettings()
    const shortcuts = {
      ...DEFAULT_SETTINGS.shortcuts,
      ...settings.shortcuts
    }
    const bindings: readonly ShortcutBinding[] = [
      { action: 'toggleRecording', combo: shortcuts.toggleRecording, run: () => this.runRecordingCommand('toggleRecording') },
      { action: 'cancelRecording', combo: shortcuts.cancelRecording, run: () => this.runRecordingCommand('cancelRecording') },
      { action: 'runTransform', combo: shortcuts.runTransform, run: () => this.runTransform() },
      { action: 'runTransformOnSelection', combo: shortcuts.runTransformOnSelection, run: () => this.runTransformOnSelection() },
      { action: 'pickTransformation', combo: shortcuts.pickTransformation, run: () => this.runPickAndRunTransform() },
      { action: 'changeTransformationDefault', combo: shortcuts.changeTransformationDefault, run: () => this.changeDefaultTransform() }
    ]

    const activeActions = new Set<ShortcutAction>()
    for (const binding of bindings) {
      activeActions.add(binding.action)
      const accelerator = toElectronAccelerator(binding.combo)
      if (!accelerator) {
        this.unregisterAction(binding.action)
        continue
      }

      const previous = this.registeredShortcuts.get(binding.action)
      if (previous && previous.accelerator === accelerator && previous.combo === binding.combo) {
        continue
      }

      const registered = this.globalShortcut.register(
        accelerator,
        this.wrapShortcutCallback(binding.combo, accelerator, () => binding.run())
      )
      if (!registered) {
        // Keep existing registration if a hot-swap failed.
        this.reportShortcutError(binding.combo, accelerator, new Error('Global shortcut registration failed.'))
        continue
      }

      // Only remove previous accelerator after the new registration succeeds.
      if (previous && previous.accelerator !== accelerator) {
        this.unregisterAccelerator(previous.accelerator)
      }

      this.registeredShortcuts.set(binding.action, {
        combo: binding.combo,
        accelerator
      })
    }

    // Defensive cleanup: if future refactors remove an action from bindings,
    // ensure stale registrations are removed.
    for (const action of [...this.registeredShortcuts.keys()]) {
      if (!activeActions.has(action)) {
        this.unregisterAction(action)
      }
    }
  }

  unregisterAll(): void {
    this.registeredShortcuts.clear()
    this.globalShortcut.unregisterAll()
  }

  private async runRecordingCommand(command: RecordingCommand): Promise<void> {
    await this.runRecordingCommandHandler(command)
  }

  private async runTransform(): Promise<void> {
    const result = await this.commandRouter.runDefaultCompositeFromClipboard()
    this.onCompositeResult?.(result)
  }

  async runPickAndRunTransform(): Promise<void> {
    if (this.pickAndRunInFlight) {
      return
    }
    this.pickAndRunInFlight = true

    try {
      const settings = this.settingsService.getSettings()
      const presets = settings.transformation.presets
      if (presets.length === 0) {
        return
      }

      const focusedPresetId = this.resolvePickAndRunFocusedPresetId(settings)
      const pickedId = await this.pickProfileHandler(presets, focusedPresetId)
      if (!pickedId) {
        return
      }

      if (settings.transformation.lastPickedPresetId !== pickedId) {
        this.settingsService.setSettings({
          ...settings,
          transformation: {
            ...settings.transformation,
            lastPickedPresetId: pickedId
          }
        })
      }

      // One-time pick-and-run (decision #85): run with the picked preset for this request only.
      // Do not change default profile as a side effect.
      const result = await this.commandRouter.runCompositeFromClipboardWithPreset(pickedId)
      this.onCompositeResult?.(result)
    } finally {
      this.pickAndRunInFlight = false
    }
  }

  private async runTransformOnSelection(): Promise<void> {
    if (this.selectionTransformInFlight) {
      return
    }
    this.selectionTransformInFlight = true

    let selectionText: string | null
    try {
      selectionText = await this.readSelectionTextHandler()
    } catch {
      this.onCompositeResult?.({
        status: 'error',
        message: SELECTION_READ_FAILED_MESSAGE
      })
      return
    } finally {
      // Keep the in-flight gate scoped to selection read + enqueue outcome.
      // This serializes clipboard-probe based selection capture.
      this.selectionTransformInFlight = false
    }

    if (!selectionText || selectionText.trim().length === 0) {
      this.onCompositeResult?.({
        status: 'error',
        message: SELECTION_EMPTY_MESSAGE
      })
      return
    }

    const result = await this.commandRouter.runCompositeFromSelection(selectionText)
    this.onCompositeResult?.(result)
  }

  private async changeDefaultTransform(): Promise<void> {
    const settings = this.settingsService.getSettings()
    const presets = settings.transformation.presets
    const currentDefaultId = settings.transformation.defaultPresetId
    const currentDefaultPreset = presets.find((preset) => preset.id === currentDefaultId) ?? presets[0]

    if (!currentDefaultPreset) {
      this.onCompositeResult?.({
        status: 'error',
        message: 'No transformation preset is available to set as default.'
      })
      return
    }

    let nextDefaultPreset = currentDefaultPreset
    if (presets.length === 2) {
      nextDefaultPreset = presets.find((preset) => preset.id !== currentDefaultPreset.id) ?? currentDefaultPreset
    } else if (presets.length >= 3) {
      // Reuse the existing profile picker UI; preselect the current default profile.
      const pickedId = await this.pickProfileHandler(presets, currentDefaultPreset.id)
      if (!pickedId) {
        return
      }
      nextDefaultPreset = presets.find((preset) => preset.id === pickedId) ?? currentDefaultPreset
    }

    const nextSettings: Settings = {
      ...settings,
      transformation: {
        ...settings.transformation,
        defaultPresetId: nextDefaultPreset.id
      }
    }

    this.settingsService.setSettings(nextSettings)
    this.onCompositeResult?.({
      status: 'ok',
      message: `Default transformation profile changed to "${nextDefaultPreset.name}".`
    })
  }

  private reportShortcutError(combo: string, accelerator: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    this.onShortcutError?.({ combo, accelerator, message })
  }

  private wrapShortcutCallback(combo: string, accelerator: string, run: () => Promise<void>): () => void {
    return () => {
      void run().catch((error) => {
        this.reportShortcutError(combo, accelerator, error)
      })
    }
  }

  private unregisterAction(action: ShortcutAction): void {
    const current = this.registeredShortcuts.get(action)
    if (!current) {
      return
    }

    this.unregisterAccelerator(current.accelerator)
    this.registeredShortcuts.delete(action)
  }

  private unregisterAccelerator(accelerator: string): void {
    this.globalShortcut.unregister(accelerator)
  }

  private resolvePickAndRunFocusedPresetId(settings: Settings): string {
    const presets = settings.transformation.presets
    const presetIds = new Set(presets.map((preset) => preset.id))

    const remembered = settings.transformation.lastPickedPresetId
    if (remembered && presetIds.has(remembered)) {
      return remembered
    }

    const currentDefaultId = settings.transformation.defaultPresetId
    if (presetIds.has(currentDefaultId)) {
      return currentDefaultId
    }

    return presets[0]?.id ?? ''
  }
}

export { toElectronAccelerator }
