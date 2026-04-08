/*
 * Where: scripts/agent-instructions.test.ts
 * What: Guards the Claude skill policy for tracked runtime invocation.
 * Why: Keep the local skill aligned with the wrapper-only repo workflow and
 *      prevent regressions back to bare Claude CLI guidance.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = join(import.meta.dirname, '..')
const CLAUDE_SKILL_PATH = join(REPO_ROOT, '.agents/skills/claude/SKILL.md')
const CLAUDE_SKILL_CONTENT = readFileSync(CLAUDE_SKILL_PATH, 'utf8')

describe('Claude skill repo policy', () => {
  it('requires the tracked wrapper and does not advertise direct claude commands', () => {
    expect(CLAUDE_SKILL_CONTENT).toContain('do not invoke `claude`, `claude -p`, or similar')
    expect(CLAUDE_SKILL_CONTENT).toContain(
      'bash .agents/skills/claude/scripts/run-claude-runtime.sh ...'
    )
    expect(CLAUDE_SKILL_CONTENT).toContain(
      'Use the wrapper instead of direct `claude` shell invocations when operating in this repo.'
    )
    expect(CLAUDE_SKILL_CONTENT).not.toContain('| Interactive session          | `claude`')
    expect(CLAUDE_SKILL_CONTENT).not.toContain('| Bare headless Claude         | `claude -p "Your prompt"`')
    expect(CLAUDE_SKILL_CONTENT).not.toContain('| Help                         | `claude --help`')
  })
})
