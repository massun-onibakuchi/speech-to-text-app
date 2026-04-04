/**
 * Where: src/main/services/scratch-space-service.test.ts
 * What:  Tests scratch-space transcription and forced paste execution behavior.
 * Why:   The popup flow must append speech into the draft and always paste back
 *        to the pre-popup target app while clearing the draft only on success.
 */

import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/domain'
import { ScratchSpaceService } from './scratch-space-service'

describe('ScratchSpaceService', () => {
  const makeService = (
    overrides?: Partial<Parameters<typeof ScratchSpaceService.create>[0]>
  ) => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    const draftService = {
      clearDraft: vi.fn(),
      getDraft: vi.fn(() => 'draft'),
      saveDraft: vi.fn()
    }
    const windowService = {
      clearTargetBundleId: vi.fn(),
      getTargetBundleId: vi.fn(() => 'com.example.target'),
      hide: vi.fn(),
      show: vi.fn(async () => undefined)
    }

    return {
      service: ScratchSpaceService.create({
        settingsService: { getSettings: () => settings },
        recordingOrchestrator: {
          submitRecordedAudio: vi.fn(() => ({
            jobId: 'capture-1',
            audioFilePath: '/tmp/scratch-space-audio.webm',
            capturedAt: '2026-03-26T00:00:00.000Z'
          }))
        },
        secretStore: {
          getApiKey: vi.fn((provider: string) => `${provider}-key`)
        },
        transcriptionService: {
          transcribe: vi.fn(async () => ({
            text: 'spoken codex',
            provider: 'groq' as const,
            model: 'whisper-large-v3-turbo' as const
          }))
        },
        transformationService: {
          transform: vi.fn(async () => ({
            text: 'POLISHED TEXT',
            provider: 'google' as const,
            model: 'gemini-2.5-flash' as const
          }))
        },
        outputService: {
          applyOutputWithDetail: vi.fn(async () => ({
            status: 'succeeded' as const,
            message: null
          }))
        },
        draftService,
        windowService,
        focusClient: {
          activateBundleId: vi.fn(async () => undefined)
        },
        waitFn: vi.fn(async () => undefined),
        ...(overrides ?? {})
      }),
      draftService,
      windowService,
      settings
    }
  }

  it('transcribes scratch-space audio and applies dictionary correction', async () => {
    const { service, settings } = makeService()
    settings.correction.dictionary.entries = [{ key: 'codex', value: 'Codex' }]

    const result = await service.transcribeAudio({
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      capturedAt: '2026-03-26T00:00:00.000Z'
    })

    expect(result).toEqual({
      status: 'ok',
      message: 'Speech captured.',
      text: 'spoken Codex'
    })
  })

  it('hides the popup before the LLM call, restores focus, pastes, and clears the draft on success', async () => {
    const callOrder: string[] = []
    const outputService = {
      applyOutputWithDetail: vi.fn(async () => {
        callOrder.push('paste')
        return { status: 'succeeded' as const, message: null }
      })
    }
    const focusClient = {
      activateBundleId: vi.fn(async () => {
        callOrder.push('activate')
      })
    }
    const { service, draftService, windowService } = makeService({
      outputService,
      focusClient,
      transformationService: {
        transform: vi.fn(async () => {
          callOrder.push('llm')
          return { text: 'POLISHED TEXT', provider: 'google' as const, model: 'gemini-2.5-flash' as const }
        })
      }
    })
    windowService.hide.mockImplementation(() => {
      callOrder.push('hide')
    })

    const result = await service.runTransformation({
      text: 'hello world',
      presetId: 'default'
    })

    expect(result).toEqual({
      status: 'ok',
      message: 'Scratch space pasted.',
      text: 'POLISHED TEXT'
    })
    // hide must happen before the LLM call, which must happen before paste
    expect(callOrder).toEqual(['hide', 'llm', 'activate', 'paste'])
    expect(windowService.hide).toHaveBeenCalledTimes(1)
    expect(windowService.show).not.toHaveBeenCalled()
    expect(focusClient.activateBundleId).toHaveBeenCalledWith('com.example.target')
    expect(outputService.applyOutputWithDetail).toHaveBeenCalledWith('POLISHED TEXT', {
      copyToClipboard: true,
      pasteAtCursor: true
    })
    expect(draftService.clearDraft).toHaveBeenCalledTimes(1)
    expect(windowService.clearTargetBundleId).toHaveBeenCalledTimes(1)
  })

  it('hides the popup and re-shows it exactly once when the LLM transformation fails', async () => {
    const { service, draftService, windowService } = makeService({
      transformationService: {
        transform: vi.fn(async () => {
          throw new Error('LLM quota exceeded')
        })
      }
    })

    const result = await service.runTransformation({
      text: 'hello world',
      presetId: 'default'
    })

    expect(result.status).toBe('error')
    expect(result.message).toContain('LLM quota exceeded')
    // Window must have been hidden before the LLM call, then re-shown exactly once on failure
    expect(windowService.hide).toHaveBeenCalledTimes(1)
    expect(windowService.show).toHaveBeenCalledTimes(1)
    expect(windowService.show).toHaveBeenCalledWith({ captureTarget: false })
    expect(draftService.clearDraft).not.toHaveBeenCalled()
  })

  it('does not hide the popup for validation errors (empty text)', async () => {
    const { service, windowService } = makeService()

    const result = await service.runTransformation({
      text: '   ',
      presetId: 'default'
    })

    expect(result.status).toBe('error')
    expect(windowService.hide).not.toHaveBeenCalled()
    expect(windowService.show).not.toHaveBeenCalled()
  })

  it('re-shows the popup when no transformation preset is available', async () => {
    const { service, windowService, settings } = makeService()
    // Remove all presets so resolvePreset returns null
    settings.transformation.presets = []
    settings.transformation.defaultPresetId = ''

    const result = await service.runTransformation({
      text: 'hello world',
      presetId: 'nonexistent'
    })

    expect(result.status).toBe('error')
    expect(result.message).toContain('No transformation preset')
    // Window was hidden by renderer fire-and-forget; service must re-show it
    expect(windowService.hide).not.toHaveBeenCalled()
    expect(windowService.show).toHaveBeenCalledTimes(1)
    expect(windowService.show).toHaveBeenCalledWith({ captureTarget: false })
  })

  it('re-shows the popup when targetBundleId is missing', async () => {
    const overrideWindowService = {
      clearTargetBundleId: vi.fn(),
      getTargetBundleId: vi.fn(() => null as string | null),
      hide: vi.fn(),
      show: vi.fn(async () => undefined)
    }
    const { service } = makeService({ windowService: overrideWindowService })

    const result = await service.runTransformation({
      text: 'hello world',
      presetId: 'default'
    })

    expect(result.status).toBe('error')
    expect(result.message).toContain('Unable to restore the target app')
    // Window was hidden by renderer fire-and-forget; service must re-show it
    expect(overrideWindowService.hide).not.toHaveBeenCalled()
    expect(overrideWindowService.show).toHaveBeenCalledTimes(1)
    expect(overrideWindowService.show).toHaveBeenCalledWith({ captureTarget: false })
  })

  it('re-shows the popup and keeps the draft when paste application fails', async () => {
    const outputService = {
      applyOutputWithDetail: vi.fn(async () => ({
        status: 'output_failed_partial' as const,
        message: 'Accessibility permission is missing.'
      }))
    }
    const { service, draftService, windowService } = makeService({
      outputService
    })

    const result = await service.runTransformation({
      text: 'hello world',
      presetId: 'default'
    })

    expect(result.status).toBe('error')
    expect(result.message).toContain('Accessibility permission is missing.')
    expect(windowService.hide).toHaveBeenCalledTimes(1)
    expect(windowService.show).toHaveBeenCalledWith({ captureTarget: false })
    expect(draftService.clearDraft).not.toHaveBeenCalled()
  })
})
