/*
 * Where: .agents/skills/repo-docs/scripts/docs-frontmatter-workflow.test.ts
 * What: Regression tests for the docs validation pull request workflow contract.
 * Why: Keep the repo-docs skill aligned with the requirement that docs validation
 *      CI runs on every pull request, even when the PR does not touch docs paths.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const WORKFLOW_PATH = join(process.cwd(), '.github/workflows/docs-frontmatter-pr.yml')

describe('docs-frontmatter-pr workflow', () => {
  it('runs on every pull request without path filters', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8')
    const pullRequestBlock = workflow.match(/on:\n([\s\S]*?)\njobs:/)?.[1]

    expect(pullRequestBlock).toBeDefined()
    expect(pullRequestBlock).toContain('  pull_request:')
    expect(pullRequestBlock).not.toContain('    paths:')
  })

  it('still runs the docs validation test suite and changed-doc validation steps', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8')

    expect(workflow).toContain('run: pnpm run docs:validate:test')
    expect(workflow).toContain('run: pnpm run docs:validate --changed-only')
  })
})
