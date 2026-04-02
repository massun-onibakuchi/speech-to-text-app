// Where: Shared local-LLM contract module.
// What:  Settings-safe runtime/model identifiers and defaults for local cleanup.
// Why:   Keep local-LLM policy out of the broad domain module while sharing the
//        minimal contract needed by main and renderer code.

import * as v from 'valibot'

export const MAX_SUPPORTED_LOCAL_MODELS = 5

export const LOCAL_CLEANUP_RUNTIME_IDS = ['ollama'] as const
export type LocalCleanupRuntimeId = (typeof LOCAL_CLEANUP_RUNTIME_IDS)[number]
export const LocalCleanupRuntimeIdSchema = v.picklist([...LOCAL_CLEANUP_RUNTIME_IDS])

export const LOCAL_CLEANUP_MODEL_IDS = [
  'qwen3.5:2b',
  'qwen3.5:4b',
  'sorc/qwen3.5-instruct:0.8b',
  'sorc/qwen3.5-instruct-uncensored:2b'
] as const
export type LocalCleanupModelId = (typeof LOCAL_CLEANUP_MODEL_IDS)[number]
export const LocalCleanupModelIdSchema = v.picklist([...LOCAL_CLEANUP_MODEL_IDS])

export const CleanupSettingsSchema = v.strictObject({
  enabled: v.boolean(),
  runtime: LocalCleanupRuntimeIdSchema,
  localModelId: LocalCleanupModelIdSchema
})
export type CleanupSettings = v.InferOutput<typeof CleanupSettingsSchema>

export const DEFAULT_CLEANUP_SETTINGS: CleanupSettings = {
  enabled: false,
  runtime: 'ollama',
  localModelId: 'qwen3.5:2b'
}
