// Where: src/shared/llm.test.ts
// What:  Unit tests for the shared future-provider LLM catalog and the narrower
// Why:   executable transformation subset used by the current runtime.

import { describe, expect, it } from 'vitest'
import {
  IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST,
  IMPLEMENTED_TRANSFORM_PROVIDER_IDS,
  LLM_MODEL_ALLOWLIST,
  LLM_PROVIDER_IDS
} from './llm'

describe('shared llm catalog', () => {
  it('captures planned providers in one future-facing catalog', () => {
    expect(LLM_PROVIDER_IDS).toEqual(['google', 'ollama', 'openai-subscription'])
    expect(LLM_MODEL_ALLOWLIST.ollama).toContain('sorc/qwen3.5-instruct:0.8b')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toEqual(['gpt-5.4-mini'])
  })

  it('keeps executable transformation support aligned with the unified provider catalog', () => {
    expect(IMPLEMENTED_TRANSFORM_PROVIDER_IDS).toEqual(['google', 'ollama', 'openai-subscription'])
    expect(IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST).toEqual({
      google: ['gemini-2.5-flash'],
      ollama: [
        'qwen3.5:2b',
        'qwen3.5:4b',
        'sorc/qwen3.5-instruct:0.8b',
        'sorc/qwen3.5-instruct-uncensored:2b'
      ],
      'openai-subscription': ['gpt-5.4-mini']
    })
  })
})
