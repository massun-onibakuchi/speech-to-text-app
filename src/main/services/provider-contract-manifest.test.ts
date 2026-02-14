import { describe, expect, it } from 'vitest'
import { PROVIDER_CONTRACT_MANIFEST, validateProviderContractManifest } from './provider-contract-manifest'

describe('Provider contract manifest', () => {
  it('defines required providers and canonical endpoints', () => {
    const providers = PROVIDER_CONTRACT_MANIFEST.map((item) => item.provider)
    expect(providers).toEqual(['groq', 'elevenlabs', 'gemini'])

    expect(PROVIDER_CONTRACT_MANIFEST[0].endpoint).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(PROVIDER_CONTRACT_MANIFEST[1].endpoint).toBe('https://api.elevenlabs.io/v1/speech-to-text')
    expect(PROVIDER_CONTRACT_MANIFEST[2].endpoint).toBe(
      'https://generativelanguage.googleapis.com/v1/models/{model}:generateContent'
    )
  })

  it('passes manifest validation checks', () => {
    const errors = validateProviderContractManifest()
    expect(errors).toEqual([])
  })
})
