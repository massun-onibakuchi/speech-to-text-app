// Where: Shared module used by main and preload.
// What: Resolves explicit runtime platform overrides for end-to-end tests.
// Why: Playwright needs one test-only seam so main-process settings validation and
//      renderer platform gating can agree on Apple Silicon visibility rules.

import type { RuntimePlatformInfo } from './local-stt'

export const E2E_RUNTIME_PLATFORM_ENV = 'DICTA_E2E_RUNTIME_PLATFORM'
export const E2E_RUNTIME_ARCH_ENV = 'DICTA_E2E_RUNTIME_ARCH'
export const E2E_RUNTIME_PLATFORM_OVERRIDE_ENABLED_ENV = 'DICTA_E2E_ENABLE_RUNTIME_PLATFORM_OVERRIDE'

const readNonEmptyEnv = (value: string | undefined): string | null => {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export const resolveRuntimePlatform = (
  processLike: Pick<NodeJS.Process, 'platform' | 'arch' | 'env'>
): RuntimePlatformInfo => {
  const overrideEnabled = processLike.env[E2E_RUNTIME_PLATFORM_OVERRIDE_ENABLED_ENV] === '1'
  if (!overrideEnabled) {
    return {
      platform: processLike.platform,
      arch: processLike.arch
    }
  }

  return {
    platform: readNonEmptyEnv(processLike.env[E2E_RUNTIME_PLATFORM_ENV]) ?? processLike.platform,
    arch: readNonEmptyEnv(processLike.env[E2E_RUNTIME_ARCH_ENV]) ?? processLike.arch
  }
}
