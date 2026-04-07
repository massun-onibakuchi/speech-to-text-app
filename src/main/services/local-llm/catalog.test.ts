// Where: Main-process local-LLM catalog tests.
// What:  Guards the curated Ollama transformation model catalog and cap.
// Why:   Prevent model sprawl and keep runtime ids aligned with the shared
//        local-model contract.

import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  LOCAL_LLM_MODEL_IDS,
  LocalLlmModelIdSchema,
  MAX_SUPPORTED_LOCAL_MODELS
} from '../../../shared/local-llm'
import { SUPPORTED_LOCAL_LLM_MODELS } from './catalog'

describe('SUPPORTED_LOCAL_LLM_MODELS', () => {
  it('stays within the product model cap', () => {
    expect(SUPPORTED_LOCAL_LLM_MODELS.length).toBeLessThanOrEqual(MAX_SUPPORTED_LOCAL_MODELS)
  })

  it('uses unique ids from the shared local model contract', () => {
    expect(new Set(SUPPORTED_LOCAL_LLM_MODELS.map((model) => model.id)).size).toBe(
      SUPPORTED_LOCAL_LLM_MODELS.length
    )

    for (const model of SUPPORTED_LOCAL_LLM_MODELS) {
      expect(() => v.parse(LocalLlmModelIdSchema, model.id)).not.toThrow()
    }

    expect(SUPPORTED_LOCAL_LLM_MODELS.map((model) => model.id)).toEqual([...LOCAL_LLM_MODEL_IDS])
  })

  it('keeps the shipped model metadata aligned with each explicit model id', () => {
    expect(SUPPORTED_LOCAL_LLM_MODELS).toEqual([
      expect.objectContaining({
        id: 'qwen3.5:2b',
        label: 'qwen3.5:2b',
        size: '2b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'qwen3.5:4b',
        label: 'qwen3.5:4b',
        size: '4b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate',
        label: 'mitmul/plamo-2-translate',
        size: '8b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:Q2_K',
        label: 'mitmul/plamo-2-translate:Q2_K',
        size: '8b',
        runtime: 'ollama',
        quantization: 'Q2_K'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:Q3_K_M',
        label: 'mitmul/plamo-2-translate:Q3_K_M',
        size: '8b',
        runtime: 'ollama',
        quantization: 'Q3_K_M'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:Q4_K_M',
        label: 'mitmul/plamo-2-translate:Q4_K_M',
        size: '8b',
        runtime: 'ollama',
        quantization: 'Q4_K_M'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:IQ2_M',
        label: 'mitmul/plamo-2-translate:IQ2_M',
        size: '8b',
        runtime: 'ollama',
        quantization: 'IQ2_M'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:IQ2_S',
        label: 'mitmul/plamo-2-translate:IQ2_S',
        size: '8b',
        runtime: 'ollama',
        quantization: 'IQ2_S'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:IQ2_XS',
        label: 'mitmul/plamo-2-translate:IQ2_XS',
        size: '8b',
        runtime: 'ollama',
        quantization: 'IQ2_XS'
      }),
      expect.objectContaining({
        id: 'mitmul/plamo-2-translate:IQ2_XXS',
        label: 'mitmul/plamo-2-translate:IQ2_XXS',
        size: '8b',
        runtime: 'ollama',
        quantization: 'IQ2_XXS'
      }),
      expect.objectContaining({
        id: 'sorc/qwen3.5-instruct:0.8b',
        label: 'sorc/qwen3.5-instruct:0.8b',
        size: '0.8b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'sorc/qwen3.5-instruct-uncensored:2b',
        label: 'sorc/qwen3.5-instruct-uncensored:2b',
        size: '2b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'gemma4:e2b-it-q4_K_M:think',
        ollamaId: 'gemma4:e2b-it-q4_K_M',
        label: 'gemma4:e2b-it-q4_K_M (thinking)',
        size: 'e2b',
        runtime: 'ollama',
        quantization: 'Q4_K_M',
        think: true
      }),
      expect.objectContaining({
        id: 'gemma4:e2b-it-q4_K_M:no-think',
        ollamaId: 'gemma4:e2b-it-q4_K_M',
        label: 'gemma4:e2b-it-q4_K_M',
        size: 'e2b',
        runtime: 'ollama',
        quantization: 'Q4_K_M',
        think: false
      }),
      expect.objectContaining({
        id: 'gemma4:e4b-it-q4_K_M:think',
        ollamaId: 'gemma4:e4b-it-q4_K_M',
        label: 'gemma4:e4b-it-q4_K_M (thinking)',
        size: 'e4b',
        runtime: 'ollama',
        quantization: 'Q4_K_M',
        think: true
      }),
      expect.objectContaining({
        id: 'gemma4:e4b-it-q4_K_M:no-think',
        ollamaId: 'gemma4:e4b-it-q4_K_M',
        label: 'gemma4:e4b-it-q4_K_M',
        size: 'e4b',
        runtime: 'ollama',
        quantization: 'Q4_K_M',
        think: false
      })
    ])
  })
})
