/**
 * Where: src/main/core/transformation-error-messages.ts
 * What: Shared user-facing error message constants for transformation shortcut flows.
 * Why: Keep wording consistent between hotkey pre-validation and router defense-in-depth checks.
 */

export const SELECTION_EMPTY_MESSAGE = 'No text selected. Highlight text in the target app and try again.'

export const SELECTION_READ_FAILED_MESSAGE =
  'Failed to read selected text. Verify Accessibility permission and keep the target app focused, then try again.'
