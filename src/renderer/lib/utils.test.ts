/*
 * Where: src/renderer/lib/utils.test.ts
 * What: Tests for the cn() class-merging utility.
 * Why: Verify clsx + tailwind-merge integration works correctly before all components use it.
 */

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn()', () => {
  it('merges class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes via object syntax', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })

  it('resolves Tailwind conflicts — later class wins', () => {
    // tailwind-merge ensures p-2 beats p-4 when p-2 comes later
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles undefined/null values gracefully', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})
