// Where: src/main/services/endpoint-resolver.ts
// What:  Shared utilities for provider endpoint resolution with strict URL validation.
// Why:   Prevents arbitrary protocols (SSRF), malformed URLs, and unencoded path
//        parameters across all STT/LLM adapters.

/**
 * Validates and normalizes a baseUrlOverride string.
 *
 * - Returns null for null / undefined / empty / whitespace-only inputs.
 * - Enforces http: or https: protocol only (rejects ftp:, file:, javascript:, etc.).
 * - Returns URL.origin (protocol + host + port), stripping paths / query / fragment.
 * - Throws on invalid protocol or malformed URL.
 */
export function validateBaseUrlOverride(input: string | null | undefined): string | null {
  if (input == null) return null

  const trimmed = input.trim()
  if (trimmed.length === 0) return null

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`Invalid baseUrlOverride: "${trimmed}" is not a valid URL.`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Invalid baseUrlOverride protocol "${parsed.protocol}". Only http: and https: are allowed.`
    )
  }

  // Return origin only — strips paths, query params, and fragments.
  return parsed.origin
}

/**
 * Builds a complete provider endpoint URL.
 *
 * @param defaultBase  Official provider base URL (e.g. 'https://api.groq.com').
 * @param pathSuffix   Provider-specific path (e.g. '/openai/v1/audio/transcriptions').
 *                     May contain `{key}` placeholders filled from pathParams.
 * @param baseUrlOverride  Optional custom base URL — validated via validateBaseUrlOverride.
 * @param pathParams   Key-value pairs interpolated into pathSuffix; values are URI-encoded.
 */
export function resolveProviderEndpoint(
  defaultBase: string,
  pathSuffix: string,
  baseUrlOverride?: string | null,
  pathParams?: Record<string, string>
): string {
  const base = validateBaseUrlOverride(baseUrlOverride) ?? defaultBase

  let interpolatedPath = pathSuffix
  if (pathParams) {
    for (const [key, value] of Object.entries(pathParams)) {
      interpolatedPath = interpolatedPath.replaceAll(`{${key}}`, encodeURIComponent(value))
    }
  }

  return `${base}${interpolatedPath}`
}
