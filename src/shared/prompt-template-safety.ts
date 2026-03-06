// Where: Shared module (main + renderer).
// What: Prompt-template safety constants and validation for untrusted input boundaries.
// Why: Enforce a single, explicit XML boundary contract for user prompt templates.

export const INPUT_PLACEHOLDER = '{{text}}'
export const SAFE_INPUT_TEXT_TAG = 'input_text'
export const SAFE_INPUT_BOUNDARY_SNIPPET = `<${SAFE_INPUT_TEXT_TAG}>${INPUT_PLACEHOLDER}</${SAFE_INPUT_TEXT_TAG}>`

export const USER_PROMPT_PLACEHOLDER_COUNT_ERROR =
  'User prompt must include {{text}} exactly once.'
export const USER_PROMPT_BOUNDARY_ERROR =
  'User prompt must wrap {{text}} in <input_text>{{text}}</input_text>.'

const SAFE_INPUT_BOUNDARY_PATTERN = /<input_text>\s*\{\{text\}\}\s*<\/input_text>/

const countPlaceholderOccurrences = (value: string): number =>
  value.match(/\{\{text\}\}/g)?.length ?? 0

export const hasSafeInputBoundary = (value: string): boolean =>
  SAFE_INPUT_BOUNDARY_PATTERN.test(value)

export const validateSafeUserPromptTemplate = (value: string): string | null => {
  if (countPlaceholderOccurrences(value) !== 1) {
    return USER_PROMPT_PLACEHOLDER_COUNT_ERROR
  }
  if (!hasSafeInputBoundary(value)) {
    return USER_PROMPT_BOUNDARY_ERROR
  }
  return null
}
