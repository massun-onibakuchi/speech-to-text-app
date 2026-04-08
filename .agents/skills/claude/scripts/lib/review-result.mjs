/*
 * Where: .agents/skills/claude/scripts/lib/review-result.mjs
 * What: Helpers for reading terminal Claude review output from durable state.
 * Why: Keep status/result rendering separate from launch and worker concerns.
 */

import { readFileSync } from 'node:fs'

export const isTerminalReviewStatus = (status) =>
  status === 'completed' || status === 'failed'

export const throwIfResultNotReady = (record) => {
  if (isTerminalReviewStatus(record.status)) {
    return
  }

  throw new Error(
    `Result is not ready for job ${record.id}; current status is ${record.status}`
  )
}

export const loadJobResult = (record) => ({
  jobId: record.id,
  status: record.status,
  sessionId: record.sessionId,
  resultCategory: record.resultCategory,
  exitCode: record.exitCode,
  finishedAt: record.finishedAt,
  stdout: readFileSync(record.stdoutFile, 'utf8'),
  stderr: readFileSync(record.stderrFile, 'utf8')
})
