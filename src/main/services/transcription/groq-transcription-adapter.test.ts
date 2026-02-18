// Where: src/main/services/transcription/groq-transcription-adapter.test.ts
// What:  Unit tests for Groq transcription adapter.
// Why:   Covers baseline transcription, error handling, and baseUrlOverride
//        edge cases (empty, whitespace, invalid protocol, malformed URL).

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroqTranscriptionAdapter } from './groq-transcription-adapter'

describe('GroqTranscriptionAdapter', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.unstubAllGlobals()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })

  /** Create a disposable temp audio file for each test. */
  const makeTempAudio = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'groq-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))
    return audioPath
  }

  it('posts audio to canonical Groq transcription endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'hello world' })
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GroqTranscriptionAdapter()
    const result = await adapter.transcribe({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      apiKey: 'groq-key',
      audioFilePath: makeTempAudio(),
      language: 'en',
      temperature: 0
    })

    expect(result).toEqual({
      text: 'hello world',
      provider: 'groq',
      model: 'whisper-large-v3-turbo'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    const init = calls[0]?.[1]
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer groq-key')
    expect(init?.body).toBeInstanceOf(FormData)
  })

  it('throws actionable error when Groq response is non-OK', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({})
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GroqTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        apiKey: 'bad-key',
        audioFilePath: makeTempAudio()
      })
    ).rejects.toThrow('Groq transcription failed with status 401')
  })

  it('uses baseUrlOverride when provided', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'proxied' })
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GroqTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      apiKey: 'groq-key',
      baseUrlOverride: 'https://stt-proxy.local/',
      audioFilePath: makeTempAudio()
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://stt-proxy.local/openai/v1/audio/transcriptions')
  })

  it('rejects invalid protocol in baseUrlOverride', async () => {
    const adapter = new GroqTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        apiKey: 'key',
        baseUrlOverride: 'ftp://bad.com',
        audioFilePath: makeTempAudio()
      })
    ).rejects.toThrow(/protocol/i)
  })

  it('rejects malformed baseUrlOverride', async () => {
    const adapter = new GroqTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'groq',
        model: 'whisper-large-v3-turbo',
        apiKey: 'key',
        baseUrlOverride: 'not a url',
        audioFilePath: makeTempAudio()
      })
    ).rejects.toThrow(/invalid baseUrlOverride/i)
  })

  it('treats empty-string baseUrlOverride as null (uses default)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'ok' })
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GroqTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      apiKey: 'key',
      baseUrlOverride: '',
      audioFilePath: makeTempAudio()
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
  })

  it('treats whitespace-only baseUrlOverride as null (uses default)', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ text: 'ok' })
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new GroqTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      apiKey: 'key',
      baseUrlOverride: '   ',
      audioFilePath: makeTempAudio()
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
  })
})
