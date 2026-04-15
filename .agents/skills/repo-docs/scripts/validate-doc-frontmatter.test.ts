/*
 * Where: .agents/skills/repo-docs/scripts/validate-doc-frontmatter.test.ts
 * What: Unit tests for the repo-docs skill frontmatter validator.
 * Why: Keep the portable skill behavior stable after moving validation logic out of the
 *      repo-root scripts directory.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  collectAllControlledDocPaths,
  collectChangedControlledDocPaths,
  collectControlledDocPaths,
  collectDuplicateControlledDocNumberErrors,
  parseFrontmatter,
  run,
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
    const parsed = parseFrontmatter(`---\nstatus: archived\nlinks:\n  issue: 500\ntags:\n  - docs\n  - policy\nreview_by: 2026-03-03\n---\n`)

    expect(parsed).toEqual({
      status: 'archived',
      links: { issue: '500' },
      tags: ['docs', 'policy'],
      review_by: '2026-03-03'
    })
  })

  it('parses ADR-style dashed frontmatter keys', () => {
    const parsed = parseFrontmatter(`---\nstatus: accepted\ndecision-makers:\n  - Team\ninformed:\n  - Product\n---\n`)

    expect(parsed).toEqual({
      status: 'accepted',
      'decision-makers': ['Team'],
      informed: ['Product']
    })
  })
})

describe('validateDocContent', () => {
  it('accepts a valid decision doc', () => {
    const errors = validateDocContent(
      'docs/adr/0001-doc-lifecycle-policy.md',
      `---\ntitle: ADR Lifecycle Policy\ndescription: Keep ADR lifecycle metadata consistent for downstream tooling.\nstatus: accepted\ndate: 2026-03-14\n---\n\n# Decision\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects deprecated ADR list fields', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Vendor Choice\ndescription: Removed participant metadata should be rejected.\nstatus: accepted\ndate: 2026-03-13\ndecision-makers:\n  - Security\nconsulted:\n  - Engineering\ninformed:\n  - Product\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'decision-makers' is not allowed for decision docs.")
  })

  it('accepts optional tags on decision docs', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Vendor Choice\ndescription: Track optional tags for decision classification.\nstatus: accepted\ndate: 2026-03-13\ntags:\n  - architecture\n  - operations\n---\n\n# Decision\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects optional links on decision docs', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Vendor Choice\ndescription: Track related issue and PR references.\nstatus: accepted\ndate: 2026-03-13\nlinks:\n  issue: 500\n  pr: 503\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'links' is not allowed for decision docs.")
  })

  it('rejects unsupported decision review fields', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Vendor Review\ndescription: This must reject legacy review fields.\nstatus: accepted\nreview_by: 2026-09-30\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'review_by' is not allowed for decision docs.")
  })

  it('rejects missing decision status', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Missing Status\ndescription: Missing status should still be required.\ndate: 2026-03-13\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Missing required field 'status'.")
  })

  it('rejects invalid decision status values', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Invalid Status\ndescription: Unsupported ADR statuses should fail validation.\nstatus: active\ndate: 2026-03-13\n---\n\n# Decision\n`
    )

    expect(errors).toContain(
      "Field 'status' must be one of: proposed | accepted | rejected | deprecated | superseded."
    )
  })

  it('rejects missing decision title', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ndescription: Missing title should fail validation.\nstatus: accepted\ndate: 2026-03-13\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Missing required field 'title'.")
  })

  it('rejects missing decision description', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Missing Description\ndate: 2026-03-13\nstatus: accepted\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Missing required field 'description'.")
  })

  it('rejects descriptions longer than the documented limit', () => {
    const description = 'x'.repeat(513)
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Long Description\ndescription: "${description}"\ndate: 2026-03-13\nstatus: accepted\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'description' must be at most 512 characters.")
  })

  it('rejects invalid decision date formats', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Invalid Date\ndescription: Reject invalid calendar dates.\nstatus: accepted\ndate: 2026-02-31\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'date' must be a real calendar date.")
  })

  it('rejects invalid decision participant values', () => {
    const errors = validateDocContent(
      'docs/adr/0002-vendor-choice.md',
      `---\ntitle: Bad Participants\ndescription: Decision-makers must be list values.\nstatus: accepted\ndecision-makers: "Alice"\n---\n\n# Decision\n`
    )

    expect(errors).toContain("Field 'decision-makers' is not allowed for decision docs.")
  })

  it('accepts a valid plan doc with required title and description', () => {
    const errors = validateDocContent(
      'docs/plans/0001-issue-500-plan.md',
      `---\ntitle: Issue 500 rollout plan\ndescription: Coordinate the implementation steps for issue 500.\ndate: 2026-03-13\nstatus: active\nreview_by: 2026-03-20\n---\n\n# Plan\n`
    )

    expect(errors).toEqual([])
  })

  it('accepts a valid plan doc without review_by', () => {
    const errors = validateDocContent(
      'docs/plans/0001-issue-500-plan.md',
      `---\ntitle: Issue 500 rollout plan\ndescription: Coordinate the implementation steps for issue 500.\ndate: 2026-03-13\nstatus: active\n---\n\n# Plan\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects missing plan title and description', () => {
    const errors = validateDocContent(
      'docs/plans/0001-issue-500-plan.md',
      `---\ndate: 2026-03-13\nstatus: active\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Missing required field 'title'.")
    expect(errors).toContain("Missing required field 'description'.")
  })

  it('rejects missing plan date', () => {
    const errors = validateDocContent(
      'docs/plans/0001-issue-500-plan.md',
      `---\ntitle: Issue 500 rollout plan\ndescription: Coordinate the implementation steps for issue 500.\nstatus: active\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Missing required field 'date'.")
  })

  it('rejects disposition on plan docs as an unknown field', () => {
    const errors = validateDocContent(
      'docs/plans/0001-issue-500-plan.md',
      `---\ntitle: Issue 500 rollout plan\ndescription: Coordinate the implementation steps for issue 500.\ndate: 2026-03-13\nstatus: active\nreview_by: 2026-03-20\ndisposition: delete\n---\n\n# Plan\n`
    )

    expect(errors).toContain("Field 'disposition' is not allowed for plan docs.")
  })

  it('rejects invalid null placeholder values on optional date fields', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ntitle: Research title\ndescription: Research description.\ndate: 2026-03-13\nstatus: active\nreview_by: null\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'review_by' must use YYYY-MM-DD.")
  })

  it('accepts a valid research doc without review_by', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ntitle: Issue 500 research\ndescription: Investigate the open questions for issue 500.\ndate: 2026-03-13\nstatus: active\n---\n\n# Research\n`
    )

    expect(errors).toEqual([])
  })

  it('rejects question on research docs as an unknown field', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ntitle: Issue 500 research\ndescription: Investigate the open questions for issue 500.\ndate: 2026-03-13\nstatus: active\nquestion: What should we do?\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'question' is not allowed for research docs.")
  })

  it('rejects missing research title and description', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ndate: 2026-03-13\nstatus: active\n---\n\n# Research\n`
    )

    expect(errors).toContain("Missing required field 'title'.")
    expect(errors).toContain("Missing required field 'description'.")
  })

  it('rejects missing research date', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ntitle: Issue 500 research\ndescription: Investigate the open questions for issue 500.\nstatus: active\n---\n\n# Research\n`
    )

    expect(errors).toContain("Missing required field 'date'.")
  })

  it('rejects disposition on research docs as an unknown field', () => {
    const errors = validateDocContent(
      'docs/research/0001-issue-500-research.md',
      `---\ntitle: Issue 500 research\ndescription: Investigate the open questions for issue 500.\ndate: 2026-03-13\nstatus: active\nreview_by: 2026-03-20\ndisposition: archive\n---\n\n# Research\n`
    )

    expect(errors).toContain("Field 'disposition' is not allowed for research docs.")
  })

  it('rejects plan filenames that do not use the number-slug pattern', () => {
    const errors = validateDocContent(
      'docs/plans/2026-03-13-issue-500-plan.md',
      `---\ntitle: Issue 500 rollout plan\ndescription: Coordinate the implementation steps for issue 500.\ndate: 2026-03-13\nstatus: active\n---\n\n# Plan\n`
    )

    expect(errors).toContain("plan filenames must use '<number>-<slug>.md'.")
  })

  it('rejects research filenames that do not use the number-slug pattern', () => {
    const errors = validateDocContent(
      'docs/research/2026-03-13-issue-500-research.md',
      `---\ntitle: Issue 500 research\ndescription: Investigate the open questions for issue 500.\ndate: 2026-03-13\nstatus: active\n---\n\n# Research\n`
    )

    expect(errors).toContain("research filenames must use '<number>-<slug>.md'.")
  })

  it('rejects ADR filenames that do not use the number-slug pattern', () => {
    const errors = validateDocContent(
      'docs/adr/slug-format.md',
      `---\ntitle: Legacy Naming\ndescription: Must use a date-prefixed filename.\nstatus: accepted\ndate: 2026-03-13\n---\n\n# Decision\n`
    )

    expect(errors).toContain("ADR filenames must use '<number>-<slug>.md'.")
  })
})

describe('collectDuplicateControlledDocNumberErrors', () => {
  it('rejects duplicate numbering within the same controlled doc type', () => {
    expect(
      Array.from(
        collectDuplicateControlledDocNumberErrors([
          'docs/adr/0006-first.md',
          'docs/adr/0006-second.md',
          'docs/plans/0006-allowed.md'
        ]).entries()
      )
    ).toEqual([
      [
        'docs/adr/0006-second.md',
        ["Duplicate decision doc number '0006' also used by docs/adr/0006-first.md."]
      ]
    ])
  })

  it('allows the same number across different controlled doc types', () => {
    expect(
      Array.from(
        collectDuplicateControlledDocNumberErrors([
          'docs/adr/0006-decision.md',
          'docs/plans/0006-plan.md',
          'docs/research/0006-research.md'
        ]).entries()
      )
    ).toEqual([])
  })
})

describe('run', () => {
  it('fails when duplicate controlled-doc numbers exist in the same doc type', () => {
    const tempDir = makeTempDir()
    mkdirSync(join(tempDir, 'docs/adr'), { recursive: true })

    writeFileSync(
      join(tempDir, 'docs/adr/0001-first.md'),
      `---\ntitle: First ADR\ndescription: First duplicate number fixture.\ndate: 2026-04-10\nstatus: accepted\n---\n\n# Decision\n`
    )
    writeFileSync(
      join(tempDir, 'docs/adr/0001-second.md'),
      `---\ntitle: Second ADR\ndescription: Second duplicate number fixture.\ndate: 2026-04-10\nstatus: accepted\n---\n\n# Decision\n`
    )

    const originalCwd = process.cwd()
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    process.chdir(tempDir)
    expect(run({ argv: ['--all'], env: {} })).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith('[docs-frontmatter] invalid docs/adr/0001-second.md')
    expect(errorSpy).toHaveBeenCalledWith(
      "- Duplicate decision doc number '0001' also used by docs/adr/0001-first.md."
    )

    process.chdir(originalCwd)
    logSpy.mockRestore()
    errorSpy.mockRestore()
  })
})

describe('collectControlledDocPaths', () => {
  it('filters explicit markdown args to controlled docs only', () => {
    expect(
      collectControlledDocPaths({
        argv: ['docs/research/file.md', 'readme.md', 'docs/adr/choice.md', 'docs/plans/plan.md'],
        env: {}
      })
    ).toEqual(['docs/research/file.md', 'docs/adr/choice.md', 'docs/plans/plan.md'])
  })

  it('collects changed controlled docs from the branch diff', () => {
    const exec = vi.fn(() => 'docs/research/file.md\nreadme.md\ndocs/adr/choice.md\n')

    expect(collectChangedControlledDocPaths({ env: {}, exec })).toEqual([
      'docs/research/file.md',
      'docs/adr/choice.md'
    ])
  })

  it('collects all controlled docs under docs/', () => {
    const root = makeTempDir()
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
    mkdirSync(join(root, 'docs', 'nested'), { recursive: true })
    writeFileSync(join(root, 'docs', 'adr', '0001-decision.md'), '# Decision\n')
    writeFileSync(join(root, 'docs', 'nested', 'notes.md'), '# Notes\n')

    const paths = collectAllControlledDocPaths({ cwd: root })

    expect(paths).toEqual([
      'docs/adr/0001-decision.md'
    ])
    expect(paths).not.toContain('docs/nested/notes.md')
  })

  it('returns an empty list when docs/ is absent', () => {
    expect(collectAllControlledDocPaths({ cwd: makeTempDir() })).toEqual([])
  })

  it('defaults to validating the repo-wide controlled-doc set', () => {
    const root = makeTempDir()
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })
    writeFileSync(join(root, 'docs', 'adr', '0001-decision.md'), '# Decision\n')
    writeFileSync(join(root, 'docs', 'research', '0001-research.md'), '# Research\n')

    const exec = vi.fn(() => 'docs/research/0001-research.md\n')

    expect(collectControlledDocPaths({ argv: [], env: {}, cwd: root, exec })).toEqual([
      'docs/adr/0001-decision.md',
      'docs/research/0001-research.md'
    ])
    expect(exec).not.toHaveBeenCalled()
  })

  it('supports the legacy changed-only selection mode explicitly', () => {
    const exec = vi.fn(() => 'docs/research/0001-research.md\nreadme.md\n')

    expect(
      collectControlledDocPaths({ argv: ['--changed-only'], env: {}, cwd: makeTempDir(), exec })
    ).toEqual(['docs/research/0001-research.md'])
  })

  it('supports an explicit all-docs mode without consulting git diff', () => {
    const root = makeTempDir()
    mkdirSync(join(root, 'docs', 'adr'), { recursive: true })
    writeFileSync(join(root, 'docs', 'adr', '0001-decision.md'), '# Decision\n')

    const exec = vi.fn(() => 'docs/research/0001-research.md\n')

    expect(collectControlledDocPaths({ argv: ['--all'], env: {}, cwd: root, exec })).toEqual([
      'docs/adr/0001-decision.md'
    ])
    expect(exec).not.toHaveBeenCalled()
  })

  it('can validate a real temp file path passed explicitly', () => {
    const root = makeTempDir()
    const path = join(root, 'docs', 'research', '0001-sample.md')
    const repoRelative = relative(root, path).replace(/\\/g, '/')
    mkdirSync(join(root, 'docs', 'research'), { recursive: true })

    writeFileSync(
      path,
      `---\ntitle: Sample research\ndescription: Capture a temporary investigation.\ndate: 2026-03-13\nstatus: active\nreview_by: 2026-03-20\n---\n\n# Research\n`,
      { encoding: 'utf8' }
    )

    expect(validateDocContent(repoRelative, readFileSync(path, 'utf8'))).toEqual([])
  })
})
