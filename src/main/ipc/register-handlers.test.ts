import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const quit = vi.fn()
  const showErrorBox = vi.fn()
  const ipcHandle = vi.fn()
  const ipcOn = vi.fn()
  const getAllWindows = vi.fn(() => [])
  const registerFromSettings = vi.fn()
  const logStructured = vi.fn()
  const getStatusSnapshot = vi.fn(() => ({
    state: 'ready',
    manifest: {
      version: '0.2.20.post1',
      backend: 'voxtral-mlx'
    },
    runtimeRoot: '/tmp/runtime/current',
    installedVersion: '0.2.20.post1',
    installedAt: '2026-03-19T00:00:00.000Z',
    summary: 'Local runtime ready',
    detail: 'WhisperLiveKit is ready.',
    phase: null,
    failureCode: null,
    canRequestInstall: true,
    canCancel: false,
    canUninstall: true,
    requiresUpdate: false
  }))

  const settingsCtor = vi.fn(() => ({
    getSettings: vi.fn(() => ({})),
    setSettings: vi.fn((settings) => settings)
  }))
  const secretStoreCtor = vi.fn(() => ({
    getApiKey: vi.fn(() => null),
    setApiKey: vi.fn(),
    deleteApiKey: vi.fn()
  }))
  const historyServiceCtor = vi.fn(() => ({ getRecords: vi.fn(() => []) }))
  const transcriptionServiceCtor = vi.fn(() => ({}))
  const transformationServiceCtor = vi.fn(() => ({}))
  const outputServiceCtor = vi.fn(() => ({}))
  const networkCompatibilityServiceCtor = vi.fn(() => ({}))
  const soundServiceCtor = vi.fn(() => ({ play: vi.fn() }))
  const clipboardClientCtor = vi.fn(() => ({}))
  const selectionClientCtor = vi.fn(() => ({ readSelection: vi.fn(async () => '') }))
  const frontmostAppFocusClientCtor = vi.fn(() => ({
    captureFrontmostBundleId: vi.fn(async () => 'com.example.app'),
    activateBundleId: vi.fn(async () => {})
  }))
  const profilePickerServiceCtor = vi.fn(() => ({
    pickProfile: vi.fn(async () => null)
  }))
  const apiKeyConnectionServiceCtor = vi.fn(() => ({
    testConnection: vi.fn(async () => ({ ok: true }))
  }))
  const localStreamingSessionGateCtor = vi.fn(() => ({
    isSessionActive: vi.fn(() => false),
    markSessionStarted: vi.fn(),
    markSessionEnded: vi.fn()
  }))
  const localRuntimeInstallManagerCtor = vi.fn(() => ({
    getStatusSnapshot,
    requestInstall: vi.fn(),
    confirmInstall: vi.fn(),
    declineInstall: vi.fn(),
    cancelInstall: vi.fn(),
    uninstallRuntime: vi.fn()
  }))
  const localRuntimeServiceSupervisorCtor = vi.fn()
  const streamingActivityPublisherCtor = vi.fn(() => ({
    publishSessionState: vi.fn(),
    publishFinalizedSegment: vi.fn(),
    publishTransformedSegment: vi.fn(),
    publishOutputCommitted: vi.fn(),
    publishSegmentFailure: vi.fn(),
    clearSession: vi.fn()
  }))
  const localStreamingSessionControllerCtor = vi.fn(() => ({
    startSession: vi.fn(() => ({ sessionId: 'session-1' })),
    appendAudio: vi.fn(),
    stopSession: vi.fn(),
    cancelSession: vi.fn()
  }))
  const serialOutputCoordinatorCtor = vi.fn(() => ({}))
  const captureQueueCtor = vi.fn(() => ({}))
  const transformQueueCtor = vi.fn(() => ({}))
  const createCaptureProcessor = vi.fn(() => ({}))
  const createTransformProcessor = vi.fn(() => ({}))
  const recordingOrchestratorCtor = vi.fn(() => ({}))
  const commandRouterCtor = vi.fn(() => ({
    getAudioInputSources: vi.fn(async () => []),
    runRecordingCommand: vi.fn(() => ({ command: 'toggleRecording' })),
    submitRecordedAudio: vi.fn()
  }))
  const hotkeyServiceCtor = vi.fn(() => ({
    registerFromSettings,
    unregisterAll: vi.fn(),
    runPickAndRunTransform: vi.fn(async () => {})
  }))

  return {
    quit,
    showErrorBox,
    ipcHandle,
    ipcOn,
    getAllWindows,
    registerFromSettings,
    logStructured,
    getStatusSnapshot,
    settingsCtor,
    secretStoreCtor,
    historyServiceCtor,
    transcriptionServiceCtor,
    transformationServiceCtor,
    outputServiceCtor,
    networkCompatibilityServiceCtor,
    soundServiceCtor,
    clipboardClientCtor,
    selectionClientCtor,
    frontmostAppFocusClientCtor,
    profilePickerServiceCtor,
    apiKeyConnectionServiceCtor,
    localStreamingSessionGateCtor,
    localRuntimeInstallManagerCtor,
    localRuntimeServiceSupervisorCtor,
    streamingActivityPublisherCtor,
    localStreamingSessionControllerCtor,
    serialOutputCoordinatorCtor,
    captureQueueCtor,
    transformQueueCtor,
    createCaptureProcessor,
    createTransformProcessor,
    recordingOrchestratorCtor,
    commandRouterCtor,
    hotkeyServiceCtor
  }
})

