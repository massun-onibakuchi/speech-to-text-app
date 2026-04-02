/**
 * Where: src/main/ipc/register-handlers.ts
 * What:  Composition root — instantiates services and registers IPC handlers.
 * Why:   Central wiring point where all main-process dependencies are assembled.
 *        Phase 2A: CommandRouter dispatches to CaptureQueue and TransformQueue
 *        with SerialOutputCoordinator for ordered output commits.
 */

import { BrowserWindow, app, dialog, ipcMain, globalShortcut } from 'electron'
import {
  IPC_CHANNELS,
  type ApiKeyProvider,
  type CompositeTransformResult,
  type HotkeyErrorNotification,
  type LlmProviderStatusSnapshot,
  type LocalCleanupReadinessSnapshot,
  type RecordingCommand,
  type RecordingCommandDispatch,
  type SoundEvent
} from '../../shared/ipc'
import type { LlmProvider } from '../../shared/llm'
import type { Settings } from '../../shared/domain'
import { logStructured } from '../../shared/error-logging'
import { SettingsService } from '../services/settings-service'
import { RecordingOrchestrator } from '../orchestrators/recording-orchestrator'
import { HistoryService } from '../services/history-service'
import { SecretStore } from '../services/secret-store'
import { HotkeyService } from '../services/hotkey-service'
import { ApiKeyConnectionService } from '../services/api-key-connection-service'
import { TranscriptionService } from '../services/transcription-service'
import { TransformationService } from '../services/transformation-service'
import { OutputService } from '../services/output-service'
import { NetworkCompatibilityService } from '../services/network-compatibility-service'
import { ElectronSoundService } from '../services/sound-service'
import { SOUND_ASSET_PATHS } from '../infrastructure/sound-asset-paths'
import { ClipboardClient } from '../infrastructure/clipboard-client'
import { SelectionClient } from '../infrastructure/selection-client'
import { FrontmostAppFocusClient } from '../infrastructure/frontmost-app-focus-client'
import { SerialOutputCoordinator } from '../coordination/ordered-output-coordinator'
import { CaptureQueue } from '../queues/capture-queue'
import { TransformQueue } from '../queues/transform-queue'
import { createCaptureProcessor } from '../orchestrators/capture-pipeline'
import { createTransformProcessor } from '../orchestrators/transform-pipeline'
import { CommandRouter } from '../core/command-router'
import { ProfilePickerService } from '../services/profile-picker-service'
import { ScratchSpaceDraftService } from '../services/scratch-space-draft-service'
import { ScratchSpaceWindowService } from '../services/scratch-space-window-service'
import { ScratchSpaceService } from '../services/scratch-space-service'
import { TrayOutputMenuController } from '../tray/tray-output-menu-controller'
import type { WindowManager } from '../core/window-manager'
import { OllamaLocalLlmRuntime } from '../services/local-llm/ollama-local-llm-runtime'
import { LocalLlmRuntimeError } from '../services/local-llm/types'
import { LlmProviderReadinessService } from '../services/llm-provider-readiness-service'
import { OpenAiSubscriptionAuthService } from '../services/openai-subscription-auth-service'
import { dispatchRecordingCommandToRenderers } from './recording-command-dispatcher'

type MainServices = {
  settingsService: SettingsService
  secretStore: SecretStore
  historyService: HistoryService
  transcriptionService: TranscriptionService
  transformationService: TransformationService
  localLlmRuntime: OllamaLocalLlmRuntime
  openAiSubscriptionAuthService: OpenAiSubscriptionAuthService
  outputService: OutputService
  networkCompatibilityService: NetworkCompatibilityService
  soundService: ElectronSoundService
  clipboardClient: ClipboardClient
  selectionClient: SelectionClient
  profilePickerService: ProfilePickerService
  apiKeyConnectionService: ApiKeyConnectionService
  llmProviderReadinessService: LlmProviderReadinessService
  commandRouter: CommandRouter
  hotkeyService: HotkeyService
  scratchSpaceWindowService: ScratchSpaceWindowService
  scratchSpaceService: ScratchSpaceService
}

let services: MainServices | null = null
let notifySettingsUpdated: () => void = () => {
  broadcastSettingsUpdated()
}

