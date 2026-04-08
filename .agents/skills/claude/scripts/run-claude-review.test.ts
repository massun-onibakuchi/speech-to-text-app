/*
 * Where: .agents/skills/claude/scripts/run-claude-review.test.ts
 * What: Tests the Claude review wrapper argument parsing and failure
 *       normalization rules.
 * Why: Keep the wrapper contract stable so callers get portable timeout,
 *      auth, usage-limit, and resume behavior.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('node:crypto', () => ({
  randomUUID: () => '00000000-0000-4000-8000-000000000000'
}))

const modulePath = './run-claude-review.mjs'

const {
  buildClaudeCommand,
  classifyClaudeFailure,
  parseArgs
} = await import(modulePath)

describe('parseArgs', () => {
  it('requires exactly one review mode', () => {
    expect(() => parseArgs(['--cwd', '/tmp'])).toThrow('Expected exactly one')
    expect(() =>
      parseArgs([
        '--cwd',
        '/tmp',
        '--prompt-text',
        'review this',
        '--resume-last'
      ])
    ).toThrow('Expected exactly one')
  })

  it('accepts a fresh prompt file invocation', () => {
    expect(
      parseArgs([
        '--cwd',
        '/tmp/worktree',
        '--prompt-file',
        '/tmp/review.txt',
        '--deadline-seconds',
        '600'
      ])
    ).toEqual({
      cwd: '/tmp/worktree',
      deadlineSeconds: 600,
      model: '',
      outputFile: '',
      promptFile: '/tmp/review.txt',
      promptText: '',
      resumeLast: false,
      resumeSessionId: '',
      sessionFile: ''
    })
  })

  it('rejects a non-UUID resume session id', () => {
    expect(() =>
      parseArgs(['--cwd', '/tmp/worktree', '--resume-session-id', '1234'])
    ).toThrow('Expected --resume-session-id to be a valid UUID')
  })
})

describe('buildClaudeCommand', () => {
  it('creates a fresh print command with a generated session id', () => {
    expect(
      buildClaudeCommand({
        cwd: '/tmp/worktree',
        deadlineSeconds: 900,
        model: 'sonnet',
        outputFile: '',
        promptFile: '',
        promptText: 'Review this diff.',
        resumeLast: false,
        resumeSessionId: '',
        sessionFile: ''
      })
    ).toEqual({
      command: 'claude',
      args: [
        '--print',
        '--model',
        'sonnet',
        '--session-id',
        '00000000-0000-4000-8000-000000000000',
        'Review this diff.'
      ],
      prompt: 'Review this diff.',
      sessionId: '00000000-0000-4000-8000-000000000000'
    })
  })

  it('uses resume mode with the default continuation prompt', () => {
    expect(
      buildClaudeCommand({
        cwd: '/tmp/worktree',
        deadlineSeconds: 900,
        model: '',
        outputFile: '',
        promptFile: '',
        promptText: '',
        resumeLast: false,
        resumeSessionId: '550e8400-e29b-41d4-a716-446655440000',
        sessionFile: ''
      })
    ).toEqual({
      command: 'claude',
      args: [
        '--print',
        '--resume',
        '550e8400-e29b-41d4-a716-446655440000',
        'Continue from the most recent unfinished task and provide the final response.'
      ],
      prompt: 'Continue from the most recent unfinished task and provide the final response.',
      sessionId: '550e8400-e29b-41d4-a716-446655440000'
    })
  })
})

describe('classifyClaudeFailure', () => {
  it('normalizes auth failures', () => {
    expect(
      classifyClaudeFailure({
        exitCode: 1,
        stderr: 'Not logged in · Please run /login',
        stdout: '',
        timedOut: false,
        spawnError: null
      })
    ).toEqual({
      status: 'auth_error',
      exitCode: 20,
      resumable: false
    })
  })

  it('normalizes usage-limit failures', () => {
    expect(
      classifyClaudeFailure({
        exitCode: 1,
        stderr: 'Usage limit reached. Try again later.',
        stdout: '',
        timedOut: false,
        spawnError: null
      })
    ).toEqual({
      status: 'usage_limit',
      exitCode: 21,
      resumable: true
    })
  })

  it('treats timeouts as resumable', () => {
    expect(
      classifyClaudeFailure({
        exitCode: 1,
        stderr: '',
        stdout: '',
        timedOut: true,
        spawnError: null
      })
    ).toEqual({
      status: 'timeout',
      exitCode: 124,
      resumable: true
    })
  })
})
