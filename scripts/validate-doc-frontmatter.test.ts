/*
 * Where: scripts/validate-doc-frontmatter.test.ts
 * What: Unit tests for the PR-CI doc frontmatter validator.
 * Why: Keep the schema and lifecycle checks stable as the doc policy evolves.
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
    const parsed = parseFrontmatter(`---\ntype: research\nstatus: active\ncreated: 2026-03-13\nquestion: \"What is the policy?\"\nlinks:\n  issue: 500\ntags:\n  - docs\n  - policy\nreview_by: 2026-03-20\ndisposition: archive\n---\n`)

    expect(parsed).toEqual({
      type: 'research',
      status: 'active',
      created: '2026-03-13',
      question: 'What is the policy?',
      links: { issue: '500' },
      tags: ['docs', 'policy'],
      review_by: '2026-03-20',
      disposition: 'archive'
    })
  })
})

describe('validateDocContent', () => {
  it('accepts a valid decision doc', () => {
    const errors = validateDocContent(
      'docs/decision/13032026-doc-lifecycle-policy.md',
      `---\ntype: decision\nstatus: accepted\ncreated: 2026-03-13\nlinks:\n  issue: 500\ntags:\n  - docs\n---\n\n# Decision\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects missing disposition on plan docs', () => {
    const errors = validateDocContent(
      'docs/plans/issue-500-plan.md',
      `---\ntype: plan\nstatus: active\ncreated: 2026-03-13\nreview_by: 2026-03-20\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Missing required field 'disposition'.")
  })

  it('rejects null and empty placeholder values', () => {
    const errors = validateDocContent(
      'docs/research/issue-500-research.md',
      `---\ntype: research\nstatus: active\ncreated: 2026-03-13\nquestion: null\nreview_by: 2026-03-20\ndisposition: delete\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'question' must not be empty or null.")
  })

  it('enforces active/archive status rules when subpaths are used', () => {
    const errors = validateDocContent(
      'docs/research/archive/issue-500-research.md',
      `---\ntype: research\nstatus: active\ncreated: 2026-03-13\nquestion: \"What changed?\"\nreview_by: 2026-03-20\ndisposition: archive\n---\n\n# Research\n`
    )

    expect(errors).toContain("Research docs under '/archive/' must use status 'concluded' or 'abandoned'.")
  })

  it('rejects impossible calendar dates', () => {
    const errors = validateDocContent(
      'docs/plans/issue-500-plan.md',
      `---\ntype: plan\nstatus: active\ncreated: 2026-02-30\nreview_by: 2026-03-20\ndisposition: delete\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Field 'created' must be a real calendar date.")
  })
})

describe('collectControlledDocPaths', () => {
  it('filters explicit markdown args to controlled docs only', () => {
    expect(
      collectControlledDocPaths({
        argv: ['docs/research/file.md', 'readme.md', 'docs/plans/plan.md'],
        env: {}
      })
    ).toEqual(['docs/research/file.md', 'docs/plans/plan.md'])
  })

  it('can validate a real temp file path passed explicitly', () => {
    const root = makeTempDir()
    const path = join(root, 'docs', 'research', 'sample.md')
    const repoRelative = relative(root, path).replace(/\\/g, '/')
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })

    writeFileSync(
      path,
      `---\ntype: research\nstatus: active\ncreated: 2026-03-13\nquestion: \"Why?\"\nreview_by: 2026-03-20\ndisposition: delete\n---\n\n# Research\n`,
      { encoding: 'utf8' }
    )

    expect(validateDocContent(repoRelative, readFileSync(path, 'utf8'))).toEqual([])
  })
})
