/*
Where: src/renderer/api-key-mask.test.ts
What: Unit tests for fixed API key mask contract.
Why: Issue #297 requires an exact constant-length redaction string.
*/

import { describe, expect, it } from 'vitest'
import { FIXED_API_KEY_MASK } from './api-key-mask'

describe('FIXED_API_KEY_MASK', () => {
  it('is exactly 50 asterisks', () => {
    expect(FIXED_API_KEY_MASK).toMatch(/^\*+$/)
    expect(FIXED_API_KEY_MASK).toHaveLength(50)
  })
})
