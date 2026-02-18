// Where: src/main/orchestrators/preflight-guard.ts
// What:  Pre-network validation checks and adapter error classification.
// Why:   Phase 2B requires preflight guards that block execution when
//        provider/model/key is missing, and typed distinction between
//        pre-network (preflight) vs post-network (api_auth/network) failures.

import type { FailureCategory } from '../../shared/domain'
import { STT_MODEL_ALLOWLIST, TRANSFORM_MODEL_ALLOWLIST, type SttModel, type SttProvider, type TransformModel, type TransformProvider } from '../../shared/domain'
import type { SecretStore } from '../services/secret-store'

type ApiKeyProvider = Parameters<SecretStore['getApiKey']>[0]

// ---------------------------------------------------------------------------
// Preflight result types
// ---------------------------------------------------------------------------

export interface PreflightOk {
  readonly ok: true
  /** The validated API key — use this instead of calling getApiKey again. */
  readonly apiKey: string
}

export interface PreflightBlocked {
  readonly ok: false
  /** Actionable, user-facing reason why execution was blocked. */
  readonly reason: string
}

export type PreflightResult = PreflightOk | PreflightBlocked

// ---------------------------------------------------------------------------
// Preflight checks — run before any network call.
// A single function handles both STT and LLM since the check is identical
// (API key presence). Separate wrappers exist for call-site clarity and
// to allow divergence if STT/LLM preflights gain different checks later.
// ---------------------------------------------------------------------------

/**
 * Validates that the API key is present for the given provider.
 * Returns the key on success so callers avoid a redundant getApiKey call.
 */
function checkApiKeyPreflight(
  secretStore: Pick<SecretStore, 'getApiKey'>,
  provider: string
): PreflightResult {
  // Keep public preflight inputs as string for current call sites while
  // satisfying SecretStore's provider contract for the API key lookup.
  const apiKey = secretStore.getApiKey(provider as ApiKeyProvider)
  if (!apiKey) {
    return { ok: false, reason: `Missing ${provider} API key. Add it in Settings → API Keys.` }
  }
  return { ok: true, apiKey }
}

/** STT preflight: checks API key for the STT provider. */
export function checkSttPreflight(
  secretStore: Pick<SecretStore, 'getApiKey'>,
  provider: string,
  model?: string
): PreflightResult {
  if (!isSupportedSttProvider(provider)) {
    return { ok: false, reason: `Unsupported STT provider: ${provider}.` }
  }
  if (model && !isSupportedSttModel(provider, model)) {
    return { ok: false, reason: `Unsupported STT model ${model} for provider ${provider}.` }
  }
  return checkApiKeyPreflight(secretStore, provider)
}

/** LLM preflight: checks API key for the LLM provider. */
export function checkLlmPreflight(
  secretStore: Pick<SecretStore, 'getApiKey'>,
  provider: string,
  model?: string
): PreflightResult {
  if (!isSupportedLlmProvider(provider)) {
    return { ok: false, reason: `Unsupported LLM provider: ${provider}.` }
  }
  if (model && !isSupportedLlmModel(provider, model)) {
    return { ok: false, reason: `Unsupported LLM model ${model} for provider ${provider}.` }
  }
  return checkApiKeyPreflight(secretStore, provider)
}

const isSupportedSttProvider = (provider: string): provider is SttProvider =>
  provider in STT_MODEL_ALLOWLIST

const isSupportedSttModel = (provider: SttProvider, model: string): model is SttModel =>
  STT_MODEL_ALLOWLIST[provider].includes(model as SttModel)

const isSupportedLlmProvider = (provider: string): provider is TransformProvider =>
  provider in TRANSFORM_MODEL_ALLOWLIST

const isSupportedLlmModel = (provider: TransformProvider, model: string): model is TransformModel =>
  TRANSFORM_MODEL_ALLOWLIST[provider].includes(model as TransformModel)

// ---------------------------------------------------------------------------
// Post-network error classification
// ---------------------------------------------------------------------------

/** Regex for HTTP 401/403 status codes in adapter error messages. */
const AUTH_STATUS_PATTERN = /\bstatus\s+(401|403)\b/i

/**
 * Regex for common network-level failure signatures.
 * Exported for reuse in resolveTranscriptionFailureDetail (capture-pipeline.ts).
 */
export const NETWORK_SIGNATURE_PATTERN =
  /(fetch failed|network|enotfound|econnrefused|econnreset|timed?\s*out|timeout|tls|certificate|socket hang up)/i

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
