/*
Where: src/renderer/ipc-listeners.ts
What: IPC listener registration and teardown for the renderer process.
Why: Extracted from renderer-app.tsx (Phase 6) to isolate IPC event subscription
     management from the orchestration layer; keeps wiring logic focused and easy
     to trace in isolation.
*/

import type {
  CompositeTransformResult,
  HotkeyErrorNotification,
  LocalStreamingActivityEvent,
  RecordingCommandDispatch
} from '../shared/ipc'
import type { LocalRuntimeStatusSnapshot } from '../shared/local-runtime'

// Callbacks supplied by renderer-app.tsx when registering listeners.
export type IpcListenerCallbacks = {
  onCompositeTransformResult: (result: CompositeTransformResult) => void
  onRecordingCommand: (dispatch: RecordingCommandDispatch) => void
  onHotkeyError: (notification: HotkeyErrorNotification) => void
  onSettingsUpdated: () => void
  onLocalRuntimeStatus: (snapshot: LocalRuntimeStatusSnapshot) => void
  onLocalStreamingActivity: (event: LocalStreamingActivityEvent) => void
  onOpenSettings: () => void
}

// Module-level unlisten handles; null when not yet wired.
let unlistenCompositeTransformStatus: (() => void) | null = null
let unlistenRecordingCommand: (() => void) | null = null
let unlistenHotkeyError: (() => void) | null = null
let unlistenSettingsUpdated: (() => void) | null = null
let unlistenLocalRuntimeStatus: (() => void) | null = null
let unlistenLocalStreamingActivity: (() => void) | null = null
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
  if (!unlistenLocalRuntimeStatus) {
    unlistenLocalRuntimeStatus = window.speechToTextApi.onLocalRuntimeStatus(callbacks.onLocalRuntimeStatus)
  }
  if (!unlistenLocalStreamingActivity) {
    unlistenLocalStreamingActivity = window.speechToTextApi.onLocalStreamingActivity(
      callbacks.onLocalStreamingActivity
    )
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
  unlistenLocalRuntimeStatus?.()
  unlistenLocalRuntimeStatus = null
  unlistenLocalStreamingActivity?.()
  unlistenLocalStreamingActivity = null
  unlistenOpenSettings?.()
  unlistenOpenSettings = null
}
