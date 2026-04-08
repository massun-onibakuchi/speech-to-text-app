/*
 * Where: .agents/skills/claude/scripts/run-claude-review.test.ts
 * What: Verifies the tracked Claude review runtime can launch jobs, report
 *       explicit status, and return terminal results from durable state.
 * Why: The runtime contract should stay stable as later tickets migrate the
 *      Claude skill from foreground calls to explicit job control.
 */

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'
import { resolveRepoRuntimeDir } from './lib/review-job-state.mjs'

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const scriptPath = path.join(
  workspaceRoot,
  '.agents',
  'skills',
  'claude',
  'scripts',
  'run-claude-review.mjs'
)
const shellScriptPath = path.join(
  workspaceRoot,
  '.agents',
  'skills',
  'claude',
  'scripts',
  'run-claude-review.sh'
)

const tempDirs: string[] = []

const makeTempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const waitFor = async (
  predicate: () => boolean,
  { timeoutMs = 5000, intervalMs = 50 } = {}
) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for condition')
}

const createFakeClaudeBin = (scriptBody: string) => {
  const binDir = makeTempDir('claude-review-bin-')
  const claudePath = path.join(binDir, 'claude')
  writeFileSync(
    claudePath,
    `#!/usr/bin/env bash
set -euo pipefail
${scriptBody}
`,
    'utf8'
  )
  chmodSync(claudePath, 0o755)
  return binDir
}

const runReviewCli = (
  args: string[],
  {
    extraEnv,
    fakeBin,
    runtimeRoot
  }: {
    extraEnv?: Record<string, string>
    fakeBin?: string
    runtimeRoot: string
  }
) =>
  spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
      ...extraEnv,
      CLAUDE_REVIEW_RUNTIME_ROOT: runtimeRoot,
      PATH:
        fakeBin === undefined
          ? process.env.PATH
          : fakeBin
            ? `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`
            : ''
    },
    encoding: 'utf8'
  })

