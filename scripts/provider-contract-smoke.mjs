import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifestPath = resolve(process.cwd(), 'contracts/provider-contract-manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const errors = []
const warnings = []

const assert = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}

assert(/^\d{4}-\d{2}-\d{2}$/.test(manifest.last_verified_at), 'Manifest last_verified_at must be ISO date (YYYY-MM-DD).')
assert(Array.isArray(manifest.providers), 'Manifest providers must be an array.')

for (const provider of manifest.providers ?? []) {
  assert(typeof provider.provider === 'string' && provider.provider.length > 0, 'Each provider must define provider name.')
  assert(typeof provider.endpoint === 'string' && provider.endpoint.startsWith('https://'), `${provider.provider}: endpoint must be https.`)
  assert(typeof provider.auth_method === 'string' && provider.auth_method.length > 0, `${provider.provider}: auth_method is required.`)
  assert(Array.isArray(provider.model_allowlist) && provider.model_allowlist.length > 0, `${provider.provider}: model_allowlist cannot be empty.`)
}

const liveMode = process.env.LIVE_PROVIDER_SMOKE === '1'
if (liveMode) {
  const keys = {
    groq: process.env.GROQ_API_KEY ?? '',
    elevenlabs: process.env.ELEVENLABS_API_KEY ?? '',
    gemini: process.env.GEMINI_API_KEY ?? ''
  }

  const missing = Object.entries(keys)
    .filter(([, value]) => value.length === 0)
    .map(([name]) => name)

  if (missing.length > 0) {
    warnings.push(`LIVE_PROVIDER_SMOKE enabled but missing keys: ${missing.join(', ')}. Skipping live checks.`)
  } else {
    for (const provider of manifest.providers) {
      const endpoint = String(provider.endpoint)
      const healthEndpoint = endpoint.includes('{model}') ? endpoint.replace('{model}', provider.model_allowlist[0]) : endpoint

      try {
        const response = await fetch(healthEndpoint, { method: 'OPTIONS' })
        if (response.status >= 500) {
          errors.push(`${provider.provider}: live smoke check returned server error status ${response.status}.`)
        }
      } catch (error) {
        errors.push(`${provider.provider}: live smoke request failed (${error instanceof Error ? error.message : 'unknown'}).`)
      }
    }
  }
}

for (const warning of warnings) {
  console.warn(`[provider-smoke][warn] ${warning}`)
}

if (errors.length > 0) {
  console.error('[provider-smoke] FAILED')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[provider-smoke] PASS')
