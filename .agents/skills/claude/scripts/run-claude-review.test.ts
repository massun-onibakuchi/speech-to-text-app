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

const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..', '..')
const scriptPath = path.join(
  workspaceRoot,
  '.agents',
  'skills',
  'claude',
  'scripts',
  'run-claude-review.mjs'
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
    fakeBin,
    runtimeRoot
  }: {
    fakeBin?: string
    runtimeRoot: string
  }
) =>
  spawnSync(process.execPath, [scriptPath, ...args], {
    env: {
      ...process.env,
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
})