const initializeServices = (): MainServices => {
  if (services) {
    return services
  }

  try {
    const settingsService = new SettingsService()
    const secretStore = new SecretStore()
    const historyService = new HistoryService()
    const transcriptionService = new TranscriptionService()
    const transformationService = new TransformationService()
    const localLlmRuntime = new OllamaLocalLlmRuntime()
    const openAiSubscriptionAuthService = new OpenAiSubscriptionAuthService()
    const outputService = new OutputService()
    const networkCompatibilityService = new NetworkCompatibilityService()
    const soundService = new ElectronSoundService({
      recording_started: SOUND_ASSET_PATHS.recordingStarted,
      recording_stopped: SOUND_ASSET_PATHS.recordingStopped,
      recording_cancelled: SOUND_ASSET_PATHS.recordingCancelled,
      transformation_succeeded: SOUND_ASSET_PATHS.transformationSucceeded,
      transformation_failed: SOUND_ASSET_PATHS.transformationFailed,
      default_profile_changed: SOUND_ASSET_PATHS.defaultProfileChanged
    })
    const clipboardClient = new ClipboardClient()
    const selectionClient = new SelectionClient({ clipboard: clipboardClient })
    const frontmostAppFocusClient = new FrontmostAppFocusClient()
    const profilePickerService = new ProfilePickerService({
      create: (options) => new BrowserWindow(options),
      focusBridge: {
        captureFrontmostAppId: () => frontmostAppFocusClient.captureFrontmostBundleId(),
        restoreFrontmostAppId: (appId) => frontmostAppFocusClient.activateBundleId(appId)
      }
    })
    const scratchSpaceWindowService = new ScratchSpaceWindowService({
      create: (options) => new BrowserWindow(options),
      focusClient: {
        captureFrontmostBundleId: () => frontmostAppFocusClient.captureFrontmostBundleId()
      }
    })
    const scratchSpaceDraftService = new ScratchSpaceDraftService()
    const apiKeyConnectionService = new ApiKeyConnectionService()
    const llmProviderReadinessService = new LlmProviderReadinessService({
      secretStore,
      localLlmRuntime,
      openAiSubscriptionAuthService
    })

    const outputCoordinator = new SerialOutputCoordinator()
    const captureQueue = new CaptureQueue({
      processor: createCaptureProcessor({
        secretStore,
        transcriptionService,
        transformationService,
        llmProviderReadinessService,
        openAiSubscriptionAuthService,
        localLlmRuntime,
        outputService,
        historyService,
        networkCompatibilityService,
        outputCoordinator,
        soundService
      })
    })
    const transformQueue = new TransformQueue({
      processor: createTransformProcessor({
        secretStore,
        transformationService,
        llmProviderReadinessService,
        openAiSubscriptionAuthService,
        outputService
      }),
      onResult: publishTransformResult
    })
    const recordingOrchestrator = new RecordingOrchestrator({ settingsService })
    const commandRouter = new CommandRouter({
      settingsService,
      recordingOrchestrator,
      captureQueue,
      transformQueue,
      clipboardClient
    })
    const scratchSpaceService = ScratchSpaceService.create({
      settingsService,
      recordingOrchestrator,
      secretStore,
      transcriptionService,
      transformationService,
      llmProviderReadinessService,
      openAiSubscriptionAuthService,
      outputService,
      draftService: scratchSpaceDraftService,
      windowService: scratchSpaceWindowService,
      focusClient: {
        activateBundleId: (bundleId: string) => frontmostAppFocusClient.activateBundleId(bundleId)
      }
    })

    const runRecordingCommand = async (command: RecordingCommand): Promise<void> => {
      const dispatch = commandRouter.runRecordingCommand(command)
      broadcastRecordingCommand(dispatch)
    }

    const hotkeyService = new HotkeyService({
      globalShortcut,
      settingsService,
      commandRouter,
      runRecordingCommand,
      openScratchSpace: () => scratchSpaceWindowService.show(),
      pickProfile: (presets, focusedPresetId) => profilePickerService.pickProfile(presets, focusedPresetId),
      readSelectionText: () => selectionClient.readSelection(),
      onCompositeResult: broadcastCompositeTransformStatus,
      onSettingsUpdated: () => notifySettingsUpdated(),
      onDefaultProfileChanged: () => soundService.play('default_profile_changed'),
      onShortcutError: (payload) => {
        const notification: HotkeyErrorNotification = {
          combo: payload.combo,
          message: payload.message
        }
        logStructured({
          level: 'error',
          scope: 'main',
          event: 'hotkey.dispatch_failed',
          message: 'Global shortcut dispatch failed.',
          context: {
            combo: payload.combo,
            accelerator: payload.accelerator,
            detail: payload.message
          }
        })
        broadcastHotkeyError(notification)
      }
    })

    services = {
      settingsService,
      secretStore,
      historyService,
      transcriptionService,
      transformationService,
      localLlmRuntime,
      openAiSubscriptionAuthService,
      outputService,
      networkCompatibilityService,
      soundService,
      clipboardClient,
      selectionClient,
      profilePickerService,
      apiKeyConnectionService,
      llmProviderReadinessService,
      commandRouter,
      hotkeyService,
      scratchSpaceWindowService,
      scratchSpaceService
    }
    return services
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logStructured({
      level: 'error',
      scope: 'main',
      event: 'settings.startup_invalid_payload',
      message: 'Failed to initialize settings service from persisted settings.',
      context: { detail: message }
    })
    dialog.showErrorBox(
      'Settings Incompatible',
      'Persisted settings are incompatible with this app version.\n\n' +
      'Delete settings.json in the app userData directory, then restart the app.'
    )
    app.quit()
    throw error
  }
}

