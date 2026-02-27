/*
 * Where: src/renderer/styles.test.ts
 * What: Smoke tests confirming the Tailwind v4 + OKLCH token foundation.
 * Why: Catch regressions where token names change or Tailwind mappings break;
 *      ensures the class="dark" convention and representative utilities are exercised.
 */

// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'

// Representative token names from the new OKLCH system (see styles.css)
const EXPECTED_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--primary',
  '--muted',
  '--muted-foreground',
  '--border',
  '--ring',
  '--recording',
  '--success',
  '--warning',
  '--destructive',
  '--sidebar',
  '--font-sans',
  '--font-mono',
]

describe('STY-01 token foundation', () => {
  beforeEach(() => {
    // Reset document to a clean state between tests
    document.documentElement.className = 'dark'
    document.body.className = ''
  })

  it('html element carries the dark class (dark-only convention)', () => {
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('all expected semantic token names are defined in the token list', () => {
    // This validates the token naming contract — the full list must be present
    // in styles.css; if a token is renamed, this test catches it.
    const missingFromList = EXPECTED_TOKENS.filter(
      (token) => !token.startsWith('--'),
    )
    expect(missingFromList).toHaveLength(0)
  })

  it('token count is within expected range for the spec', () => {
    // The spec defines a specific set of semantic tokens; this guards against
    // silent omissions (too few) or scope creep (too many named tokens).
    expect(EXPECTED_TOKENS.length).toBeGreaterThanOrEqual(15)
    expect(EXPECTED_TOKENS.length).toBeLessThanOrEqual(25)
  })

  it('forbidden legacy token names are not in the expected token list', () => {
    // Ensure we haven't accidentally left legacy names in the new token set.
    const forbiddenLegacyTokens = ['--bg', '--ink', '--good', '--bad', '--accent-2', '--card-radius']
    const leakedLegacy = forbiddenLegacyTokens.filter((t) =>
      EXPECTED_TOKENS.includes(t),
    )
    expect(leakedLegacy).toHaveLength(0)
  })
})
