/*
 * Where: .agents/skills/repo-docs/scripts/list-doc-frontmatters.test.ts
 * What: Tests for the repo-docs skill frontmatter inventory script.
 * Why: Keep the skill's agent-facing report stable after moving it into the portable
 *      skill bundle.
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
      'docs/adr/0001-doc-frontmatter.md',
      `---\ntitle: Doc frontmatter ADR\ndescription: Keep ADR metadata stable for tooling.\ndate: 2026-03-14\nstatus: accepted\ntags:\n  - docs\n  - policy\n---\n\n# Decision\n`
    )
    writeDoc(
      repoRoot,
      'docs/plans/0001-plan.md',
      `---\ntitle: Frontmatter rollout plan\ndescription: Coordinate the validator and inventory updates.\ndate: 2026-03-14\nstatus: active\nreview_by: 2026-03-21\n---\n\n# Plan\n`
    )
    writeDoc(
      repoRoot,
      'docs/research/0001-research.md',
      `---\ntitle: Frontmatter research\ndescription: Capture what metadata should stay searchable.\ndate: 2026-03-14\nstatus: archived\nreview_by: 2026-03-21\n---\n\n# Research\n`
    )

    const report = formatControlledDocFrontmatters(collectControlledDocFrontmatters(repoRoot))

    expect(report).toContain('# Controlled Doc Frontmatters')
    expect(report).toContain('## ADR')
    expect(report).toContain('- path: docs/adr/0001-doc-frontmatter.md')
    expect(report).toContain('  - title: Doc frontmatter ADR')
    expect(report).toContain('  - description: Keep ADR metadata stable for tooling.')
    expect(report).toContain('  - date: 2026-03-14')
    expect(report).toContain('  - status: accepted')
    expect(report).toContain('  - tags: docs, policy')
    expect(report).not.toContain('- path: docs/adr/0001-doc-frontmatter.md\n  - title: Doc frontmatter ADR\n  - description: Keep ADR metadata stable for tooling.\n  - date: 2026-03-14\n  - status: accepted\n  - review_by:')
    expect(report).not.toContain('  - review_trigger:')
    expect(report).toContain('## Plan')
    expect(report).toContain('  - title: Frontmatter rollout plan')
    expect(report).toContain('  - description: Coordinate the validator and inventory updates.')
    expect(report).toContain('  - date: 2026-03-14')
    expect(report).toContain('  - review_by: 2026-03-21')
    expect(report).toContain('## Research')
    expect(report).toContain('  - title: Frontmatter research')
    expect(report).toContain('  - description: Capture what metadata should stay searchable.')
    expect(report).toContain('  - date: 2026-03-14')
    expect(report).toContain('  - review_by: 2026-03-21')
    expect(report).not.toContain('  - question:')
  })

  it('continues after malformed frontmatter and reports the parse error under the path', () => {
    const repoRoot = makeTempRepo()

    writeDoc(
      repoRoot,
      'docs/adr/0001-valid.md',
      `---\ntitle: Valid ADR\ndescription: Confirm the inventory includes ADR metadata.\ndate: 2026-03-14\nstatus: accepted\n---\n\n# Decision\n`
    )
    writeDoc(
      repoRoot,
      'docs/plans/0001-invalid.md',
      `status: active\ndate: 2026-03-14\nreview_by: 2026-03-21\n`
    )

    const report = formatControlledDocFrontmatters(collectControlledDocFrontmatters(repoRoot))

    expect(report).toContain('- path: docs/adr/0001-valid.md')
    expect(report).toContain('- path: docs/plans/0001-invalid.md')
    expect(report).toContain('  - error: Missing YAML frontmatter block.')
  })
})
