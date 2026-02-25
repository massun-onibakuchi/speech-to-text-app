import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ElevenLabsTranscriptionAdapter } from './elevenlabs-transcription-adapter'

describe('ElevenLabsTranscriptionAdapter', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    vi.unstubAllGlobals()
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()
      if (dir) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('posts audio to canonical ElevenLabs speech-to-text endpoint', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ text: 'hello world' })
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    const result = await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'el-key',
      audioFilePath: audioPath,
      language: 'auto',
      temperature: 0
    })

    expect(result).toEqual({
      text: 'hello world',
      provider: 'elevenlabs',
      model: 'scribe_v2'
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://api.elevenlabs.io/v1/speech-to-text')
    const init = calls[0]?.[1]
    expect(init).toBeDefined()
    const typedInit = init as RequestInit
    expect(typedInit.method).toBe('POST')
    expect((typedInit.headers as Record<string, string>)['xi-api-key']).toBe('el-key')
    expect(typedInit.body).toBeInstanceOf(FormData)
  })

  it('omits language_code when input language is auto (provider auto-detect)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'hola' }) } as Response))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'el-key',
      audioFilePath: audioPath,
      language: 'AUTO'
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    const body = calls[0]?.[1]?.body as FormData
    expect(body.get('language_code')).toBeNull()
  })

  it('passes explicit language override using ElevenLabs language_code field', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ text: 'bonjour' }) } as Response))
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'el-key',
      audioFilePath: audioPath,
      language: 'fr'
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    const body = calls[0]?.[1]?.body as FormData
    expect(body.get('language_code')).toBe('fr')
  })

  it('throws actionable error when ElevenLabs response is non-OK', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({})
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'elevenlabs',
        model: 'scribe_v2',
        apiKey: 'bad-key',
        baseUrlOverride: null,
        audioFilePath: audioPath,
        language: 'auto',
        temperature: 0
      })
    ).rejects.toThrow('ElevenLabs transcription failed with status 401')
  })

  it('rejects invalid protocol in baseUrlOverride', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const adapter = new ElevenLabsTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'elevenlabs',
        model: 'scribe_v2',
        apiKey: 'key',
        baseUrlOverride: 'javascript:alert(1)',
        audioFilePath: audioPath
      })
    ).rejects.toThrow(/protocol/i)
  })

  it('rejects malformed baseUrlOverride', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const adapter = new ElevenLabsTranscriptionAdapter()
    await expect(
      adapter.transcribe({
        provider: 'elevenlabs',
        model: 'scribe_v2',
        apiKey: 'key',
        baseUrlOverride: '://broken',
        audioFilePath: audioPath
      })
    ).rejects.toThrow(/invalid baseUrlOverride/i)
  })

  it('treats empty-string baseUrlOverride as null (uses default)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello' })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'key',
      baseUrlOverride: '',
      audioFilePath: audioPath
    })

    const url = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text')
  })

  it('treats whitespace-only baseUrlOverride as null (uses default)', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'hello' })
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'key',
      baseUrlOverride: '\t  \n',
      audioFilePath: audioPath
    })

    const url = String(fetchMock.mock.calls[0]?.[0] ?? '')
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text')
  })

  it('uses baseUrlOverride when provided', async () => {
    const root = mkdtempSync(join(tmpdir(), 'elevenlabs-adapter-'))
    tempDirs.push(root)
    const audioPath = join(root, 'sample.webm')
    writeFileSync(audioPath, Buffer.from([0x01, 0x02, 0x03]))

    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ text: 'hello world' })
      } as Response
    })
    vi.stubGlobal('fetch', fetchMock)

    const adapter = new ElevenLabsTranscriptionAdapter()
    await adapter.transcribe({
      provider: 'elevenlabs',
      model: 'scribe_v2',
      apiKey: 'el-key',
      baseUrlOverride: 'https://stt-proxy.local/',
      audioFilePath: audioPath
    })

    const calls = fetchMock.mock.calls as unknown as Array<[unknown, RequestInit | undefined]>
    expect(calls[0]?.[0]).toBe('https://stt-proxy.local/v1/speech-to-text')
  })
})
