/*
 * Where: scripts/docs-reference-integrity.test.ts
 * What: Regression test for canonical controlled-doc path references in repo docs.
 * Why: Prevent stale `docs/decisions/` references from drifting back into docs and
 *      source comments after the repo standardized on `docs/decision/`.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(import.meta.dirname, '..')

const readRepoFile = (repoRelativePath: string) =>
  readFileSync(join(repoRoot, repoRelativePath), 'utf8')

describe('controlled doc path references', () => {
  it('uses the canonical docs/decision path in maintained docs and comments', () => {
    expect(readRepoFile('docs/ui-design-guidelines.md')).not.toContain('docs/decisions/')
    expect(readRepoFile('src/renderer/activity-feed-react.tsx')).not.toContain('docs/decisions/')
  })
})
