// Where: src/main/orchestrators/capture-pipeline.test.ts
// What:  Tests for createCaptureProcessor — the snapshot-driven capture pipeline.
// Why:   Verify each stage (transcription, transformation, output commit, history),
//        failure modes, and Phase 2B preflight vs post-network error distinction.

import { describe, expect, it, vi } from 'vitest'
import { createCaptureProcessor, type CapturePipelineDeps } from './capture-pipeline'
import { buildCaptureRequestSnapshot } from '../test-support/factories'
import { SerialOutputCoordinator } from '../coordination/ordered-output-coordinator'
import type { TerminalJobStatus } from '../../shared/domain'

/** Builds a full set of mock dependencies for the capture pipeline. */
function makeDeps(overrides?: Partial<CapturePipelineDeps>): CapturePipelineDeps {
  return {
    secretStore: overrides?.secretStore ?? { getApiKey: vi.fn(() => 'test-key') },
    transcriptionService: overrides?.transcriptionService ?? {
      transcribe: vi.fn(async () => ({
        text: 'hello world',
        provider: 'groq' as const,
        model: 'whisper-large-v3-turbo' as const
      }))
    },
    transformationService: overrides?.transformationService ?? {
      transform: vi.fn(async () => ({
        text: 'hello world transformed',
        model: 'gemini-2.5-flash' as const
      }))
    },
    outputService: overrides?.outputService ?? {
      applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as TerminalJobStatus, message: null }))
    },
    historyService: overrides?.historyService ?? { appendRecord: vi.fn() },
    networkCompatibilityService: overrides?.networkCompatibilityService ?? {
      diagnoseGroqConnectivity: vi.fn(async () => ({
        reachable: true,
        provider: 'groq' as const,
        endpoint: 'https://api.groq.com',
        message: 'Groq endpoint is reachable.'
      }))
    },
    outputCoordinator: overrides?.outputCoordinator ?? new SerialOutputCoordinator(),
    soundService: overrides?.soundService ?? { play: vi.fn() }
  }
}

