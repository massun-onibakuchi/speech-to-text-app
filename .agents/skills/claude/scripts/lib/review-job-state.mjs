/*
 * Where: .agents/skills/claude/scripts/lib/review-job-state.mjs
 * What: Durable file-backed job state helpers for the Claude review runtime.
 * Why: The tracked runtime needs explicit job records and output files instead
 *      of inferring liveness from foreground stdout timing.
 */

import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DEFAULT_RUNTIME_ROOT = path.join(os.tmpdir(), 'dicta-claude-review-runtime')

export const classifyRepoKey = (cwd) =>
  createHash('sha256').update(realpathSync(cwd)).digest('hex').slice(0, 16)

export const resolveRuntimeRoot = (env = process.env) =>
  env.CLAUDE_REVIEW_RUNTIME_ROOT || DEFAULT_RUNTIME_ROOT

export const resolveRepoRuntimeDir = (cwd, env = process.env) =>
  path.join(resolveRuntimeRoot(env), classifyRepoKey(cwd))

export const createReviewJobId = () => {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  return `review-${timestamp}-${randomUUID().slice(0, 8)}`
}

export const ensureDir = (dirPath) => {
  mkdirSync(dirPath, { recursive: true })
  return dirPath
}

export const resolveJobArtifacts = (cwd, jobId, env = process.env) => {
  const repoDir = ensureDir(resolveRepoRuntimeDir(cwd, env))
  const jobDir = ensureDir(path.join(repoDir, 'jobs', jobId))

  return {
    repoDir,
    jobDir,
    jobFile: path.join(jobDir, 'job.json'),
    promptFile: path.join(jobDir, 'prompt.txt'),
    stdoutFile: path.join(jobDir, 'stdout.txt'),
    stderrFile: path.join(jobDir, 'stderr.txt')
  }
}

export const writeJsonFile = (filePath, payload) => {
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

export const readJsonFile = (filePath) => JSON.parse(readFileSync(filePath, 'utf8'))

export const createInitialJobRecord = ({
  cwd,
  jobId,
  launchMode,
  model,
  resumedFromJobId,
  sessionId,
  artifacts
}) => {
  const now = new Date().toISOString()

  return {
    id: jobId,
    jobClass: 'review',
    cwd: realpathSync(cwd),
    launchMode,
    status: 'queued',
    sessionId,
    resumedFromJobId: resumedFromJobId || null,
    pid: null,
    model: model || null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    resultCategory: null,
    promptFile: artifacts.promptFile,
    stdoutFile: artifacts.stdoutFile,
    stderrFile: artifacts.stderrFile
  }
}

export const saveJobRecord = (artifacts, record) => {
  const nextRecord = {
    ...record,
    updatedAt: new Date().toISOString()
  }

  writeJsonFile(artifacts.jobFile, nextRecord)
  return nextRecord
}

export const loadJobRecord = (artifacts) => readJsonFile(artifacts.jobFile)

export const updateJobRecord = (artifacts, updater) => {
  const current = loadJobRecord(artifacts)
  return saveJobRecord(artifacts, updater(current))
}

export const writePromptFile = (artifacts, prompt) => {
  writeFileSync(artifacts.promptFile, prompt, 'utf8')
  if (!existsSync(artifacts.stdoutFile)) {
    writeFileSync(artifacts.stdoutFile, '', 'utf8')
  }
  if (!existsSync(artifacts.stderrFile)) {
    writeFileSync(artifacts.stderrFile, '', 'utf8')
  }
}
