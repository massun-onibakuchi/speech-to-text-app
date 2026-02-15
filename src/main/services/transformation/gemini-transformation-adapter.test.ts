import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiTransformationAdapter } from './gemini-transformation-adapter'

describe('GeminiTransformationAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends provider-agnostic prompt blocks in Gemini request payload', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'transformed output' }] } }]
        })
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-1.5-flash-8b',
      prompt: {
        systemPrompt: 'system instruction',
        userPrompt: 'Rewrite this: {{input}}'
      }
    })

    expect(result.text).toBe('transformed output')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: unknown } | undefined]>
    const init = calls[0]?.[1]
    expect(init).toBeDefined()
    const body = JSON.parse(String(init?.body ?? '{}'))
    expect(body.contents[0].parts).toEqual([
      { text: 'System Prompt:\nsystem instruction' },
      { text: 'Rewrite this: input text' }
    ])
  })

  it('throws actionable error when Gemini response is non-OK', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 503,
        json: async () => ({})
      } as Response
    })

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    await expect(
      adapter.transform({
        text: 'input text',
        apiKey: 'g-key',
        model: 'gemini-1.5-flash-8b',
        prompt: {
          systemPrompt: '',
          userPrompt: '{{input}}'
        }
      })
    ).rejects.toThrow('Gemini transformation failed with status 503')
  })

  it('retries with fallback model when configured model returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({})
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'fallback transformed output' }] } }]
        })
      } as Response)

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-1.5-flash-8b',
      prompt: {
        systemPrompt: '',
        userPrompt: '{{input}}'
      }
    })

    expect(result.text).toBe('fallback transformed output')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? '')
    const secondUrl = String(fetchMock.mock.calls[1]?.[0] ?? '')
    expect(firstUrl).toContain('/models/gemini-1.5-flash-8b:generateContent')
    expect(secondUrl).toContain('/models/gemini-2.5-flash:generateContent')
  })
})
