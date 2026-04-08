/*
 * Where: scripts/codex-rules.test.ts
 * What: Verifies the repo-local Codex rules file contains the Claude deny rule.
 * Why: Keep the local CLI guard explicit and prevent regressions in the tracked
 *      default rules configuration.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..')
const DEFAULT_RULES_PATH = join(REPO_ROOT, '.codex/rules/default.rules')
const DEFAULT_RULES_CONTENT = readFileSync(DEFAULT_RULES_PATH, 'utf8')

describe('default Codex rules', () => {
  it('denies direct claude CLI calls', () => {
    expect(DEFAULT_RULES_CONTENT.trim()).toContain(
      'prefix_rule(pattern=["claude"], decision="deny")'
    )
  })
})
