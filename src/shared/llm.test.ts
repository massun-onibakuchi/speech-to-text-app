// Where: src/shared/llm.test.ts
// What:  Unit tests for the shared future-provider LLM catalog and the narrower
// Why:   executable transformation subset used by the current runtime.

import { describe, expect, it } from 'vitest'
import {
  IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST,
  IMPLEMENTED_TRANSFORM_PROVIDER_IDS,
  LLM_MODEL_ALLOWLIST,
  LLM_PROVIDER_IDS,
  getLlmModelLabel,
  isAllowedImplementedTransformModel,
  isAllowedLlmModel
} from './llm'

describe('shared llm catalog', () => {
  it('captures planned providers in one future-facing catalog', () => {
    expect(LLM_PROVIDER_IDS).toEqual(['google', 'ollama', 'openai-subscription'])
    expect(LLM_MODEL_ALLOWLIST.ollama).toEqual([])
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.4-mini')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.4')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.3-codex')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.2-codex')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.2')
    expect(LLM_MODEL_ALLOWLIST['openai-subscription']).toContain('gpt-5.1-codex-mini')
  })

  it('keeps executable transformation support aligned with the unified provider catalog', () => {
    expect(IMPLEMENTED_TRANSFORM_PROVIDER_IDS).toEqual(['google', 'ollama', 'openai-subscription'])
    expect(IMPLEMENTED_TRANSFORM_MODEL_ALLOWLIST).toEqual({
      google: ['gemini-2.5-flash'],
      ollama: [],
      'openai-subscription': ['gpt-5.4-mini', 'gpt-5.4', 'gpt-5.3-codex', 'gpt-5.2-codex', 'gpt-5.2', 'gpt-5.1-codex-mini']
    })
  })

  it('uses raw model ids as display labels unless a known override exists', () => {
    expect(getLlmModelLabel('gemini-2.5-flash')).toBe('gemini-2.5-flash')
    expect(getLlmModelLabel('custom-local-model:latest')).toBe('custom-local-model:latest')
  })

  it('allows any non-empty Ollama model id while keeping hosted providers strict', () => {
    expect(isAllowedLlmModel('ollama', 'llama3.2:latest')).toBe(true)
    expect(isAllowedLlmModel('ollama', '   ')).toBe(false)
    expect(isAllowedLlmModel('google', 'gemini-2.5-flash')).toBe(true)
    expect(isAllowedLlmModel('google', 'llama3.2:latest')).toBe(false)
    expect(isAllowedImplementedTransformModel('openai-subscription', 'gpt-5.4-mini')).toBe(true)
    expect(isAllowedImplementedTransformModel('openai-subscription', 'llama3.2:latest')).toBe(false)
  })
})
