/*
 * Where: .agents/skills/claude/scripts/lib/review-launcher.mjs
 * What: Launch helpers for tracked Claude review jobs and their detached worker.
 * Why: The CLI should create durable state first, then let a background worker
 *      update terminal status once Claude actually finishes.
 */

import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createInitialJobRecord,
  createReviewJobId,
  pruneTerminalJobs,
  resolveJobArtifacts,
  saveJobRecord,
  writePromptFile
} from './review-job-state.mjs'

const SCRIPT_PATH = fileURLToPath(new URL('../run-claude-review.mjs', import.meta.url))

export const buildStartPayload = ({
  cwd,
  env,
  launchMode = 'start',
  model,
  prompt,
  resumedFromJobId = null,
  sessionId
}) => {
  pruneTerminalJobs(cwd, env)
  const jobId = createReviewJobId()
  const resolvedSessionId = sessionId || randomUUID()
  const artifacts = resolveJobArtifacts(cwd, jobId, env)

  writePromptFile(artifacts, prompt)

  const record = saveJobRecord(
    artifacts,
    createInitialJobRecord({
      cwd,
      jobId,
      launchMode,
      model,
      resumedFromJobId,
      sessionId: resolvedSessionId,
      artifacts
    })
  )

  return {
    artifacts,
    record
  }
}

export const spawnDetachedReviewWorker = ({ cwd, env, jobId }) => {
  const child = spawn(
    process.execPath,
    [SCRIPT_PATH, 'worker', '--cwd', cwd, '--job-id', jobId],
    {
      cwd,
      detached: true,
      env,
      stdio: 'ignore'
    }
  )

  child.unref()
  return child
}

export const launchTrackedReview = ({ cwd, env = process.env, model, prompt }) => {
  const payload = buildStartPayload({
    cwd,
    env,
    launchMode: 'start',
    model,
    prompt
  })
  spawnDetachedReviewWorker({
    cwd,
    env,
    jobId: payload.record.id
  })

  return {
    ...payload.record,
    jobFile: payload.artifacts.jobFile
  }
}

export const resumeTrackedReview = ({
  cwd,
  env = process.env,
  model,
  prompt,
  resumedFromJobId = null,
  sessionId
}) => {
  const payload = buildStartPayload({
    cwd,
    env,
    launchMode: 'resume',
    model,
    prompt,
    resumedFromJobId,
    sessionId
  })
  spawnDetachedReviewWorker({
    cwd,
    env,
    jobId: payload.record.id
  })

  return {
    ...payload.record,
    jobFile: payload.artifacts.jobFile
  }
}
