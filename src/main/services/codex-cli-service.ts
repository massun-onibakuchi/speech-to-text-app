/*
Where: src/main/services/codex-cli-service.ts
What: Main-process wrapper for Codex CLI install, version, and login-status probing.
Why: Keep Codex-specific shell behavior isolated behind one service so provider readiness
     can depend on stable normalized states instead of raw child-process output.
*/

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const LOGIN_REQUIRED_PATTERN = /\b(not logged in|logged out|login required|sign in required|run codex login)\b/i
const LOGGED_IN_PATTERN = /\b(logged in|authenticated|session active|token valid)\b/i
const VERSION_PATTERN = /\b\d+\.\d+\.\d+(?:[-+._a-z0-9]+)?\b/i

type CommandOutput = {
  stdout: string
  stderr: string
}

type RunCommand = (
  file: string,
  args: readonly string[]
) => Promise<CommandOutput>

type CommandError = Partial<CommandOutput> & {
  code?: number | string
}

export type CodexCliReadiness =
  | { kind: 'cli_not_installed' }
  | { kind: 'cli_login_required' }
  | { kind: 'ready'; version?: string }
  | { kind: 'cli_probe_failed'; message: string }

export class CodexCliService {
  private readonly run: RunCommand

  constructor(options?: { runCommand?: RunCommand }) {
    this.run = options?.runCommand ?? execFileAsync
  }

  async getReadiness(): Promise<CodexCliReadiness> {
    const version = await this.getVersion()
    if (version === null) {
      return { kind: 'cli_not_installed' }
    }

    try {
      const out = await this.run('codex', ['login', 'status'])
      return parseLoginStatus(out, version)
    } catch (error) {
      const out = readCommandOutput(error)
      const parsed = parseLoginStatus(out, version ?? undefined)
      if (parsed.kind !== 'cli_probe_failed') {
        return parsed
      }

      return {
        kind: 'cli_probe_failed',
        message: summarizeProbeFailure(out, error)
      }
    }
  }

  async logout(): Promise<void> {
    try {
      await this.run('codex', ['logout'])
    } catch (error) {
      if (isMissingExecutable(error)) {
        return
      }
      throw error
    }
  }

  private async getVersion(): Promise<string | null | undefined> {
    try {
      const out = await this.run('codex', ['--version'])
      return extractVersion(out)
    } catch (error) {
      if (isMissingExecutable(error)) {
        return null
      }
      return undefined
    }
  }
}

const parseLoginStatus = (
  out: CommandOutput,
  version?: string
): CodexCliReadiness => {
  const text = `${out.stdout}\n${out.stderr}`.trim()

  if (LOGIN_REQUIRED_PATTERN.test(text)) {
    return { kind: 'cli_login_required' }
  }

  if (LOGGED_IN_PATTERN.test(text)) {
    return version ? { kind: 'ready', version } : { kind: 'ready' }
  }

  return {
    kind: 'cli_probe_failed',
    message: summarizeProbeFailure(out)
  }
}

const extractVersion = (out: CommandOutput): string | undefined => {
  const match = `${out.stdout}\n${out.stderr}`.match(VERSION_PATTERN)
  return match?.[0]
}

const readCommandOutput = (error: unknown): CommandOutput => {
  if (!error || typeof error !== 'object') {
    return { stdout: '', stderr: '' }
  }

  const value = error as CommandError
  return {
    stdout: typeof value.stdout === 'string' ? value.stdout : '',
    stderr: typeof value.stderr === 'string' ? value.stderr : ''
  }
}

const summarizeProbeFailure = (out: CommandOutput, error?: unknown): string => {
  const text = `${out.stdout}\n${out.stderr}`
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (text) {
    return text
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as CommandError).code
    if (typeof code === 'number' || typeof code === 'string') {
      return `Codex CLI readiness probe failed with exit code ${code}.`
    }
  }

  return 'Codex CLI readiness probe failed.'
}

const isMissingExecutable = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as CommandError).code === 'ENOENT')
