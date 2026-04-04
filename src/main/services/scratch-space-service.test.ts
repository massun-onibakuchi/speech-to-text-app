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

  it('hides the popup, restores focus, pastes, and clears the draft on success', async () => {
    const outputService = {
      applyOutputWithDetail: vi.fn(async () => ({
        status: 'succeeded' as const,
        message: null
      }))
    }
    const focusClient = {
      activateBundleId: vi.fn(async () => undefined)
    }
    const { service, draftService, windowService } = makeService({
      outputService,
      focusClient
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
    expect(windowService.hide).toHaveBeenCalledTimes(1)
    expect(focusClient.activateBundleId).toHaveBeenCalledWith('com.example.target')
    expect(outputService.applyOutputWithDetail).toHaveBeenCalledWith('POLISHED TEXT', {
      copyToClipboard: true,
      pasteAtCursor: true
    })
    expect(draftService.clearDraft).toHaveBeenCalledTimes(1)
    expect(windowService.clearTargetBundleId).toHaveBeenCalledTimes(1)
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
    expect(windowService.show).toHaveBeenCalledWith({ captureTarget: false })
    expect(draftService.clearDraft).not.toHaveBeenCalled()
  })
})
