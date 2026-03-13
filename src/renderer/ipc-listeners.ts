/*
Where: src/renderer/ipc-listeners.ts
What: IPC listener registration and teardown for the renderer process.
Why: Extracted from renderer-app.tsx (Phase 6) to isolate IPC event subscription
     management from the orchestration layer; keeps wiring logic focused and easy
     to trace in isolation.
*/

import type { CompositeTransformResult, HotkeyErrorNotification, RecordingCommandDispatch } from '../shared/ipc'

// Callbacks supplied by renderer-app.tsx when registering listeners.
export type IpcListenerCallbacks = {
  onCompositeTransformResult: (result: CompositeTransformResult) => void
  onRecordingCommand: (dispatch: RecordingCommandDispatch) => void
  onHotkeyError: (notification: HotkeyErrorNotification) => void
  onSettingsUpdated: () => void
  onOpenSettings: () => void
}

// Module-level unlisten handles; null when not yet wired.
let unlistenCompositeTransformStatus: (() => void) | null = null
let unlistenRecordingCommand: (() => void) | null = null
let unlistenHotkeyError: (() => void) | null = null
let unlistenSettingsUpdated: (() => void) | null = null
let unlistenOpenSettings: (() => void) | null = null

// Register IPC listeners. Idempotent — safe to call multiple times (guards against double-wiring).
export const wireIpcListeners = (callbacks: IpcListenerCallbacks): void => {
  if (!unlistenCompositeTransformStatus) {
    unlistenCompositeTransformStatus = window.speechToTextApi.onCompositeTransformStatus(
      callbacks.onCompositeTransformResult
    )
  }
  if (!unlistenRecordingCommand) {
    unlistenRecordingCommand = window.speechToTextApi.onRecordingCommand(callbacks.onRecordingCommand)
  }
  if (!unlistenHotkeyError) {
    unlistenHotkeyError = window.speechToTextApi.onHotkeyError(callbacks.onHotkeyError)
  }
  if (!unlistenSettingsUpdated) {
    unlistenSettingsUpdated = window.speechToTextApi.onSettingsUpdated(callbacks.onSettingsUpdated)
  }
  if (!unlistenOpenSettings) {
    unlistenOpenSettings = window.speechToTextApi.onOpenSettings(callbacks.onOpenSettings)
  }
}

// Remove all IPC listeners and reset handles. Call during teardown (e.g., stopRendererAppForTests).
export const unwireIpcListeners = (): void => {
  unlistenCompositeTransformStatus?.()
  unlistenCompositeTransformStatus = null
  unlistenRecordingCommand?.()
  unlistenRecordingCommand = null
  unlistenHotkeyError?.()
  unlistenHotkeyError = null
  unlistenSettingsUpdated?.()
  unlistenSettingsUpdated = null
  unlistenOpenSettings?.()
  unlistenOpenSettings = null
}