vi.mock('electron', () => ({
  app: { quit: mocks.quit },
  dialog: { showErrorBox: mocks.showErrorBox },
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows
  },
  ipcMain: {
    handle: mocks.ipcHandle,
    on: mocks.ipcOn
  },
  globalShortcut: {}
}))

vi.mock('../../shared/error-logging', () => ({
  logStructured: mocks.logStructured
}))

vi.mock('../services/settings-service', () => ({
  SettingsService: mocks.settingsCtor
}))
vi.mock('../services/secret-store', () => ({
  SecretStore: mocks.secretStoreCtor
}))
vi.mock('../services/history-service', () => ({
  HistoryService: mocks.historyServiceCtor
}))
vi.mock('../services/transcription-service', () => ({
  TranscriptionService: mocks.transcriptionServiceCtor
}))
vi.mock('../services/transformation-service', () => ({
  TransformationService: mocks.transformationServiceCtor
}))
vi.mock('../services/output-service', () => ({
  OutputService: mocks.outputServiceCtor
}))
vi.mock('../services/network-compatibility-service', () => ({
  NetworkCompatibilityService: mocks.networkCompatibilityServiceCtor
}))
vi.mock('../services/sound-service', () => ({
  ElectronSoundService: mocks.soundServiceCtor
}))
vi.mock('../infrastructure/clipboard-client', () => ({
  ClipboardClient: mocks.clipboardClientCtor
}))
vi.mock('../infrastructure/selection-client', () => ({
  SelectionClient: mocks.selectionClientCtor
}))
vi.mock('../infrastructure/frontmost-app-focus-client', () => ({
  FrontmostAppFocusClient: mocks.frontmostAppFocusClientCtor
}))
vi.mock('../services/profile-picker-service', () => ({
  ProfilePickerService: mocks.profilePickerServiceCtor
}))
vi.mock('../services/api-key-connection-service', () => ({
  ApiKeyConnectionService: mocks.apiKeyConnectionServiceCtor
}))
vi.mock('../services/local-streaming-session-gate', () => ({
  LocalStreamingSessionGate: mocks.localStreamingSessionGateCtor
}))
vi.mock('../services/local-runtime-install-manager', () => ({
  LocalRuntimeInstallManager: mocks.localRuntimeInstallManagerCtor
}))
vi.mock('../services/local-runtime-service-supervisor', () => ({
  LocalRuntimeServiceSupervisor: mocks.localRuntimeServiceSupervisorCtor
}))
vi.mock('../services/activity-publisher', () => ({
  StreamingActivityPublisher: mocks.streamingActivityPublisherCtor
}))
vi.mock('../orchestrators/local-streaming-session-controller', () => ({
  LocalStreamingSessionController: mocks.localStreamingSessionControllerCtor
}))
vi.mock('../coordination/ordered-output-coordinator', () => ({
  SerialOutputCoordinator: mocks.serialOutputCoordinatorCtor
}))
vi.mock('../queues/capture-queue', () => ({
  CaptureQueue: mocks.captureQueueCtor
}))
vi.mock('../queues/transform-queue', () => ({
  TransformQueue: mocks.transformQueueCtor
}))
vi.mock('../orchestrators/capture-pipeline', () => ({
  createCaptureProcessor: mocks.createCaptureProcessor
}))
vi.mock('../orchestrators/transform-pipeline', () => ({
  createTransformProcessor: mocks.createTransformProcessor
}))
vi.mock('../orchestrators/recording-orchestrator', () => ({
  RecordingOrchestrator: mocks.recordingOrchestratorCtor
}))
vi.mock('../core/command-router', () => ({
  CommandRouter: mocks.commandRouterCtor
}))
vi.mock('../services/hotkey-service', () => ({
  HotkeyService: mocks.hotkeyServiceCtor
}))
vi.mock('./recording-command-dispatcher', () => ({
  dispatchRecordingCommandToRenderers: vi.fn(() => 1)
}))
vi.mock('../infrastructure/sound-asset-paths', () => ({
  SOUND_ASSET_PATHS: {
    recordingStarted: 'start.wav',
    recordingStopped: 'stop.wav',
    recordingCancelled: 'cancel.wav',
    transformationSucceeded: 'transform-ok.wav',
    transformationFailed: 'transform-fail.wav',
    defaultProfileChanged: 'profile.wav'
  }
}))

import { registerIpcHandlers } from './register-handlers'

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows recovery error and quits app when settings initialization fails', () => {
    mocks.settingsCtor.mockImplementationOnce(() => {
      throw new Error('invalid settings payload')
    })

    expect(() => registerIpcHandlers()).toThrow('invalid settings payload')

    expect(mocks.showErrorBox).toHaveBeenCalledOnce()
    expect(mocks.quit).toHaveBeenCalledOnce()
  })

  it('logs structured local runtime supervisor terminations from main wiring', () => {
    registerIpcHandlers()

    const supervisorOptions = mocks.localRuntimeServiceSupervisorCtor.mock.calls[0]?.[0]
    expect(supervisorOptions?.onTermination).toEqual(expect.any(Function))

    supervisorOptions.onTermination({
      code: 'health_check_failed',
      detail: 'Local runtime health check returned 503.',
      exitCode: null,
      signal: null
    })

    expect(mocks.logStructured).toHaveBeenCalledWith({
      level: 'error',
      scope: 'main',
      event: 'local_runtime.service_terminated',
      context: expect.objectContaining({
        terminationCode: 'health_check_failed',
        detail: 'Local runtime health check returned 503.',
        exitCode: null,
        signal: null,
        runtimeVersion: '0.2.20.post1',
        runtimeState: 'ready'
      })
    })
    expect(mocks.registerFromSettings).toHaveBeenCalledOnce()
  })
})
