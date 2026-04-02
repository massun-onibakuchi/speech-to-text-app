import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenAiSubscriptionTransformationAdapter } from './openai-subscription-transformation-adapter'

describe('OpenAiSubscriptionTransformationAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends bearer auth, account id, and prompt input to the ChatGPT subscription endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: 'transformed output'
      })
    }))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new OpenAiSubscriptionTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      provider: 'openai-subscription',
      credential: { kind: 'oauth', accessToken: 'oauth-token', accountId: 'acct_123' },
      model: 'gpt-5.4-mini',
      prompt: {
        systemPrompt: 'Rewrite cleanly.',
        userPrompt: 'Rewrite this.\n<input_text>{{text}}</input_text>'
      }
    })

    expect(result).toEqual({
      text: 'transformed output',
      provider: 'openai-subscription',
      model: 'gpt-5.4-mini'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://chatgpt.com/backend-api/codex/responses')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer oauth-token',
      'ChatGPT-Account-Id': 'acct_123'
    })
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'gpt-5.4-mini',
      instructions: 'Rewrite cleanly.',
      input: 'Rewrite this.\n<input_text>input text</input_text>'
    })
  })

  it('rejects non-oauth credentials before making a network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new OpenAiSubscriptionTransformationAdapter()
    await expect(
      adapter.transform({
        text: 'input text',
        provider: 'openai-subscription',
        credential: { kind: 'local' },
        model: 'gpt-5.4-mini',
        prompt: {
          systemPrompt: '',
          userPrompt: '<input_text>{{text}}</input_text>'
        }
      })
    ).rejects.toThrow('OpenAI subscription transformation requires OAuth credentials.')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
