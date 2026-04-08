/*
 * Where: .agents/skills/claude/scripts/run-claude-review.test.ts
 * What: Verifies the tracked Claude review launcher creates durable job state
 *       and writes terminal metadata after the detached worker finishes.
 * Why: CR-002 needs regression coverage for the new launcher and state store
 *      before status/result commands are added in later tickets.
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

    const started = spawnSync(
      process.execPath,
      [scriptPath, 'start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      {
        env: {
          ...process.env,
          CLAUDE_REVIEW_RUNTIME_ROOT: runtimeRoot,
          PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`
        },
        encoding: 'utf8'
      }
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
  })

  it('writes a missing_cli terminal state when claude is unavailable', async () => {
    const reviewRoot = makeTempDir('claude-review-root-')
    const runtimeRoot = makeTempDir('claude-review-runtime-')

    mkdirSync(reviewRoot, { recursive: true })

    const started = spawnSync(
      process.execPath,
      [scriptPath, 'start', '--cwd', reviewRoot, '--prompt-text', 'Review this.', '--json'],
      {
        env: {
          ...process.env,
          CLAUDE_REVIEW_RUNTIME_ROOT: runtimeRoot,
          PATH: ''
        },
        encoding: 'utf8'
      }
    )

    expect(started.status).toBe(0)
    const payload = JSON.parse(started.stdout.trim())
    const jobFile = payload.jobFile as string

    await waitFor(() => JSON.parse(readFileSync(jobFile, 'utf8')).status === 'failed')

    const record = JSON.parse(readFileSync(jobFile, 'utf8'))
    expect(record.exitCode).toBe(1)
    expect(record.resultCategory).toBe('missing_cli')
    expect(record.finishedAt).toBeTypeOf('string')
  })
})
