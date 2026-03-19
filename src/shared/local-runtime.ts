// Where: Shared module (main + renderer).
// What: Local runtime manifest and install-state contracts for the optional WhisperLiveKit runtime.
// Why: Keep the app-managed local runtime lifecycle explicit, version-pinned, and reusable
//      across main-process install orchestration, preload IPC, and renderer settings UI.

export const LOCAL_RUNTIME_ID = 'whisperlivekit' as const
export const LOCAL_RUNTIME_BACKEND = 'voxtral-mlx' as const
export const LOCAL_RUNTIME_VERSION = '0.2.20.post1' as const
export const LOCAL_RUNTIME_PYTHON_VERSION_RANGE = '>=3.11 <3.14' as const
export const LOCAL_RUNTIME_PACKAGE_SPEC =
  `whisperlivekit[${LOCAL_RUNTIME_BACKEND}]==${LOCAL_RUNTIME_VERSION}` as const

export const LOCAL_RUNTIME_INSTALL_PHASES = ['bootstrap', 'packages', 'backend'] as const
export type LocalRuntimeInstallPhase = (typeof LOCAL_RUNTIME_INSTALL_PHASES)[number]

export const LOCAL_RUNTIME_FAILURE_CODES = [
  'python_missing',
  'python_unsupported',
  'bootstrap_failed',
  'package_install_failed',
  'backend_install_failed',
  'cancelled',
  'active_session_blocked',
  'unexpected_state'
] as const
export type LocalRuntimeFailureCode = (typeof LOCAL_RUNTIME_FAILURE_CODES)[number]

export type LocalRuntimeStateKind =
  | 'not_installed'
  | 'awaiting_user_confirmation'
  | 'installing'
  | 'ready'
  | 'failed'

export interface LocalRuntimeManifest {
  runtimeId: typeof LOCAL_RUNTIME_ID
  backend: typeof LOCAL_RUNTIME_BACKEND
  version: typeof LOCAL_RUNTIME_VERSION
  packageSpec: typeof LOCAL_RUNTIME_PACKAGE_SPEC
  pythonVersionRange: typeof LOCAL_RUNTIME_PYTHON_VERSION_RANGE
 }

export interface LocalRuntimeInstallMetadata {
  runtimeId: typeof LOCAL_RUNTIME_ID
  backend: typeof LOCAL_RUNTIME_BACKEND
  version: string
  installedAt: string
  pythonExecutable: string
  pythonVersion: string
}

export interface LocalRuntimeStatusSnapshot {
  state: LocalRuntimeStateKind
  manifest: LocalRuntimeManifest
  runtimeRoot: string
  installedVersion: string | null
  installedAt: string | null
  summary: string
  detail: string | null
  phase: LocalRuntimeInstallPhase | null
  failureCode: LocalRuntimeFailureCode | null
  canRequestInstall: boolean
  canCancel: boolean
  canUninstall: boolean
  requiresUpdate: boolean
}

export const LOCAL_RUNTIME_MANIFEST: LocalRuntimeManifest = {
  runtimeId: LOCAL_RUNTIME_ID,
  backend: LOCAL_RUNTIME_BACKEND,
  version: LOCAL_RUNTIME_VERSION,
  packageSpec: LOCAL_RUNTIME_PACKAGE_SPEC,
  pythonVersionRange: LOCAL_RUNTIME_PYTHON_VERSION_RANGE
}
