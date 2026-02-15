import { describe, expect, it, vi } from 'vitest'
import type { TransformationAdapter } from './transformation/types'
import { TransformationService } from './transformation-service'

describe('TransformationService', () => {
  it('rejects disallowed model', async () => {
    const adapter: TransformationAdapter = {
      transform: vi.fn()
    }

    const service = new TransformationService(adapter)

    await expect(
      service.transform({
        text: 'hello',
        apiKey: 'test',
        model: 'gemini-1.5-flash-8b-x' as any,
        prompt: {
          systemPrompt: '',
          userPrompt: ''
        }
      })
    ).rejects.toThrow('not allowed')
  })

  it('calls adapter for allowed model', async () => {
    const adapter: TransformationAdapter = {
      transform: vi.fn(async () => ({ text: 'x', model: 'gemini-1.5-flash-8b' as const }))
    }

    const service = new TransformationService(adapter)
    const result = await service.transform({
      text: 'hello',
      apiKey: 'test',
      model: 'gemini-1.5-flash-8b',
      prompt: {
        systemPrompt: 's',
        userPrompt: 'u'
      }
    })

    expect(adapter.transform).toHaveBeenCalledTimes(1)
    expect(result.text).toBe('x')
  })
})
