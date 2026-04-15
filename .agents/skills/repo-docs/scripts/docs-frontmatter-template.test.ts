/*
 * Where: .agents/skills/repo-docs/scripts/docs-frontmatter-template.test.ts
 * What: Regression test that keeps the bundled docs-validation CI template portable.
 * Why: Prevent the repo-docs skill template from depending on repo-local trigger paths
 *      while still enforcing the expected validation commands and workflow shape.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const TEMPLATE_PATH = join(
  process.cwd(),
  '.agents/skills/repo-docs/templates/docs-frontmatter-pr.yml'
)

describe('docs-frontmatter CI template', () => {
  it('uses portable trigger paths from the skill bundle instead of repo-local script paths', () => {
    const template = readFileSync(TEMPLATE_PATH, 'utf8')

    expect(template).toContain("      - 'docs/**'")
    expect(template).toContain("      - '.agents/skills/repo-docs/**'")
    expect(template).toContain("      - 'package.json'")
    expect(template).toContain("      - '.github/workflows/docs-frontmatter-pr.yml'")
    expect(template).not.toContain("      - 'scripts/list-doc-frontmatters.mjs'")
    expect(template).not.toContain("      - 'scripts/validate-doc-frontmatter.mjs'")
    expect(template).not.toContain("      - '.github/workflows/docs-audit.yml'")
  })

  it('still runs the expected docs validation commands', () => {
    const template = readFileSync(TEMPLATE_PATH, 'utf8')

    expect(template).toContain('run: pnpm run docs:validate:test')
    expect(template).toContain('run: pnpm run docs:validate --changed-only')
  })
})
