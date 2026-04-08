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

export const buildResultNextStep = ({ jobId, resultCategory }) => {
  switch (resultCategory) {
    case 'auth_error':
      return `Next step: run claude auth login or claude setup-token, then rerun resume --cwd <repo> --job-id ${jobId}.`
    case 'usage_limit':
      return `Next step: check Claude usage limits or budget, then rerun resume --cwd <repo> --job-id ${jobId}.`
    case 'missing_cli':
      return `Next step: install the Claude CLI, then rerun start or resume --cwd <repo> --job-id ${jobId}.`
    case 'error':
      return `Next step: inspect stderr and rerun resume --cwd <repo> --job-id ${jobId} if the session should continue.`
    default:
      return ''
  }
}

export const loadJobResult = (record) => ({
  jobId: record.id,
  status: record.status,
  sessionId: record.sessionId,
  resultCategory: record.resultCategory,
  exitCode: record.exitCode,
  finishedAt: record.finishedAt,
  nextStep: buildResultNextStep({
    jobId: record.id,
    resultCategory: record.resultCategory
  }),
  stdout: readFileSync(record.stdoutFile, 'utf8'),
  stderr: readFileSync(record.stderrFile, 'utf8')
})
