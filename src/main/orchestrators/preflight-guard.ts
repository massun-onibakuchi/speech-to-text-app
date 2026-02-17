// Where: src/main/orchestrators/preflight-guard.ts
// What:  Pre-network validation checks and adapter error classification.
// Why:   Phase 2B requires preflight guards that block execution when
//        provider/model/key is missing, and typed distinction between
//        pre-network (preflight) vs post-network (api_auth/network) failures.

import type { FailureCategory } from '../../shared/domain'
import type { SecretStore } from '../services/secret-store'

// ---------------------------------------------------------------------------
// Preflight result types
// ---------------------------------------------------------------------------

export interface PreflightOk {
  readonly ok: true
}

export interface PreflightBlocked {
  readonly ok: false
  /** Actionable, user-facing reason why execution was blocked. */
  readonly reason: string
}

export type PreflightResult = PreflightOk | PreflightBlocked

// ---------------------------------------------------------------------------
// Preflight checks — run before any network call
// ---------------------------------------------------------------------------

/**
 * Validates that the STT API key is present for the given provider.
 * Returns a blocked result with an actionable message when the key is missing.
 */
export function checkSttPreflight(
  secretStore: Pick<SecretStore, 'getApiKey'>,
  provider: string
): PreflightResult {
  const apiKey = secretStore.getApiKey(provider)
  if (!apiKey) {
    return { ok: false, reason: `Missing ${provider} API key. Add it in Settings → API Keys.` }
  }
  return { ok: true }
}

/**
 * Validates that the LLM API key is present for the given provider.
 * Returns a blocked result with an actionable message when the key is missing.
 */
export function checkLlmPreflight(
  secretStore: Pick<SecretStore, 'getApiKey'>,
  provider: string
): PreflightResult {
  const apiKey = secretStore.getApiKey(provider)
  if (!apiKey) {
    return { ok: false, reason: `Missing ${provider} API key. Add it in Settings → API Keys.` }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Post-network error classification
// ---------------------------------------------------------------------------

/** Regex for HTTP 401/403 status codes in adapter error messages. */
const AUTH_STATUS_PATTERN = /\bstatus\s+(401|403)\b/i

/** Regex for common network-level failure signatures. */
const NETWORK_SIGNATURE_PATTERN =
  /(fetch failed|network|enotfound|econnrefused|econnreset|timed out|tls|certificate|socket hang up)/i

/**
 * Classifies an adapter error into a FailureCategory based on the error message.
 * - 401/403 status → 'api_auth' (invalid or expired key)
 * - Network signatures → 'network' (connectivity/DNS/TLS)
 * - Anything else → 'unknown'
 */
export function classifyAdapterError(error: unknown): FailureCategory {
  const message = error instanceof Error ? error.message : String(error)

  if (AUTH_STATUS_PATTERN.test(message)) {
    return 'api_auth'
  }

  if (NETWORK_SIGNATURE_PATTERN.test(message)) {
    return 'network'
  }

  return 'unknown'
}