describe('createCaptureProcessor', () => {
  it('happy path: transcription + transformation + selected output only → succeeded', async () => {
    const deps = makeDeps()
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'default',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: 'sys',
        userPrompt: 'usr'
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('succeeded')
    expect(deps.transcriptionService.transcribe).toHaveBeenCalledOnce()
    expect(deps.transformationService.transform).toHaveBeenCalledWith({
      text: 'hello world',
      apiKey: 'test-key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      prompt: { systemPrompt: 'sys', userPrompt: 'usr' }
    })
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledWith('hello world transformed', snapshot.output.transformed)
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: 'hello world',
        transformedText: 'hello world transformed',
        terminalStatus: 'succeeded',
        failureCategory: null
      })
    )
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
    expect(deps.soundService!.play).toHaveBeenCalledWith('transformation_succeeded')
  })

  it('outputs transcript only when transcript is selected even if transformation succeeds', async () => {
    const deps = makeDeps()
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'default',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: 'sys',
        userPrompt: 'usr'
      },
      output: {
        selectedTextSource: 'transcript',
        transcript: { copyToClipboard: true, pasteAtCursor: true },
        transformed: { copyToClipboard: true, pasteAtCursor: true }
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('succeeded')
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledWith('hello world', snapshot.output.transcript)
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
    expect(deps.soundService!.play).toHaveBeenCalledWith('transformation_succeeded')
  })

  it('skips transformation when no profile is bound', async () => {
    const deps = makeDeps()
    const processor = createCaptureProcessor(deps)
    // transformationProfile defaults to null in buildCaptureRequestSnapshot
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('succeeded')
    expect(deps.transformationService.transform).not.toHaveBeenCalled()
    // Only transcript output, no transformed output
    expect(deps.outputService.applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: 'hello world',
        transformedText: null,
        terminalStatus: 'succeeded'
      })
    )
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
    expect(deps.soundService!.play).toHaveBeenCalledWith('transformation_succeeded')
  })

  // --- Phase 2B: preflight guard tests ---

  it('returns transcription_failed with failureCategory=preflight when STT API key is missing', async () => {
    const deps = makeDeps({
      secretStore: { getApiKey: vi.fn(() => null) }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.transcriptionService.transcribe).not.toHaveBeenCalled()
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureDetail: expect.stringContaining('API key'),
        failureCategory: 'preflight'
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('returns transcription_failed with failureCategory=preflight when STT model is unsupported', async () => {
    const deps = makeDeps()
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      sttProvider: 'groq',
      // Bypass TypeScript to test runtime preflight rejection of invalid model for this provider.
      sttModel: 'scribe_v2' as any
    })

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.transcriptionService.transcribe).not.toHaveBeenCalled()
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureCategory: 'preflight',
        failureDetail: expect.stringContaining('Unsupported STT model')
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('returns transformation_failed with failureCategory=preflight when LLM API key is missing (transcript still output)', async () => {
    const applyOutputWithDetail = vi.fn(async () => ({ status: 'succeeded' as TerminalJobStatus, message: null }))
    const getApiKey = vi.fn((provider: string) => (provider === 'groq' ? 'groq-key' : null))
    const deps = makeDeps({
      secretStore: { getApiKey },
      outputService: { applyOutputWithDetail }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'p1',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: '',
        userPrompt: ''
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('transformation_failed')
    // Spec 6.2: transcript must still be output even on transformation failure
    expect(applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(applyOutputWithDetail).toHaveBeenCalledWith('hello world', snapshot.output.transcript)
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: 'hello world',
        transformedText: null,
        terminalStatus: 'transformation_failed',
        failureCategory: 'preflight'
      })
    )
    expect(deps.soundService!.play).toHaveBeenCalledWith('transformation_failed')
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
  })

  // --- Phase 2B: post-network error classification tests ---

  it('classifies transcription 401 as failureCategory=api_auth', async () => {
    const deps = makeDeps({
      transcriptionService: {
        transcribe: vi.fn(async () => {
          throw new Error('Groq transcription failed with status 401')
        })
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureCategory: 'api_auth'
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('classifies transformation 401 as failureCategory=api_auth', async () => {
    const deps = makeDeps({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('Gemini transformation failed with status 401')
        })
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'p1',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: '',
        userPrompt: ''
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('transformation_failed')
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transformation_failed',
        failureCategory: 'api_auth'
      })
    )
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
  })

  it('classifies network errors as failureCategory=network', async () => {
    const deps = makeDeps({
      transcriptionService: {
        transcribe: vi.fn(async () => {
          throw new Error('fetch failed: getaddrinfo ENOTFOUND api.groq.com')
        })
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureCategory: 'network'
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('returns transcription_failed with failureCategory=network for timeout errors', async () => {
    const deps = makeDeps({
      transcriptionService: {
        transcribe: vi.fn(async () => {
          throw new Error('upstream timeout')
        })
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'transcription_failed',
        failureDetail: 'upstream timeout',
        failureCategory: 'network'
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('returns transformation_failed when transformation throws (transcript still output, failureDetail captured)', async () => {
    const applyOutputWithDetail = vi.fn(async () => ({ status: 'succeeded' as TerminalJobStatus, message: null }))
    const deps = makeDeps({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('gemini failure')
        })
      },
      outputService: { applyOutputWithDetail }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'p1',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: '',
        userPrompt: ''
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('transformation_failed')
    // Spec 6.2: transcript must still be output even on transformation failure
    expect(applyOutputWithDetail).toHaveBeenCalledTimes(1)
    expect(applyOutputWithDetail).toHaveBeenCalledWith('hello world', snapshot.output.transcript)
    // failureDetail should capture the error message
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        transcriptText: 'hello world',
        transformedText: null,
        terminalStatus: 'transformation_failed',
        failureDetail: 'gemini failure',
        failureCategory: 'unknown'
      })
    )
    expect(deps.soundService!.play).toHaveBeenCalledWith('transformation_failed')
    expect(deps.soundService!.play).toHaveBeenCalledTimes(1)
  })

  it('returns output_failed_partial when output application fails', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as TerminalJobStatus,
          message: 'Paste automation failed after 2 attempts. Verify Accessibility permission and focused target app.'
        }))
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot()

    const status = await processor(snapshot)

    expect(status).toBe('output_failed_partial')
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalStatus: 'output_failed_partial',
        failureDetail: expect.stringContaining('Paste automation failed after 2 attempts')
      })
    )
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('does not play completion success sound when output commit fails after successful transformation', async () => {
    const deps = makeDeps({
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as TerminalJobStatus,
          message: 'copy failed'
        }))
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({
      transformationProfile: {
        profileId: 'p1',
        provider: 'google',
        model: 'gemini-2.5-flash',
        baseUrlOverride: null,
        systemPrompt: '',
        userPrompt: ''
      }
    })

    const status = await processor(snapshot)

    expect(status).toBe('output_failed_partial')
    expect(deps.soundService!.play).not.toHaveBeenCalled()
  })

  it('enriches Groq transcription failures with network diagnostics', async () => {
    const deps = makeDeps({
      transcriptionService: {
        transcribe: vi.fn(async () => {
          throw new Error('fetch failed: getaddrinfo ENOTFOUND api.groq.com')
        })
      },
      networkCompatibilityService: {
        diagnoseGroqConnectivity: vi.fn(async () => ({
          reachable: false,
          provider: 'groq' as const,
          endpoint: 'https://api.groq.com',
          message: 'Failed to reach Groq endpoint.',
          guidance: 'If using VPN, configure split-tunnel allow for api.groq.com and retry.'
        }))
      }
    })
    const processor = createCaptureProcessor(deps)
    const snapshot = buildCaptureRequestSnapshot({ sttProvider: 'groq' })

    const status = await processor(snapshot)

    expect(status).toBe('transcription_failed')
    expect(deps.networkCompatibilityService.diagnoseGroqConnectivity).toHaveBeenCalledOnce()
    expect(deps.historyService.appendRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        failureDetail: expect.stringContaining('api.groq.com'),
        failureCategory: 'network'
      })
    )
  })

  it('releases output sequence on transcription failure so subsequent jobs are unblocked', async () => {
    const coordinator = new SerialOutputCoordinator()
    const deps = makeDeps({
      secretStore: { getApiKey: vi.fn(() => null) },
      outputCoordinator: coordinator
    })
    const processor = createCaptureProcessor(deps)

    // First job fails transcription — should release its sequence
    await processor(buildCaptureRequestSnapshot({ snapshotId: 'job-1' }))

    // Second job should be able to commit output (seq 1 after seq 0 released)
    const deps2 = makeDeps({ outputCoordinator: coordinator })
    const processor2 = createCaptureProcessor(deps2)
    const status = await processor2(buildCaptureRequestSnapshot({ snapshotId: 'job-2' }))
    expect(status).toBe('succeeded')
  })
})
