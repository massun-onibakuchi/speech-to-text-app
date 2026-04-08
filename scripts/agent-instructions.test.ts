/*
 * Where: scripts/agent-instructions.test.ts
 * What: Guards the root agent policy for Claude runtime invocation.
 * Why: Keep repo-level instructions aligned with the tracked Claude wrapper and
 *      prevent regressions back to bare Claude CLI guidance.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..')
const ROOT_AGENTS_PATH = join(REPO_ROOT, 'AGENTS.md')
const CLAUDE_SKILL_PATH = join(REPO_ROOT, '.agents/skills/claude/SKILL.md')
const ROOT_AGENTS_CONTENT = readFileSync(ROOT_AGENTS_PATH, 'utf8')
const CLAUDE_SKILL_CONTENT = readFileSync(CLAUDE_SKILL_PATH, 'utf8')

describe('root AGENTS Claude policy', () => {
  it('forbids direct Claude CLI invocation and points to the tracked wrapper', () => {
    expect(ROOT_AGENTS_CONTENT).toContain('do not call the Claude CLI directly')
    expect(ROOT_AGENTS_CONTENT).toContain('`claude`, `claude -p`, or similar')
    expect(ROOT_AGENTS_CONTENT).toContain('.agents/skills/claude/SKILL.md')
    expect(ROOT_AGENTS_CONTENT).toContain(
      'bash .agents/skills/claude/scripts/run-claude-runtime.sh ...'
    )
  })
})

describe('Claude skill repo policy', () => {
  it('matches the repo rule and does not advertise direct claude commands', () => {
    expect(CLAUDE_SKILL_CONTENT).toContain('do not invoke `claude`, `claude -p`, or similar')
    expect(CLAUDE_SKILL_CONTENT).toContain(
      'bash .agents/skills/claude/scripts/run-claude-runtime.sh ...'
    )
    expect(CLAUDE_SKILL_CONTENT).not.toContain('| Interactive session          | `claude`')
    expect(CLAUDE_SKILL_CONTENT).not.toContain('| Bare headless Claude         | `claude -p "Your prompt"`')
  })
})
