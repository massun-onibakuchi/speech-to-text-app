/*
 * Where: scripts/validate-doc-frontmatter.test.ts
 * What: Unit tests for the PR-CI doc frontmatter validator.
 * Why: Keep the schema and field-level lifecycle checks stable as the doc policy evolves.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectControlledDocPaths,
  parseFrontmatter,
  validateDocContent
} from './validate-doc-frontmatter.mjs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dicta-doc-frontmatter-'))
  tempDirs.push(tempDir)
  return tempDir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

describe('parseFrontmatter', () => {
  it('parses nested links and tags arrays', () => {
    const parsed = parseFrontmatter(`---\ntype: research\nstatus: archived\nquestion: \"What is the policy?\"\nlinks:\n  issue: 500\ntags:\n  - docs\n  - policy\nreview_by: 2026-03-20\n---\n`)

    expect(parsed).toEqual({
      type: 'research',
      status: 'archived',
      question: 'What is the policy?',
      links: { issue: '500' },
      tags: ['docs', 'policy'],
      review_by: '2026-03-20'
    })
  })
})

describe('validateDocContent', () => {
  it('accepts a valid decision doc', () => {
    const errors = validateDocContent(
      'docs/decisions/2026-03-13-doc-lifecycle-policy.md',
      `---\ntype: decision\nstatus: accepted\nlinks:\n  issue: 500\ntags:\n  - docs\n---\n\n# Decision\n`
    )

    expect(errors).toEqual([])
  })

  it('accepts an accepted decision doc with review metadata', () => {
    const errors = validateDocContent(
      'docs/decisions/2026-03-13-vendor-choice.md',
      `---\ntype: decision\nstatus: accepted\nreview_by: 2026-09-30\nreview_trigger: "Recheck if vendor pricing, retention policy, or quality/cost tradeoff changes materially."\n---\n\n# Decision\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects decision docs that set only one review field', () => {
    const errors = validateDocContent(
      'docs/decisions/2026-03-13-vendor-choice.md',
      `---\ntype: decision\nstatus: accepted\nreview_by: 2026-09-30\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Decision docs must set 'review_by' and 'review_trigger' together.")
  })

  it('rejects decision review metadata on non-accepted statuses', () => {
    const errors = validateDocContent(
      'docs/decisions/2026-03-13-vendor-choice.md',
      `---\ntype: decision\nstatus: proposed\nreview_by: 2026-09-30\nreview_trigger: "Recheck if vendor pricing changes materially."\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Decision docs may use 'review_by' only when status is 'accepted'.")
  })

  it('rejects review_trigger values longer than the documented limit', () => {
    const reviewTrigger = 'x'.repeat(513)
    const errors = validateDocContent(
      'docs/decisions/2026-03-13-vendor-choice.md',
      `---\ntype: decision\nstatus: accepted\nreview_by: 2026-09-30\nreview_trigger: "${reviewTrigger}"\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'review_trigger' must be at most 512 characters.")
  })

  it('accepts a valid plan doc without disposition', () => {
    const errors = validateDocContent(
      'docs/plans/2026-03-13-issue-500-plan.md',
      `---\ntype: plan\nstatus: active\nreview_by: 2026-03-20\n---\n\n# Plan\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects disposition on plan docs as an unknown field', () => {
    const errors = validateDocContent(
      'docs/plans/2026-03-13-issue-500-plan.md',
      `---\ntype: plan\nstatus: active\nreview_by: 2026-03-20\ndisposition: delete\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Field 'disposition' is not allowed for plan docs.")
  })

  it('rejects null and empty placeholder values', () => {
    const errors = validateDocContent(
      'docs/research/2026-03-13-issue-500-research.md',
      `---\ntype: research\nstatus: active\nquestion: null\nreview_by: 2026-03-20\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'question' must not be empty or null.")
  })

  it('rejects research questions longer than the documented limit', () => {
    const question = 'x'.repeat(1025)
    const errors = validateDocContent(
      'docs/research/2026-03-13-issue-500-research.md',
      `---\ntype: research\nstatus: active\nquestion: "${question}"\nreview_by: 2026-03-20\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'question' must be at most 1024 characters.")
  })

  it('rejects disposition on research docs as an unknown field', () => {
    const errors = validateDocContent(
      'docs/research/2026-03-13-issue-500-research.md',
      `---\ntype: research\nstatus: active\nquestion: "What now?"\nreview_by: 2026-03-20\ndisposition: archive\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'disposition' is not allowed for research docs.")
  })

  it('rejects filenames that do not use the date-slug pattern', () => {
    const errors = validateDocContent(
      'docs/decisions/13032026-bad-name.md',
      `---\ntype: decision\nstatus: accepted\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Controlled doc filenames must use 'YYYY-MM-DD-<slug>.md'.")
  })
})

describe('collectControlledDocPaths', () => {
  it('filters explicit markdown args to controlled docs only', () => {
    expect(
      collectControlledDocPaths({
        argv: ['docs/research/file.md', 'readme.md', 'docs/decisions/choice.md', 'docs/plans/plan.md'],
        env: {}
      })
    ).toEqual(['docs/research/file.md', 'docs/decisions/choice.md', 'docs/plans/plan.md'])
  })

  it('can validate a real temp file path passed explicitly', () => {
    const root = makeTempDir()
    const path = join(root, 'docs', 'research', '2026-03-13-sample.md')
    const repoRelative = relative(root, path).replace(/\\/g, '/')
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })

    writeFileSync(
      path,
      `---\ntype: research\nstatus: active\nquestion: \"Why?\"\nreview_by: 2026-03-20\n---\n\n# Research\n`,
      { encoding: 'utf8' }
    )

    expect(validateDocContent(repoRelative, readFileSync(path, 'utf8'))).toEqual([])
  })
})
