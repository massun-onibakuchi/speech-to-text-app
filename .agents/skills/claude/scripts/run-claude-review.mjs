/*
 * Where: .agents/skills/claude/scripts/run-claude-review.mjs
 * What: Portable Claude headless review wrapper with timeout, resume, and
 *       normalized failure reporting.
 * Why: Prevent callers from misclassifying silent Claude progress as hangs and
 *      give consistent auth, rate-limit, and resume behavior across machines.
 */

import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DEFAULT_DEADLINE_SECONDS = 900
const DEFAULT_KILL_GRACE_MS = 5_000
const DEFAULT_RESUME_PROMPT =
  'Continue from the most recent unfinished task and provide the final response.'

const RESULT_EXIT_CODES = {
  success: 0,
  auth_error: 20,
  usage_limit: 21,
  missing_cli: 22,
  error: 23,
  timeout: 124
}

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const parseArgs = (argv) => {
  const options = {
    cwd: '',
    deadlineSeconds: DEFAULT_DEADLINE_SECONDS,
    promptFile: '',
    promptText: '',
    resumeLast: false,
    resumeSessionId: '',
    model: '',
    outputFile: '',
    sessionFile: ''
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    const readValue = () => {
      const value = argv[index + 1]
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
      case '--deadline-seconds':
        options.deadlineSeconds = Number.parseInt(readValue(), 10)
        break
      case '--model':
        options.model = readValue()
        break
      case '--output-file':
        options.outputFile = readValue()
        break
      case '--prompt-file':
        options.promptFile = readValue()
        break
      case '--prompt-text':
        options.promptText = readValue()
        break
      case '--resume-last':
        options.resumeLast = true
        break
      case '--resume-session-id':
        options.resumeSessionId = readValue()
        break
      case '--session-file':
        options.sessionFile = readValue()
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!options.cwd) {
    throw new Error('Expected --cwd to be set')
  }

  if (!Number.isInteger(options.deadlineSeconds) || options.deadlineSeconds <= 0) {
    throw new Error('Expected --deadline-seconds to be a positive integer')
  }

  const reviewModes = [
    Boolean(options.promptFile),
    Boolean(options.promptText),
    options.resumeLast,
    Boolean(options.resumeSessionId)
  ].filter(Boolean).length

  if (reviewModes !== 1) {
    throw new Error(
      'Expected exactly one of --prompt-file, --prompt-text, --resume-last, or --resume-session-id'
    )
  }

  if (options.resumeSessionId && !UUID_PATTERN.test(options.resumeSessionId)) {
    throw new Error('Expected --resume-session-id to be a valid UUID')
  }

  return options
}

const readPrompt = (options) => {
  if (options.promptFile) {
    return readFileSync(options.promptFile, 'utf8')
  }

  if (options.promptText) {
    return options.promptText
  }

  return DEFAULT_RESUME_PROMPT
}

export const classifyClaudeFailure = ({ exitCode, stderr, stdout, timedOut, spawnError }) => {
  if (timedOut) {
    return { status: 'timeout', exitCode: RESULT_EXIT_CODES.timeout, resumable: true }
  }

  if (spawnError?.code === 'ENOENT') {
    return { status: 'missing_cli', exitCode: RESULT_EXIT_CODES.missing_cli, resumable: false }
  }

  const combinedOutput = `${stdout}\n${stderr}`.toLowerCase()

  if (AUTH_PATTERNS.some((pattern) => combinedOutput.includes(pattern))) {
    return { status: 'auth_error', exitCode: RESULT_EXIT_CODES.auth_error, resumable: false }
  }

  if (USAGE_PATTERNS.some((pattern) => combinedOutput.includes(pattern))) {
    return { status: 'usage_limit', exitCode: RESULT_EXIT_CODES.usage_limit, resumable: true }
  }

  if (exitCode === 0) {
    return { status: 'success', exitCode: RESULT_EXIT_CODES.success, resumable: false }
  }

  return { status: 'error', exitCode: RESULT_EXIT_CODES.error, resumable: false }
}

export const buildClaudeCommand = (options) => {
  const args = ['--print']
  const prompt = readPrompt(options)
  const sessionId =
    options.resumeSessionId || (options.resumeLast ? '' : randomUUID())

  if (options.model) {
    args.push('--model', options.model)
  }

  if (options.resumeSessionId) {
    args.push('--resume', options.resumeSessionId)
  } else if (options.resumeLast) {
    args.push('--continue')
  } else {
    args.push('--session-id', sessionId)
  }

  args.push(prompt)

  return {
    command: 'claude',
    args,
    prompt,
    sessionId
  }
}

const ensureParentDir = (filePath) => {
  mkdirSync(path.dirname(filePath), { recursive: true })
}

const writeIfRequested = (filePath, content) => {
  if (!filePath) {
    return
  }

  ensureParentDir(filePath)
  writeFileSync(filePath, content, 'utf8')
}

const emitStatus = ({
  exitCode,
  sessionId,
  status,
  resumable
}) => {
  console.error(
    `CLAUDE_WRAPPER_RESULT status=${status} exit=${exitCode} session_id=${sessionId || ''} resumable=${String(resumable)}`
  )
}

export const runClaudeReview = async (options) => {
  const { args, command, sessionId } = buildClaudeCommand(options)
  const startedAt = Date.now()
  let stderr = ''
  let stdout = ''
  let timedOut = false
  let spawnError = null
  let exitCode = 1

  if (options.sessionFile && sessionId) {
    writeIfRequested(options.sessionFile, `${sessionId}\n`)
  }

  console.error(
    `CLAUDE_WRAPPER_START cwd=${options.cwd} deadline_seconds=${options.deadlineSeconds} session_id=${sessionId || ''}`
  )

  const child = spawn(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  const heartbeat = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - startedAt) / 1000)
    console.error(`CLAUDE_WRAPPER_HEARTBEAT elapsed=${elapsedSeconds}`)
  }, 30_000)

  const deadlineTimer = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
    setTimeout(() => {
      if (!child.killed) {
        child.kill('SIGKILL')
      }
    }, DEFAULT_KILL_GRACE_MS).unref()
  }, options.deadlineSeconds * 1_000)

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString()
  })

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString()
  })

  child.on('error', (error) => {
    spawnError = error
  })

  await new Promise((resolve) => {
    child.on('close', (code) => {
      exitCode = code ?? 1
      resolve()
    })
  })

  clearInterval(heartbeat)
  clearTimeout(deadlineTimer)

  if (stdout) {
    process.stdout.write(stdout)
  }

  if (stderr) {
    process.stderr.write(stderr)
  }

  if (options.outputFile) {
    writeIfRequested(options.outputFile, stdout)
  }

  const result = classifyClaudeFailure({
    exitCode,
    stderr,
    stdout,
    timedOut,
    spawnError
  })

  emitStatus({
    exitCode: result.exitCode,
    sessionId,
    status: result.status,
    resumable: result.resumable
  })

  process.exitCode = result.exitCode
}

const isMainModule = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false

if (isMainModule) {
  try {
    await runClaudeReview(parseArgs(process.argv.slice(2)))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    emitStatus({
      exitCode: RESULT_EXIT_CODES.error,
      sessionId: '',
      status: 'error',
      resumable: false
    })
    process.exitCode = RESULT_EXIT_CODES.error
  }
}
