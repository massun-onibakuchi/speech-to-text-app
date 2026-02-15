import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type Settings } from '../../shared/domain'
import { TransformationOrchestrator } from './transformation-orchestrator'

const baseSettings: Settings = {
  ...DEFAULT_SETTINGS,
  transformation: {
    ...DEFAULT_SETTINGS.transformation,
    activePresetId: 'default',
    defaultPresetId: 'default',
    presets: [
      {
        ...DEFAULT_SETTINGS.transformation.presets[0],
        id: 'default',
        name: 'Default',
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    ]
  }
}

describe('TransformationOrchestrator', () => {
  it('returns error when transformation is disabled', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: {
        getSettings: () => ({
          ...baseSettings,
          transformation: {
            ...baseSettings.transformation,
            enabled: false
          }
        })
      },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded') } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'error', message: 'Transformation is disabled in Settings.' })
  })

  it('returns error when clipboard is empty', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => '  ' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded') } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result.status).toBe('error')
    expect(result.message).toContain('Clipboard is empty')
  })

  it('returns transformed text on success path', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-1.5-flash-8b' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded' as const) }
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'ok', message: 'transformed text' })
    expect(transform).toHaveBeenCalledWith({
      text: 'input text',
      apiKey: 'key',
      model: 'gemini-1.5-flash-8b',
      prompt: {
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    })
  })

  it('uses topmost non-empty clipboard line for transform execution', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-1.5-flash-8b' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'first item\nsecond item' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded' as const) }
    })

    await orchestrator.runCompositeFromClipboard()
    expect(transform).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'first item'
      })
    )
  })

  it('returns transformation error detail from adapter failure', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform: vi.fn(async () => Promise.reject(new Error('network timeout'))) } as any,
      outputService: { applyOutput: vi.fn(async () => 'succeeded' as const) }
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'error', message: 'Transformation failed: network timeout' })
  })
})
