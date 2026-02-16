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
        audioFilePath: audioPath,
        language: 'auto',
        temperature: 0
      })
    ).rejects.toThrow('ElevenLabs transcription failed with status 401')
  })
})
