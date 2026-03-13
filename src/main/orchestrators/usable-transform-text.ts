// Where: src/main/orchestrators/usable-transform-text.ts
// What: Shared helper for determining whether transformed model output is usable.
// Why: Empty or whitespace-only transform results must be treated as failures by
// capture and standalone transform pipelines instead of being emitted as success.

export const hasUsableTransformText = (text: string | null | undefined): text is string =>
  typeof text === 'string' && text.trim().length > 0
