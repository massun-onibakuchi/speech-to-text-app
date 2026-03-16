/*
 * Where: scripts/list-doc-frontmatters.test.ts
 * What: Tests for the controlled-doc frontmatter inventory script.
 * Why: Keep the agent-facing report stable, compact, and resilient to malformed
 *      files without introducing lifecycle judgment into the script.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectControlledDocFrontmatters,
  formatControlledDocFrontmatters
} from './list-doc-frontmatters.mjs'

const tempDirs: string[] = []

const makeTempRepo = () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'dicta-doc-frontmatters-'))
  tempDirs.push(tempDir)
  return tempDir
}

const writeDoc = (repoRoot: string, repoRelativePath: string, content: string) => {
  const absolutePath = join(repoRoot, repoRelativePath)
  mkdirSync(dirname(absolutePath), { recursive: true })
  writeFileSync(absolutePath, content, 'utf8')
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const tempDir = tempDirs.pop()
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }
})

describe('collectControlledDocFrontmatters', () => {
  it('collects facts-only frontmatter fields and omits missing optional values', () => {
    const repoRoot = makeTempRepo()

    writeDoc(
      repoRoot,
      'docs/adr/2026-03-14-doc-frontmatter.md',
      `---\ntype: decision\nstatus: accepted\ncreated: 2026-03-14\nlinks:\n  issue: 500\n  pr: 503\ntags:\n  - docs\n  - policy\n---\n\n# Decision\n`
    )
    writeDoc(
      repoRoot,
      'docs/plans/2026-03-14-plan.md',
      `---\ntype: plan\nstatus: active\ncreated: 2026-03-14\nreview_by: 2026-03-21\n---\n\n# Plan\n`
    )
    writeDoc(
      repoRoot,
      'docs/research/2026-03-14-research.md',
      `---\ntype: research\nstatus: archived\ncreated: 2026-03-14\nquestion: "What should we keep?"\nreview_by: 2026-03-21\n---\n\n# Research\n`
    )

    const report = formatControlledDocFrontmatters(collectControlledDocFrontmatters(repoRoot))

    expect(report).toContain('# Controlled Doc Frontmatters')
    expect(report).toContain('## Decision')
    expect(report).toContain('- path: docs/adr/2026-03-14-doc-frontmatter.md')
    expect(report).toContain('  - status: accepted')
    expect(report).toContain('  - created: 2026-03-14')
    expect(report).toContain('  - links.issue: 500')
    expect(report).toContain('  - links.pr: 503')
    expect(report).toContain('  - tags: docs, policy')
    expect(report).not.toContain('- path: docs/adr/2026-03-14-doc-frontmatter.md\n  - status: accepted\n  - created: 2026-03-14\n  - review_by:')
    expect(report).not.toContain('  - review_trigger:')
    expect(report).toContain('## Plan')
    expect(report).toContain('  - review_by: 2026-03-21')
    expect(report).toContain('## Research')
    expect(report).toContain('  - question: What should we keep?')
  })

  it('continues after malformed frontmatter and reports the parse error under the path', () => {
    const repoRoot = makeTempRepo()

    writeDoc(
      repoRoot,
      'docs/adr/2026-03-14-valid.md',
      `---\ntype: decision\nstatus: accepted\ncreated: 2026-03-14\n---\n\n# Decision\n`
    )
    writeDoc(
      repoRoot,
      'docs/plans/2026-03-14-invalid.md',
      `type: plan\nstatus: active\ncreated: 2026-03-14\nreview_by: 2026-03-21\n`
    )

    const report = formatControlledDocFrontmatters(collectControlledDocFrontmatters(repoRoot))

    expect(report).toContain('- path: docs/adr/2026-03-14-valid.md')
    expect(report).toContain('- path: docs/plans/2026-03-14-invalid.md')
    expect(report).toContain('  - error: Missing YAML frontmatter block.')
  })
})
