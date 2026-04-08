/*
 * Where: .agents/skills/claude/scripts/run-claude-review.mjs
 * What: Tracked Claude review runtime entrypoint for launching jobs, reading
 *       explicit status, and returning final results from durable state.
 * Why: Replace timeout-driven foreground supervision with explicit job records
 *      that later commands can inspect without guessing from stdout silence.
 */

import { createWriteStream, readFileSync } from 'node:fs'
import process from 'node:process'
import { spawn } from 'node:child_process'

import { launchTrackedReview, resumeTrackedReview } from './lib/review-launcher.mjs'
import {
  loadJobRecord,
  resolveJobArtifacts,
  saveJobRecord
} from './lib/review-job-state.mjs'
import { loadJobResult, throwIfResultNotReady } from './lib/review-result.mjs'

const AUTH_PATTERNS = [
  'not logged in',
  'please run /login',
  'login required',
  'authentication required',
  'invalid api key',
  'api key missing',
  'setup-token'
]

const USAGE_PATTERNS = [
  'usage limit',
  'rate limit',
  'too many requests',
  'credit balance',
  'quota exceeded',
  'billing',
  'max budget'
]

const usage = () => `Usage:
  node .agents/skills/claude/scripts/run-claude-review.mjs start --cwd <path> (--prompt-file <file> | --prompt-text <text>) [--model <model>] [--wait] [--wait-seconds <n>] [--json]
  node .agents/skills/claude/scripts/run-claude-review.mjs resume --cwd <path> (--job-id <id> | --session-id <uuid>) [--prompt-file <file> | --prompt-text <text>] [--model <model>] [--wait] [--wait-seconds <n>] [--json]
  node .agents/skills/claude/scripts/run-claude-review.mjs status --cwd <path> --job-id <id> [--json]
  node .agents/skills/claude/scripts/run-claude-review.mjs result --cwd <path> --job-id <id> [--json]
  node .agents/skills/claude/scripts/run-claude-review.mjs worker --cwd <path> --job-id <id>

Notes:
  start remains the default compatibility command when the shell wrapper is called with flags only.
  --wait polls tracked job state and is compatibility-only; it is not the primary control path.
  --resume-last is intentionally unsupported because tracked resume resolution must stay deterministic.`

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEFAULT_WAIT_SECONDS = 900
const WAIT_POLL_INTERVAL_MS = 250

const readPrompt = (options) => {
  if (options.promptFile) {
    return readFileSync(options.promptFile, 'utf8')
  }

  return options.promptText
}

