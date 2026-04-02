// Where: Main-process local-LLM catalog tests.
// What:  Guards the curated model catalog and the product model-cap invariant.
// Why:   Prevent model sprawl and keep catalog ids aligned with the shared
//        cleanup-settings contract.

import { describe, expect, it } from 'vitest'
import * as v from 'valibot'
import {
  LOCAL_CLEANUP_MODEL_IDS,
  LocalCleanupModelIdSchema,
  MAX_SUPPORTED_LOCAL_MODELS
} from '../../../shared/local-llm'
import { SUPPORTED_LOCAL_CLEANUP_MODELS } from './catalog'

describe('SUPPORTED_LOCAL_CLEANUP_MODELS', () => {
  it('stays within the product model cap', () => {
    expect(SUPPORTED_LOCAL_CLEANUP_MODELS.length).toBeLessThanOrEqual(MAX_SUPPORTED_LOCAL_MODELS)
  })

  it('uses unique ids from the shared cleanup contract', () => {
    expect(new Set(SUPPORTED_LOCAL_CLEANUP_MODELS.map((model) => model.id)).size).toBe(
      SUPPORTED_LOCAL_CLEANUP_MODELS.length
    )

    for (const model of SUPPORTED_LOCAL_CLEANUP_MODELS) {
      expect(() => v.parse(LocalCleanupModelIdSchema, model.id)).not.toThrow()
    }

    expect(SUPPORTED_LOCAL_CLEANUP_MODELS.map((model) => model.id)).toEqual([...LOCAL_CLEANUP_MODEL_IDS])
  })

  it('keeps the shipped model metadata aligned with each explicit model id', () => {
    expect(SUPPORTED_LOCAL_CLEANUP_MODELS).toEqual([
      expect.objectContaining({
        id: 'qwen3.5:2b',
        label: 'Qwen 3.5 2B',
        size: '2b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'qwen3.5:4b',
        label: 'Qwen 3.5 4B',
        size: '4b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'sorc/qwen3.5-instruct:0.8b',
        label: 'Sorc Qwen 3.5 Instruct 0.8B',
        size: '0.8b',
        runtime: 'ollama'
      }),
      expect.objectContaining({
        id: 'sorc/qwen3.5-instruct-uncensored:2b',
        label: 'Sorc Qwen 3.5 Instruct Uncensored 2B',
        size: '2b',
        runtime: 'ollama'
      })
    ])
  })
})