const runReviewShell = (
  args: string[],
  {
    extraEnv,
    fakeBin,
    runtimeRoot
  }: {
    extraEnv?: Record<string, string>
    fakeBin?: string
    runtimeRoot: string
  }
) =>
  spawnSync('bash', [shellScriptPath, ...args], {
    env: {
      ...process.env,
      ...extraEnv,
      CLAUDE_REVIEW_RUNTIME_ROOT: runtimeRoot,
      PATH:
        fakeBin === undefined
          ? process.env.PATH
          : fakeBin
            ? `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`
            : ''
    },
    encoding: 'utf8'
  })

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('tracked Claude review launcher', () => {
  it('creates a queued job and later writes a completed terminal state', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'review output\\n'
`)

    mkdirSync(reviewRoot, { recursive: true })

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(started.status).toBe(0)
    const payload = JSON.parse(started.stdout.trim())
    const jobFile = payload.jobFile as string
    const stdoutFile = payload.stdoutFile as string

    expect(['queued', 'running', 'completed']).toContain(
      JSON.parse(readFileSync(jobFile, 'utf8')).status
    )

    await waitFor(() => JSON.parse(readFileSync(jobFile, 'utf8')).status === 'completed')

    const record = JSON.parse(readFileSync(jobFile, 'utf8'))
    expect(record.sessionId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    )
    expect(record.exitCode).toBe(0)
    expect(record.resultCategory).toBe('success')
    expect(record.finishedAt).toBeTypeOf('string')
    expect(readFileSync(stdoutFile, 'utf8')).toContain('review output')

    const statusResult = runReviewCli(
      ['status', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(statusResult.status).toBe(0)
    expect(JSON.parse(statusResult.stdout.trim())).toMatchObject({
      jobId: payload.jobId,
      status: 'completed',
      resultCategory: 'success',
      exitCode: 0
    })

    const finalResult = runReviewCli(
      ['result', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(finalResult.status).toBe(0)
    expect(JSON.parse(finalResult.stdout.trim())).toMatchObject({
      jobId: payload.jobId,
      status: 'completed',
      resultCategory: 'success',
      exitCode: 0,
      stdout: 'review output\n',
      stderr: ''
    })
  })

  it('writes a missing_cli terminal state when claude is unavailable', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')

    mkdirSync(reviewRoot, { recursive: true })

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      { runtimeRoot, fakeBin: '' }
    )

    expect(started.status).toBe(0)
    const payload = JSON.parse(started.stdout.trim())
    const jobFile = payload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(jobFile, 'utf8')).status === 'failed')

    const record = JSON.parse(readFileSync(jobFile, 'utf8'))
    expect(record.exitCode).toBe(1)
    expect(record.resultCategory).toBe('missing_cli')
    expect(record.finishedAt).toBeTypeOf('string')

    const finalResult = runReviewCli(
      ['result', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { runtimeRoot, fakeBin: '' }
    )

    expect(finalResult.status).toBe(0)
    expect(JSON.parse(finalResult.stdout.trim())).toMatchObject({
      jobId: payload.jobId,
      status: 'failed',
      resultCategory: 'missing_cli',
      exitCode: 1
    })
  })

  it('reports a queued job via status and rejects result until the job is terminal', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
sleep 1
printf 'late output\\n'
`)

    mkdirSync(reviewRoot, { recursive: true })

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(started.status).toBe(0)
    const payload = JSON.parse(started.stdout.trim())

    const statusResult = runReviewCli(
      ['status', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(statusResult.status).toBe(0)
    expect(JSON.parse(statusResult.stdout.trim())).toMatchObject({
      jobId: payload.jobId
    })

    const resultAttempt = runReviewCli(
      ['result', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(resultAttempt.status).toBe(1)
    expect(resultAttempt.stderr).toContain('Result is not ready')
  })

  it('resumes a stored job id by reusing the persisted prompt and session id', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const argsFile = path.join(makeTempDir('claude-review-args-'), 'args.log')
    const fakeBin = createFakeClaudeBin(`
printf '%s\\n' \"$*\" >> \"$FAKE_CLAUDE_ARGS_FILE\"
if [[ \"$*\" == *\"--resume\"* ]]; then
  printf 'resumed output\\n'
else
  printf 'fresh output\\n'
fi
`)

    mkdirSync(reviewRoot, { recursive: true })

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      {
        extraEnv: { FAKE_CLAUDE_ARGS_FILE: argsFile },
        fakeBin,
        runtimeRoot
      }
    )

    expect(started.status).toBe(0)
    const startPayload = JSON.parse(started.stdout.trim())
    const startJobFile = startPayload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(startJobFile, 'utf8')).status === 'completed')

    const resumed = runReviewCli(
      ['resume', '--cwd', reviewRoot, '--job-id', startPayload.jobId, '--json'],
      {
        extraEnv: { FAKE_CLAUDE_ARGS_FILE: argsFile },
        fakeBin,
        runtimeRoot
      }
    )

    expect(resumed.status).toBe(0)
    const resumedPayload = JSON.parse(resumed.stdout.trim())
    const resumedJobFile = resumedPayload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(resumedJobFile, 'utf8')).status === 'completed')

    const resumedRecord = JSON.parse(readFileSync(resumedJobFile, 'utf8'))
    expect(resumedRecord.launchMode).toBe('resume')
    expect(resumedRecord.resumedFromJobId).toBe(startPayload.jobId)
    expect(resumedRecord.sessionId).toBe(startPayload.sessionId)

    const argsLog = readFileSync(argsFile, 'utf8')
    expect(argsLog).toContain(`--session-id ${startPayload.sessionId} Review this.`)
    expect(argsLog).toContain(`--resume ${startPayload.sessionId} Review this.`)
  })

  it('resumes an explicit session id only when a fresh prompt is supplied', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const argsFile = path.join(makeTempDir('claude-review-args-'), 'args.log')
    const fakeBin = createFakeClaudeBin(`
printf '%s\\n' \"$*\" >> \"$FAKE_CLAUDE_ARGS_FILE\"
printf 'resumed output\\n'
`)
    const sessionId = '550e8400-e29b-41d4-a716-446655440000'

    mkdirSync(reviewRoot, { recursive: true })

    const invalidResume = runReviewCli(
      ['resume', '--cwd', reviewRoot, '--session-id', sessionId, '--json'],
      {
        extraEnv: { FAKE_CLAUDE_ARGS_FILE: argsFile },
        fakeBin,
        runtimeRoot
      }
    )

    expect(invalidResume.status).toBe(1)
    expect(invalidResume.stderr).toContain('requires exactly one of --prompt-file or --prompt-text')

    const resumed = runReviewCli(
      [
        'resume',
        '--cwd',
        reviewRoot,
        '--session-id',
        sessionId,
        '--prompt-text',
        'Continue the review.',
        '--json'
      ],
      {
        extraEnv: { FAKE_CLAUDE_ARGS_FILE: argsFile },
        fakeBin,
        runtimeRoot
      }
    )

    expect(resumed.status).toBe(0)
    const resumedPayload = JSON.parse(resumed.stdout.trim())
    const resumedJobFile = resumedPayload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(resumedJobFile, 'utf8')).status === 'completed')

    const resumedRecord = JSON.parse(readFileSync(resumedJobFile, 'utf8'))
    expect(resumedRecord.launchMode).toBe('resume')
    expect(resumedRecord.resumedFromJobId).toBeNull()
    expect(resumedRecord.sessionId).toBe(sessionId)

    const argsLog = readFileSync(argsFile, 'utf8')
    expect(argsLog).toContain(`--resume ${sessionId} Continue the review.`)
  })

  it('waits on tracked state and returns the final Claude output in compatibility mode', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'waited output\\n'
`)

    mkdirSync(reviewRoot, { recursive: true })

    const waited = runReviewCli(
      [
        'start',
        '--cwd',
        reviewRoot,
        '--prompt-text',
        'Review this.',
        '--wait',
        '--json'
      ],
      { fakeBin, runtimeRoot }
    )

    expect(waited.status).toBe(0)
    expect(JSON.parse(waited.stdout.trim())).toMatchObject({
      status: 'completed',
      resultCategory: 'success',
      exitCode: 0,
      stdout: 'waited output\n',
      stderr: ''
    })
  })

  it('supports the shell compatibility path where flag-only calls map to start --wait', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'shell waited output\\n'
`)

    mkdirSync(reviewRoot, { recursive: true })

    const waited = runReviewShell(
      ['--cwd', reviewRoot, '--prompt-text', 'Review this.', '--wait'],
      { fakeBin, runtimeRoot }
    )

    expect(waited.status).toBe(0)
    expect(waited.stdout).toBe('shell waited output\n')
  })

  it('returns a bounded compatibility timeout instead of calling the run hung', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
sleep 2
printf 'slow output\\n'
`)

    mkdirSync(reviewRoot, { recursive: true })

    const waited = runReviewCli(
      [
        'start',
        '--cwd',
        reviewRoot,
        '--prompt-text',
        'Review this.',
        '--wait',
        '--wait-seconds',
        '0.1',
        '--json'
      ],
      { fakeBin, runtimeRoot }
    )

    expect(waited.status).toBe(124)
    expect(JSON.parse(waited.stdout.trim())).toMatchObject({
      status: 'timed_out_waiting',
      waitSeconds: 0.1
    })
    expect(waited.stderr).toBe('')
  })

  it('returns failed wait-mode results with the tracked exit code', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'login required\\n' >&2
exit 7
`)

    mkdirSync(reviewRoot, { recursive: true })

    const waited = runReviewCli(
      [
        'start',
        '--cwd',
        reviewRoot,
        '--prompt-text',
        'Review this.',
        '--wait',
        '--json'
      ],
      { fakeBin, runtimeRoot }
    )

    expect(waited.status).toBe(7)
    const waitPayload = JSON.parse(waited.stdout.trim())
    expect(waitPayload).toMatchObject({
      status: 'failed',
      resultCategory: 'auth_error',
      exitCode: 7,
      stderr: 'login required\n'
    })
    expect(waitPayload.nextStep).toContain('Next step: run claude auth login or claude setup-token')
    expect(waitPayload.nextStep).toContain('resume --cwd <repo> --job-id')
  })

  it('includes an actionable next step for failed result retrieval', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'quota exceeded\\n' >&2
exit 9
`)

    mkdirSync(reviewRoot, { recursive: true })

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(started.status).toBe(0)
    const payload = JSON.parse(started.stdout.trim())
    const jobFile = payload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(jobFile, 'utf8')).status === 'failed')

    const finalResult = runReviewCli(
      ['result', '--cwd', reviewRoot, '--job-id', payload.jobId, '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(finalResult.status).toBe(0)
    expect(JSON.parse(finalResult.stdout.trim())).toMatchObject({
      status: 'failed',
      resultCategory: 'usage_limit',
      exitCode: 9,
      nextStep: `Next step: check Claude usage limits or budget, then rerun resume --cwd <repo> --job-id ${payload.jobId}.`
    })
  })

  it('prunes old terminal jobs before launching a fresh tracked review', () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')
    const fakeBin = createFakeClaudeBin(`
printf 'fresh output\\n'
`)
    mkdirSync(reviewRoot, { recursive: true })
    const repoRuntimeDir = resolveRepoRuntimeDir(reviewRoot, {
      ...process.env,
      CLAUDE_REVIEW_RUNTIME_ROOT: runtimeRoot
    })
    const oldJobDir = path.join(repoRuntimeDir, 'jobs', 'review-old-terminal')
    const oldJobFile = path.join(oldJobDir, 'job.json')
    const oldTimestamp = '2026-03-01T00:00:00.000Z'

    mkdirSync(oldJobDir, { recursive: true })
    writeFileSync(
      oldJobFile,
      `${JSON.stringify(
        {
          id: 'review-old-terminal',
          status: 'completed',
          createdAt: oldTimestamp,
          updatedAt: oldTimestamp,
          finishedAt: oldTimestamp
        },
        null,
        2
      )}\n`,
      'utf8'
    )

    const started = runReviewCli(
      ['start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      { fakeBin, runtimeRoot }
    )

    expect(started.status).toBe(0)
    expect(() => readFileSync(oldJobFile, 'utf8')).toThrow()
  })
})
