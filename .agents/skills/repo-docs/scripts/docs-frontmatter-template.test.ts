/*
 * Where: .agents/skills/repo-docs/scripts/docs-frontmatter-template.test.ts
 * What: Regression test that keeps the bundled docs-validation CI template aligned
 *       with the repo's active workflow content.
 * Why: Prevent the repo-docs skill template from drifting away from the workflow
 *      it is meant to install when docs validation CI is missing.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_PATH = join(process.cwd(), '.github/workflows/docs-frontmatter-pr.yml')
const TEMPLATE_PATH = join(
  process.cwd(),
  '.agents/skills/repo-docs/templates/docs-frontmatter-pr.yml'
)

describe('docs-frontmatter CI template', () => {
  it('matches the live workflow after the comment header', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8').trim()
    const template = readFileSync(TEMPLATE_PATH, 'utf8')
      .split('\n')
      .filter((line) => !line.startsWith('# '))
      .join('\n')
      .trim()

    expect(template).toBe(workflow)
  })
})
