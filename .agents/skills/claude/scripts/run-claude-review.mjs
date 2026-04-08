/*
 * Where: .agents/skills/claude/scripts/run-claude-review.mjs
 * What: Tracked Claude review runtime entrypoint for launching review jobs and
 *       running the detached worker that writes terminal state.
 * Why: Replace timeout-driven foreground supervision with explicit durable job
 *      records that later commands can inspect.
 */

import { createWriteStream, readFileSync } from 'node:fs'
import process from 'node:process'
import { spawn } from 'node:child_process'

import { launchTrackedReview } from './lib/review-launcher.mjs'
import {
  loadJobRecord,
  resolveJobArtifacts,
  saveJobRecord
} from './lib/review-job-state.mjs'

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
  node .agents/skills/claude/scripts/run-claude-review.mjs start --cwd <path> (--prompt-file <file> | --prompt-text <text>) [--model <model>] [--json]
  node .agents/skills/claude/scripts/run-claude-review.mjs worker --cwd <path> --job-id <id>`

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
    promptText: ''
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

  if (command === 'start') {
    const promptModes = [Boolean(options.promptFile), Boolean(options.promptText)].filter(Boolean)
    if (promptModes.length !== 1) {
      throw new Error('Expected exactly one of --prompt-file or --prompt-text for start')
    }
  }

  if (command === 'worker' && !options.jobId) {
    throw new Error('Expected --job-id for worker')
  }

  if (!['start', 'worker'].includes(command)) {
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

export const runStartCommand = (options, env = process.env) => {
  const prompt = readPrompt(options)
  const launched = launchTrackedReview({
    cwd: options.cwd,
    env,
    model: options.model,
    prompt
  })

  process.stdout.write(`${renderStartOutput(launched, options.json)}\n`)
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
      ...(record.model ? ['--model', record.model] : []),
      '--session-id',
      record.sessionId,
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
    runStartCommand(options)
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
