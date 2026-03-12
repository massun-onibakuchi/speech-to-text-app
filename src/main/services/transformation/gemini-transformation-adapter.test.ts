import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeminiTransformationAdapter } from './gemini-transformation-adapter'

describe('GeminiTransformationAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends system prompt via system_instruction and user text via contents', async () => {
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
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: 'system instruction',
        userPrompt: 'Rewrite this.\n<input_text>{{text}}</input_text>'
      }
    })

    expect(result.text).toBe('transformed output')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: unknown } | undefined]>
    const init = calls[0]?.[1]
    expect(init).toBeDefined()
    const body = JSON.parse(String(init?.body ?? '{}'))
    expect(body.system_instruction).toEqual({
      parts: [{ text: 'system instruction' }]
    })
    expect(body.contents[0].parts).toEqual([{ text: 'Rewrite this.\n<input_text>input text</input_text>' }])
  })

  it('includes serialized context payload blocks before the user prompt when provided', async () => {
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
    await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: '',
        userPrompt: '<input_text>{{text}}</input_text>'
      },
      contextPayload: {
        version: 'v1',
        metadata: {
          sessionId: 'session-1',
          language: 'en',
          currentSequence: 3
        },
        currentSegment: {
          sequence: 3,
          text: 'input text',
          startedAt: '2026-03-07T00:00:03.000Z',
          endedAt: '2026-03-07T00:00:04.000Z'
        },
        recentWindow: [
          {
            sequence: 2,
            text: 'previous text',
            startedAt: '2026-03-07T00:00:02.000Z',
            endedAt: '2026-03-07T00:00:03.000Z'
          }
        ],
        rollingSummary: {
          text: 'summary text',
          refreshedAt: '2026-03-07T00:00:02.500Z',
          sourceThroughSequence: 1
        }
      }
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: unknown } | undefined]>
    const init = calls[0]?.[1]
    const body = JSON.parse(String(init?.body ?? '{}'))
    expect(body.contents[0].parts).toEqual([
      {
        text: `<transformation_context version="v1">\n<metadata session_id="session-1" language="en" current_sequence="3" />\n<current_segment sequence="3" started_at="2026-03-07T00:00:03.000Z" ended_at="2026-03-07T00:00:04.000Z">input text</current_segment>\n<recent_window>\n<window_segment sequence="2" started_at="2026-03-07T00:00:02.000Z" ended_at="2026-03-07T00:00:03.000Z">previous text</window_segment>\n</recent_window>\n<rolling_summary refreshed_at="2026-03-07T00:00:02.500Z" source_through_sequence="1">summary text</rolling_summary>\n</transformation_context>`
      },
      {
        text: '<input_text>input text</input_text>'
      }
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
        model: 'gemini-2.5-flash',
        prompt: {
          systemPrompt: '',
          userPrompt: '<input_text>{{text}}</input_text>'
        }
      })
    ).rejects.toThrow('Gemini transformation failed with status 503')
  })

  it('uses baseUrlOverride when provided', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'override transformed output' }] } }]
        })
      } as Response)

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: 'https://gemini-proxy.local/',
      prompt: {
        systemPrompt: '',
        userPrompt: '<input_text>{{text}}</input_text>'
      }
    })

    expect(result.text).toBe('override transformed output')
    expect(result.model).toBe('gemini-2.5-flash')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstUrl = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(firstUrl).toBe('https://gemini-proxy.local/v1beta/models/gemini-2.5-flash:generateContent')
  })

  it('concatenates multipart text responses from the first candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: 'first ' },
                { text: 'second' },
                {},
                { text: ' third' }
              ]
            }
          }
        ]
      })
    } as Response)

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: '',
        userPrompt: '<input_text>{{text}}</input_text>'
      }
    })

    expect(result.text).toBe('first second third')
  })

  it('does not drop later text parts when the first part is empty', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                { text: '' },
                { text: 'usable output' }
              ]
            }
          }
        ]
      })
    } as Response)

    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    const result = await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: '',
        userPrompt: '<input_text>{{text}}</input_text>'
      }
    })

    expect(result.text).toBe('usable output')
  })

  it('rejects invalid protocol in baseUrlOverride', async () => {
    const adapter = new GeminiTransformationAdapter()
    await expect(
      adapter.transform({
        text: 'input',
        apiKey: 'key',
        model: 'gemini-2.5-flash',
        baseUrlOverride: 'ftp://bad.com',
        prompt: { systemPrompt: '', userPrompt: '<input_text>{{text}}</input_text>' }
      })
    ).rejects.toThrow(/protocol/i)
  })

  it('rejects malformed baseUrlOverride', async () => {
    const adapter = new GeminiTransformationAdapter()
    await expect(
      adapter.transform({
        text: 'input',
        apiKey: 'key',
        model: 'gemini-2.5-flash',
        baseUrlOverride: 'not a url',
        prompt: { systemPrompt: '', userPrompt: '<input_text>{{text}}</input_text>' }
      })
    ).rejects.toThrow(/invalid baseUrlOverride/i)
  })

  it('treats empty-string baseUrlOverride as null (uses default)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    await adapter.transform({
      text: 'input',
      apiKey: 'key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: '',
      prompt: { systemPrompt: '', userPrompt: '<input_text>{{text}}</input_text>' }
    })

    const url = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(url).toContain('generativelanguage.googleapis.com')
  })

  it('treats whitespace-only baseUrlOverride as null (uses default)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    await adapter.transform({
      text: 'input',
      apiKey: 'key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: '   ',
      prompt: { systemPrompt: '', userPrompt: '<input_text>{{text}}</input_text>' }
    })

    const url = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(url).toContain('generativelanguage.googleapis.com')
  })

  it('does not retry fallback model when configured model returns 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({})
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GeminiTransformationAdapter()
    await expect(
      adapter.transform({
        text: 'input text',
        apiKey: 'g-key',
        model: 'gemini-2.5-flash',
        prompt: {
          systemPrompt: '',
          userPrompt: '<input_text>{{text}}</input_text>'
        }
      })
    ).rejects.toThrow('Gemini transformation failed with status 404')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('omits system_instruction when system prompt is blank', async () => {
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
    await adapter.transform({
      text: 'input text',
      apiKey: 'g-key',
      model: 'gemini-2.5-flash',
      prompt: {
        systemPrompt: '   ',
        userPrompt: '<input_text>{{text}}</input_text>'
      }
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: unknown } | undefined]>
    const init = calls[0]?.[1]
    const body = JSON.parse(String(init?.body ?? '{}'))
    expect(body.system_instruction).toBeUndefined()
    expect(body.contents[0].parts).toEqual([{ text: '<input_text>input text</input_text>' }])
  })
})
