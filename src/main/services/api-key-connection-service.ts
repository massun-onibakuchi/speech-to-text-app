import type { ApiKeyProvider } from '../../shared/ipc'

export interface ApiKeyConnectionTestResult {
  provider: ApiKeyProvider
  status: 'success' | 'failed'
  message: string
}

export class ApiKeyConnectionService {
  private readonly fetchImpl: typeof fetch

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch
  }

  async testConnection(provider: ApiKeyProvider, apiKey: string): Promise<ApiKeyConnectionTestResult> {
    if (!apiKey || apiKey.trim().length === 0) {
      return {
        provider,
        status: 'failed',
        message: 'API key is missing. Enter or save a key first.'
      }
    }

    const normalizedKey = apiKey.trim()

    try {
      if (provider === 'groq') {
        return await this.testGroq(normalizedKey)
      }
      if (provider === 'elevenlabs') {
        return await this.testElevenLabs(normalizedKey)
      }
      return await this.testGoogle(normalizedKey)
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown network error'
      return {
        provider,
        status: 'failed',
        message: `Connection test failed: ${reason}`
      }
    }
  }

  private async testGroq(apiKey: string): Promise<ApiKeyConnectionTestResult> {
    const response = await this.fetchImpl('https://api.groq.com/openai/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    })

    if (response.ok) {
      return { provider: 'groq', status: 'success', message: 'Groq API key is valid.' }
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: 'groq', status: 'failed', message: 'Groq API key is invalid or unauthorized.' }
    }
    return { provider: 'groq', status: 'failed', message: `Groq connection failed with status ${response.status}.` }
  }

  private async testElevenLabs(apiKey: string): Promise<ApiKeyConnectionTestResult> {
    const response = await this.fetchImpl('https://api.elevenlabs.io/v1/models', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey
      }
    })

    if (response.ok) {
      return { provider: 'elevenlabs', status: 'success', message: 'ElevenLabs API key is valid.' }
    }
    if (response.status === 401 || response.status === 403) {
      return { provider: 'elevenlabs', status: 'failed', message: 'ElevenLabs API key is invalid or unauthorized.' }
    }
    return {
      provider: 'elevenlabs',
      status: 'failed',
      message: `ElevenLabs connection failed with status ${response.status}.`
    }
  }

  private async testGoogle(apiKey: string): Promise<ApiKeyConnectionTestResult> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    const response = await this.fetchImpl(endpoint, {
      method: 'GET'
    })

    if (response.ok) {
      return { provider: 'google', status: 'success', message: 'Google API key is valid.' }
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return { provider: 'google', status: 'failed', message: 'Google API key is invalid or unauthorized.' }
    }
    return { provider: 'google', status: 'failed', message: `Google connection failed with status ${response.status}.` }
  }
}
