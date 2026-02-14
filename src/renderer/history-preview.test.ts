import { describe, expect, it } from 'vitest'
import { toHistoryPreview } from './history-preview'

describe('toHistoryPreview', () => {
  it('returns placeholder for null/empty values', () => {
    expect(toHistoryPreview(null)).toBe('(none)')
    expect(toHistoryPreview('')).toBe('(none)')
    expect(toHistoryPreview('   \n\t   ')).toBe('(none)')
  })

  it('collapses whitespace for readable single-line previews', () => {
    const value = 'hello   world\nfrom\tpreview'
    expect(toHistoryPreview(value)).toBe('hello world from preview')
  })

  it('truncates long content with ellipsis', () => {
    const long = 'x'.repeat(200)
    const preview = toHistoryPreview(long, 50)
    expect(preview).toHaveLength(53)
    expect(preview.endsWith('...')).toBe(true)
  })
})