const parseCliArgs = (argv) => {
  const [command, ...rest] = argv
  if (!command) {
    throw new Error(usage())
  }

  const options = {
    command,
    cwd: '',
    jobId: '',
    json: false,
    model: '',
    promptFile: '',
    promptText: '',
    sessionId: '',
    wait: false,
    waitSeconds: DEFAULT_WAIT_SECONDS
  }

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]
    const readValue = () => {
      const value = rest[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${arg}`)
      }
      index += 1
      return value
    }

    switch (arg) {
      case '--cwd':
        options.cwd = readValue()
        break
      case '--job-id':
        options.jobId = readValue()
        break
      case '--json':
        options.json = true
        break
      case '--wait':
        options.wait = true
        break
      case '--wait-seconds':
        options.waitSeconds = Number(readValue())
        break
      case '--session-id':
        options.sessionId = readValue()
        break
      case '--model':
        options.model = readValue()
        break
      case '--prompt-file':
        options.promptFile = readValue()
        break
      case '--prompt-text':
        options.promptText = readValue()
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!options.cwd) {
    throw new Error('Expected --cwd to be set')
  }

  if (!Number.isFinite(options.waitSeconds) || options.waitSeconds <= 0) {
    throw new Error('Expected --wait-seconds to be a positive number')
  }

  if (command === 'start') {
    const promptModes = [Boolean(options.promptFile), Boolean(options.promptText)].filter(Boolean)
    if (promptModes.length !== 1) {
      throw new Error('Expected exactly one of --prompt-file or --prompt-text for start')
    }
  }

  if (command === 'resume') {
    const hasJobId = Boolean(options.jobId)
    const hasSessionId = Boolean(options.sessionId)
    const promptModes = [Boolean(options.promptFile), Boolean(options.promptText)].filter(Boolean)

    if (Number(hasJobId) + Number(hasSessionId) !== 1) {
      throw new Error('Expected exactly one of --job-id or --session-id for resume')
    }

    if (hasSessionId && !SESSION_ID_PATTERN.test(options.sessionId)) {
      throw new Error('Expected --session-id to be a valid UUID for resume')
    }

    if (hasJobId && promptModes.length > 0) {
      throw new Error('Resume by --job-id reuses the stored prompt and does not accept prompt overrides')
    }

    if (hasJobId && options.model) {
      throw new Error('Resume by --job-id reuses the stored model and does not accept model overrides')
    }

    if (hasSessionId && promptModes.length !== 1) {
      throw new Error(
        'Resume by --session-id requires exactly one of --prompt-file or --prompt-text'
      )
    }
  }

  if (['status', 'result', 'worker'].includes(command) && !options.jobId) {
    throw new Error(`Expected --job-id for ${command}`)
  }

  if (!['start', 'resume', 'status', 'result', 'worker'].includes(command)) {
    throw new Error(usage())
  }

  return options
}

export const classifyResultCategory = ({ spawnError, stderr, stdout, exitCode }) => {
  if (spawnError?.code === 'ENOENT') {
    return 'missing_cli'
  }

  const combined = `${stdout}\n${stderr}`.toLowerCase()
  if (AUTH_PATTERNS.some((pattern) => combined.includes(pattern))) {
    return 'auth_error'
  }
  if (USAGE_PATTERNS.some((pattern) => combined.includes(pattern))) {
    return 'usage_limit'
  }
  if (exitCode === 0) {
    return 'success'
  }
  return 'error'
}

const renderStartOutput = (payload, asJson) => {
  if (asJson) {
    return JSON.stringify({
      jobId: payload.id,
      status: payload.status,
      sessionId: payload.sessionId,
      jobFile: payload.jobFile,
      stdoutFile: payload.stdoutFile,
      stderrFile: payload.stderrFile
    })
  }

  return `CLAUDE_REVIEW_START job_id=${payload.id} status=${payload.status} session_id=${payload.sessionId}`
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const waitForTerminalJob = async ({ cwd, env, jobId, waitSeconds }) => {
  const artifacts = resolveJobArtifacts(cwd, jobId, env)
  const deadline = Date.now() + waitSeconds * 1000
  let record = loadJobRecord(artifacts)

  while (record.status !== 'completed' && record.status !== 'failed') {
    if (Date.now() >= deadline) {
      const error = new Error(
        `Timed out waiting for completion of job ${jobId} after ${waitSeconds} seconds`
      )
      error.name = 'WaitTimeoutError'
      throw error
    }

    await sleep(WAIT_POLL_INTERVAL_MS)
    record = loadJobRecord(artifacts)
  }

  return record
}

const renderWaitTimeout = ({ jobId, sessionId, waitSeconds }, asJson) => {
  if (asJson) {
    return JSON.stringify({
      jobId,
      sessionId,
      status: 'timed_out_waiting',
      waitSeconds
    })
  }

  return `Timed out waiting for completion of job ${jobId} after ${waitSeconds} seconds`
}

const renderCompletedWaitOutput = (payload, asJson) => {
  if (asJson) {
    return JSON.stringify(payload)
  }

  if (payload.status === 'failed') {
    const parts = [payload.stderr.trimEnd()]
    if (payload.nextStep) {
      parts.push(payload.nextStep)
    }
    return parts.filter(Boolean).join('\n')
  }

  return payload.stdout
}

const maybeWaitForResult = async ({ cwd, env, launched, options }) => {
  if (!options.wait) {
    process.stdout.write(`${renderStartOutput(launched, options.json)}\n`)
    return
  }

  try {
    const record = await waitForTerminalJob({
      cwd,
      env,
      jobId: launched.id,
      waitSeconds: options.waitSeconds
    })
    const payload = loadJobResult(record)
    const output = renderCompletedWaitOutput(payload, options.json)
    if (payload.status === 'failed') {
      process.exitCode = payload.exitCode ?? 1
    }
    process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  } catch (error) {
    if (error instanceof Error && error.name === 'WaitTimeoutError') {
      process.stdout.write(
        `${renderWaitTimeout(
          {
            jobId: launched.id,
            sessionId: launched.sessionId,
            waitSeconds: options.waitSeconds
          },
          options.json
        )}\n`
      )
      process.exitCode = 124
      return
    }

    throw error
  }
}

export const runStartCommand = async (options, env = process.env) => {
  const prompt = readPrompt(options)
  const launched = launchTrackedReview({
    cwd: options.cwd,
    env,
    model: options.model,
    prompt
  })

  await maybeWaitForResult({
    cwd: options.cwd,
    env,
    launched,
    options
  })
}

const loadResumeRequest = (options, env = process.env) => {
  if (options.jobId) {
    const artifacts = resolveJobArtifacts(options.cwd, options.jobId, env)
    const record = loadJobRecord(artifacts)

    return {
      model: record.model ?? '',
      prompt: readFileSync(record.promptFile, 'utf8'),
      resumedFromJobId: record.id,
      sessionId: record.sessionId
    }
  }

  return {
    model: options.model,
    prompt: readPrompt(options),
    resumedFromJobId: null,
    sessionId: options.sessionId
  }
}

export const runResumeCommand = async (options, env = process.env) => {
  const resumeRequest = loadResumeRequest(options, env)
  const launched = resumeTrackedReview({
    cwd: options.cwd,
    env,
    model: resumeRequest.model,
    prompt: resumeRequest.prompt,
    resumedFromJobId: resumeRequest.resumedFromJobId,
    sessionId: resumeRequest.sessionId
  })

  await maybeWaitForResult({
    cwd: options.cwd,
    env,
    launched,
    options
  })
}

const renderStatusOutput = (payload, asJson) => {
  if (asJson) {
    return JSON.stringify(payload)
  }

  return [
    'CLAUDE_REVIEW_STATUS',
    `job_id=${payload.jobId}`,
    `status=${payload.status}`,
    `result_category=${payload.resultCategory ?? ''}`,
    `finished_at=${payload.finishedAt ?? ''}`
  ].join(' ')
}

export const runStatusCommand = (options, env = process.env) => {
  const artifacts = resolveJobArtifacts(options.cwd, options.jobId, env)
  const record = loadJobRecord(artifacts)
  const payload = {
    jobId: record.id,
    status: record.status,
    sessionId: record.sessionId,
    resultCategory: record.resultCategory,
    exitCode: record.exitCode,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    stdoutFile: record.stdoutFile,
    stderrFile: record.stderrFile
  }

  process.stdout.write(`${renderStatusOutput(payload, options.json)}\n`)
}

const renderResultOutput = (payload, asJson) => {
  if (asJson) {
    return JSON.stringify(payload)
  }

  if (payload.status === 'failed') {
    return [
      'CLAUDE_REVIEW_RESULT',
      `job_id=${payload.jobId}`,
      `status=${payload.status}`,
      `result_category=${payload.resultCategory ?? ''}`,
      `exit_code=${payload.exitCode ?? ''}`,
      payload.nextStep
    ]
      .filter(Boolean)
      .join('\n')
  }

  return [
    'CLAUDE_REVIEW_RESULT',
    `job_id=${payload.jobId}`,
    `status=${payload.status}`,
    `result_category=${payload.resultCategory ?? ''}`,
    `exit_code=${payload.exitCode ?? ''}`,
    `stdout_bytes=${Buffer.byteLength(payload.stdout, 'utf8')}`,
    `stderr_bytes=${Buffer.byteLength(payload.stderr, 'utf8')}`
  ].join(' ')
}

export const runResultCommand = (options, env = process.env) => {
  const artifacts = resolveJobArtifacts(options.cwd, options.jobId, env)
  const record = loadJobRecord(artifacts)

  throwIfResultNotReady(record)

  const payload = loadJobResult(record)
  process.stdout.write(`${renderResultOutput(payload, options.json)}\n`)
}

export const runWorkerCommand = async (options, env = process.env) => {
  const artifacts = resolveJobArtifacts(options.cwd, options.jobId, env)
  const record = loadJobRecord(artifacts)
  const prompt = readFileSync(artifacts.promptFile, 'utf8')
  const stdoutStream = createWriteStream(artifacts.stdoutFile, { flags: 'a' })
  const stderrStream = createWriteStream(artifacts.stderrFile, { flags: 'a' })
  let stdout = ''
  let stderr = ''
  let spawnError = null
  let exitCode = 1

  const child = spawn(
    'claude',
    [
      '--print',
      ...(record.launchMode === 'resume'
        ? ['--resume', record.sessionId]
        : ['--session-id', record.sessionId]),
      ...(record.model ? ['--model', record.model] : []),
      prompt
    ],
    {
      cwd: record.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )

  saveJobRecord(artifacts, {
    ...record,
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    status: 'running'
  })

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    stdout += text
    stdoutStream.write(text)
  })

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr += text
    stderrStream.write(text)
  })

  child.on('error', (error) => {
    spawnError = error
    stderr += `${error.message}\n`
    stderrStream.write(`${error.message}\n`)
  })

  await new Promise((resolve) => {
    child.on('close', (code) => {
      exitCode = code ?? 1
      resolve()
    })
  })

  stdoutStream.end()
  stderrStream.end()

  saveJobRecord(artifacts, {
    ...loadJobRecord(artifacts),
    status: exitCode === 0 ? 'completed' : 'failed',
    finishedAt: new Date().toISOString(),
    exitCode: spawnError ? 1 : exitCode,
    resultCategory: classifyResultCategory({
      spawnError,
      stderr,
      stdout,
      exitCode: spawnError ? 1 : exitCode
    })
  })
}

const main = async () => {
  const options = parseCliArgs(process.argv.slice(2))

  if (options.command === 'start') {
    await runStartCommand(options)
    return
  }

  if (options.command === 'resume') {
    await runResumeCommand(options)
    return
  }

  if (options.command === 'status') {
    runStatusCommand(options)
    return
  }

  if (options.command === 'result') {
    runResultCommand(options)
    return
  }

  await runWorkerCommand(options)
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
}