// --- Broadcast helpers (defined early so they can be used by pipeline wiring) ---

const broadcastCompositeTransformStatus = (result: CompositeTransformResult): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onCompositeTransformStatus, result)
  }
}

const publishTransformResult = (result: CompositeTransformResult): void => {
  broadcastCompositeTransformStatus(result)
  services?.soundService.play(result.status === 'ok' ? 'transformation_succeeded' : 'transformation_failed')
}

const broadcastHotkeyError = (notification: HotkeyErrorNotification): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onHotkeyError, notification)
  }
}

const broadcastSettingsUpdated = (): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.onSettingsUpdated)
  }
}

const broadcastRecordingCommand = (dispatch: RecordingCommandDispatch): void => {
  const delivered = dispatchRecordingCommandToRenderers(BrowserWindow.getAllWindows(), dispatch)
  if (delivered === 0) {
    throw new Error('No active renderer window is available to handle recording commands.')
  }
}

const getApiKeyStatus = (secretStore: SecretStore) => ({
  groq: secretStore.getApiKey('groq') !== null,
  elevenlabs: secretStore.getApiKey('elevenlabs') !== null,
  google: secretStore.getApiKey('google') !== null
})

// --- IPC handler registration ---

export const registerIpcHandlers = (
  windowManager?: Pick<WindowManager, 'openSettingsFromTrayMenu' | 'setTrayContextMenu'>
): void => {
  const svc = initializeServices()
  const trayOutputMenuController = windowManager
    ? new TrayOutputMenuController({
        settingsService: svc.settingsService,
        setTrayContextMenu: (template) => windowManager.setTrayContextMenu(template),
        openSettings: () => windowManager.openSettingsFromTrayMenu(),
        broadcastSettingsUpdated
      })
    : null
  const refreshTrayMenu = (): void => {
    trayOutputMenuController?.refresh()
  }
  const broadcastExternalSettingsUpdated = (): void => {
    refreshTrayMenu()
    broadcastSettingsUpdated()
  }
  notifySettingsUpdated = broadcastExternalSettingsUpdated

  ipcMain.handle(IPC_CHANNELS.ping, () => 'pong')
  ipcMain.handle(IPC_CHANNELS.getSettings, () => svc.settingsService.getSettings())
  ipcMain.handle(IPC_CHANNELS.setSettings, (_event, nextSettings: Settings) => {
    const saved = svc.settingsService.setSettings(nextSettings)
    svc.hotkeyService.registerFromSettings()
    trayOutputMenuController?.handleRendererSettingsSaved()
    return saved
  })
  ipcMain.handle(IPC_CHANNELS.getLocalCleanupStatus, async (): Promise<LocalCleanupReadinessSnapshot> => {
    const selectedModelId = svc.settingsService.getSettings().cleanup.localModelId
    const health = await svc.localLlmRuntime.healthcheck()
    if (!health.ok) {
      return {
        runtime: svc.localLlmRuntime.kind,
        status: {
          kind: mapLocalCleanupStatusCode(health.code),
          message: health.message
        },
        availableModels: [],
        selectedModelId,
        selectedModelInstalled: false
      }
    }

    try {
      const resolvedAvailableModels = (await svc.localLlmRuntime.listModels()).map((model) => ({
          id: model.id,
          label: model.label
        }))
      const selectedModelInstalled = resolvedAvailableModels.some((model) => model.id === selectedModelId)
      if (resolvedAvailableModels.length === 0) {
        return {
          runtime: svc.localLlmRuntime.kind,
          status: {
            kind: 'no_supported_models',
            message: 'No supported local cleanup model is installed in Ollama.'
          },
          availableModels: [],
          selectedModelId,
          selectedModelInstalled: false
        }
      }

      if (!selectedModelInstalled) {
        return {
          runtime: svc.localLlmRuntime.kind,
          status: {
            kind: 'selected_model_missing',
            message: 'The selected cleanup model is not currently installed in Ollama.'
          },
          availableModels: resolvedAvailableModels,
          selectedModelId,
          selectedModelInstalled: false
        }
      }

      return {
        runtime: svc.localLlmRuntime.kind,
        status: {
          kind: 'ready',
          message: 'Ollama is available.'
        },
        availableModels: resolvedAvailableModels,
        selectedModelId,
        selectedModelInstalled: true
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load local cleanup status.'
      return {
        runtime: svc.localLlmRuntime.kind,
        status: {
          kind: mapLocalCleanupStatusCode(error),
          message
        },
        availableModels: [],
        selectedModelId,
        selectedModelInstalled: false
      }
    }
  })
  ipcMain.handle(IPC_CHANNELS.getApiKeyStatus, () => getApiKeyStatus(svc.secretStore))
  ipcMain.handle(IPC_CHANNELS.getLlmProviderStatus, async (): Promise<LlmProviderStatusSnapshot> =>
    svc.llmProviderReadinessService.getSnapshot()
  )
  ipcMain.handle(IPC_CHANNELS.connectLlmProvider, async (_event, provider: Extract<LlmProvider, 'openai-subscription'>) => {
    if (provider !== 'openai-subscription') {
      throw new Error(`Unsupported provider connect request: ${provider}`)
    }
    await svc.openAiSubscriptionAuthService.connectWithBrowserOAuth()
  })
  ipcMain.handle(IPC_CHANNELS.disconnectLlmProvider, (_event, provider: Extract<LlmProvider, 'openai-subscription'>) => {
    if (provider !== 'openai-subscription') {
      throw new Error(`Unsupported provider disconnect request: ${provider}`)
    }
    svc.openAiSubscriptionAuthService.clearSession()
  })
  ipcMain.handle(IPC_CHANNELS.setApiKey, (_event, provider: ApiKeyProvider, apiKey: string) => {
    svc.secretStore.setApiKey(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.deleteApiKey, (_event, provider: ApiKeyProvider) => {
    svc.secretStore.deleteApiKey(provider)
  })
  ipcMain.handle(IPC_CHANNELS.testApiKeyConnection, async (_event, provider: ApiKeyProvider, candidateApiKey?: string) => {
    const candidate = candidateApiKey?.trim() ?? ''
    const apiKey = candidate.length > 0 ? candidate : svc.secretStore.getApiKey(provider) ?? ''
    return svc.apiKeyConnectionService.testConnection(provider, apiKey)
  })
  ipcMain.handle(IPC_CHANNELS.getHistory, () => svc.historyService.getRecords())
  ipcMain.handle(IPC_CHANNELS.getAudioInputSources, () => svc.commandRouter.getAudioInputSources())
  ipcMain.on(IPC_CHANNELS.playSound, (_event, event: SoundEvent) => {
    svc.soundService.play(event)
  })
  ipcMain.handle(IPC_CHANNELS.runRecordingCommand, (_event, command: RecordingCommand) => {
    const dispatch = svc.commandRouter.runRecordingCommand(command)
    broadcastRecordingCommand(dispatch)
  })
  ipcMain.handle(
    IPC_CHANNELS.submitRecordedAudio,
    (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) => {
      svc.commandRouter.submitRecordedAudio(payload)
    }
  )
  ipcMain.handle(IPC_CHANNELS.getScratchSpaceDraft, () => svc.scratchSpaceService.getDraft())
  ipcMain.handle(IPC_CHANNELS.setScratchSpaceDraft, (_event, draft: string) => {
    svc.scratchSpaceService.saveDraft(draft)
  })
  ipcMain.handle(
    IPC_CHANNELS.transcribeScratchSpaceAudio,
    async (_event, payload: { data: Uint8Array; mimeType: string; capturedAt: string }) =>
      svc.scratchSpaceService.transcribeAudio(payload)
  )
  ipcMain.handle(
    IPC_CHANNELS.runScratchSpaceTransformation,
    async (_event, payload: { text: string; presetId: string }) => {
      const result = await svc.scratchSpaceService.runTransformation(payload)
      svc.soundService.play(result.status === 'ok' ? 'transformation_succeeded' : 'transformation_failed')
      return result
    }
  )
  ipcMain.handle(IPC_CHANNELS.hideScratchSpaceWindow, () => {
    svc.scratchSpaceWindowService.hide()
  })
  ipcMain.handle(IPC_CHANNELS.runPickTransformationFromClipboard, async () => svc.hotkeyService.runPickAndRunTransform())

  svc.hotkeyService.registerFromSettings()
  refreshTrayMenu()
}

const mapLocalCleanupStatusCode = (value: unknown): 'runtime_unavailable' | 'server_unreachable' | 'unknown' => {
  if (value === 'runtime_unavailable' || value === 'server_unreachable' || value === 'unknown') {
    return value
  }

  if (value instanceof LocalLlmRuntimeError) {
    if (value.code === 'runtime_unavailable' || value.code === 'server_unreachable') {
      return value.code
    }
  }

  return 'unknown'
}

export const unregisterGlobalHotkeys = (): void => {
  services?.hotkeyService.unregisterAll()
}

export const markAuxiliaryWindowsQuitting = (): void => {
  services?.scratchSpaceWindowService.markQuitting()
}
