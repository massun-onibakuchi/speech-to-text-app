// Where: Shared module test.
// What: Unit tests for strict user-prompt template safety validation.
// Why: Lock placeholder-count and XML-boundary requirements for issue #392.

import { describe, expect, it } from 'vitest'
import {
  USER_PROMPT_BOUNDARY_ERROR,
  USER_PROMPT_PLACEHOLDER_COUNT_ERROR,
  validateSafeUserPromptTemplate
} from './prompt-template-safety'

describe('validateSafeUserPromptTemplate', () => {
  it('rejects whitespace-only templates', () => {
    expect(validateSafeUserPromptTemplate('   ')).toBe(USER_PROMPT_PLACEHOLDER_COUNT_ERROR)
  })

  it('rejects templates with multiple placeholders', () => {
    expect(validateSafeUserPromptTemplate('<input_text>{{text}}</input_text>\n<input_text>{{text}}</input_text>')).toBe(
      USER_PROMPT_PLACEHOLDER_COUNT_ERROR
    )
  })

  it('rejects malformed boundary tags', () => {
    expect(validateSafeUserPromptTemplate('<input_text>{{text}}</input_txt>')).toBe(USER_PROMPT_BOUNDARY_ERROR)
  })

  it('rejects wrong-case boundary tags', () => {
    expect(validateSafeUserPromptTemplate('<INPUT_TEXT>{{text}}</INPUT_TEXT>')).toBe(USER_PROMPT_BOUNDARY_ERROR)
  })

  it('accepts templates with surrounding instructions and one safe boundary', () => {
    expect(validateSafeUserPromptTemplate('Rewrite clearly.\n<input_text>{{text}}</input_text>')).toBeNull()
  })
})
