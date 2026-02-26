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
  it('runs clipboard transform even when auto-run is off', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-2.5-flash' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: {
        getSettings: () => ({
          ...baseSettings,
          transformation: {
            ...baseSettings.transformation,
            autoRunDefaultTransform: false
          }
        })
      },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded', message: null })) } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'ok', message: 'transformed text' })
    expect(transform).toHaveBeenCalledOnce()
  })

  it('returns error when clipboard is empty', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => '  ' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform: vi.fn() } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded', message: null })) } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result.status).toBe('error')
    expect(result.message).toContain('Clipboard is empty')
  })

  it('returns transformed text on success path', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-2.5-flash' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) }
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'ok', message: 'transformed text' })
    expect(transform).toHaveBeenCalledWith({
      text: 'input text',
      apiKey: 'key',
      model: 'gemini-2.5-flash',
      baseUrlOverride: null,
      prompt: {
        systemPrompt: 'sys prompt',
        userPrompt: 'rewrite: {{input}}'
      }
    })
  })

  it('uses the default preset for manual clipboard transform when active/default differ', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-2.5-flash' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: {
        getSettings: () => ({
          ...baseSettings,
          transformation: {
            ...baseSettings.transformation,
            activePresetId: 'active-profile',
            defaultPresetId: 'default-profile',
            presets: [
              {
                ...baseSettings.transformation.presets[0],
                id: 'active-profile',
                name: 'Active',
                systemPrompt: 'active system',
                userPrompt: 'active: {{text}}'
              },
              {
                ...baseSettings.transformation.presets[0],
                id: 'default-profile',
                name: 'Default',
                systemPrompt: 'default system',
                userPrompt: 'default: {{text}}'
              }
            ]
          }
        })
      },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) }
    })

    await orchestrator.runCompositeFromClipboard()

    expect(transform).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: {
          systemPrompt: 'default system',
          userPrompt: 'default: {{text}}'
        }
      })
    )
  })

  it('uses topmost non-empty clipboard line for transform execution', async () => {
    const transform = vi.fn(async () => ({ text: 'transformed text', model: 'gemini-2.5-flash' as const }))
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'first item\nsecond item' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: { transform } as any,
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) }
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
      outputService: { applyOutputWithDetail: vi.fn(async () => ({ status: 'succeeded' as const, message: null })) }
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result).toEqual({ status: 'error', message: 'Transformation failed: network timeout' })
  })

  it('returns actionable output detail when paste-at-cursor partially fails', async () => {
    const orchestrator = new TransformationOrchestrator({
      settingsService: { getSettings: () => baseSettings },
      clipboardClient: { readText: () => 'input text' },
      secretStore: { getApiKey: () => 'key' },
      transformationService: {
        transform: vi.fn(async () => ({ text: 'transformed text', model: 'gemini-2.5-flash' as const }))
      } as any,
      outputService: {
        applyOutputWithDetail: vi.fn(async () => ({
          status: 'output_failed_partial' as const,
          message: 'Paste automation failed after 2 attempts. Verify Accessibility permission and focused target app.'
        }))
      } as any
    })

    const result = await orchestrator.runCompositeFromClipboard()
    expect(result.status).toBe('error')
    expect(result.message).toContain('output application partially failed')
    expect(result.message).toContain('Paste automation failed after 2 attempts')
  })
})
