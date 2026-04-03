/*
Where: src/main/services/codex-cli-service.ts
What: Main-process wrapper for Codex CLI install, version, login-status probing, and transformation execution.
Why: Keep Codex-specific shell behavior isolated behind one service so provider readiness
     and execution can depend on stable normalized states instead of raw child-process output.
*/

import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TransformModel } from '../../shared/domain'

const LOGIN_REQUIRED_PATTERN = /\b(not logged in|logged out|login required|sign in required|run codex login)\b/i
const LOGGED_IN_PATTERN = /\b(logged in|authenticated|session active|token valid)\b/i
const VERSION_PATTERN = /\b\d+\.\d+\.\d+(?:[-+._a-z0-9]+)?\b/i
const CODEX_EXECUTION_MODEL = 'gpt-5.4-mini'

type CommandOutput = {
  stdout: string
  stderr: string
}

type RunCommandOptions = {
  cwd?: string
  input?: string
}

type RunCommand = (
  file: string,
  args: readonly string[],
  options?: RunCommandOptions
) => Promise<CommandOutput>

type CommandError = Partial<CommandOutput> & {
  code?: number | string
}

export type CodexCliReadiness =
  | { kind: 'cli_not_installed' }
  | { kind: 'cli_login_required' }
  | { kind: 'ready'; version?: string }
  | { kind: 'cli_probe_failed'; message: string }

export interface CodexCliTransformationInput {
  model: TransformModel
  prompt: string
}

type TempFileOps = {
  createTempDir: () => Promise<string>
  readTextFile: (path: string) => Promise<string>
  removeDir: (path: string) => Promise<void>
}

export class CodexCliService {
  private readonly run: RunCommand
  private readonly tempFiles: TempFileOps

  constructor(options?: { runCommand?: RunCommand; tempFiles?: Partial<TempFileOps> }) {
    this.run = options?.runCommand ?? runCommand
    this.tempFiles = {
      createTempDir: options?.tempFiles?.createTempDir ?? (async () => mkdtemp(join(tmpdir(), 'dicta-codex-'))),
      readTextFile: options?.tempFiles?.readTextFile ?? (async (path: string) => readFile(path, 'utf8')),
      removeDir: options?.tempFiles?.removeDir ?? (async (path: string) => rm(path, { recursive: true, force: true }))
    }
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

  async runTransformation(input: CodexCliTransformationInput): Promise<string> {
    if (input.model !== CODEX_EXECUTION_MODEL) {
      throw new Error(`OpenAI subscription execution only supports ${CODEX_EXECUTION_MODEL}.`)
    }

    const tempDir = await this.tempFiles.createTempDir()
    const outputPath = join(tempDir, 'last-message.txt')

    try {
      try {
        await this.run(
          'codex',
          [
            'exec',
            '-m',
            input.model,
            '--skip-git-repo-check',
            '--sandbox',
            'read-only',
            '--color',
            'never',
            '--output-last-message',
            outputPath,
            '-'
          ],
          { input: input.prompt }
        )
      } catch (error) {
        if (isMissingExecutable(error)) {
          throw new Error('Codex CLI is not installed. Install it to use ChatGPT subscription models.')
        }

        const out = readCommandOutput(error)
        throw new Error(summarizeExecutionFailure(out, error))
      }

      try {
        const output = await this.tempFiles.readTextFile(outputPath)
        if (output.trim().length === 0) {
          throw new Error('Codex CLI returned empty transformation text.')
        }
        return output
      } catch (error) {
        if (error instanceof Error && error.message === 'Codex CLI returned empty transformation text.') {
          throw error
        }
        throw new Error('Codex CLI completed without writing transformation output.')
      }
    } finally {
      await this.tempFiles.removeDir(tempDir)
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

const summarizeExecutionFailure = (out: CommandOutput, error?: unknown): string => {
  const stderrLine = out.stderr
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
  if (stderrLine) {
    return `Codex CLI transformation failed: ${stderrLine}`
  }

  const stdoutLine = out.stdout
    .split('\n')
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.length > 0 && !isCodexExecNoise(line))
  if (stdoutLine) {
    return `Codex CLI transformation failed: ${stdoutLine}`
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as CommandError).code
    if (typeof code === 'number' || typeof code === 'string') {
      return `Codex CLI transformation failed with exit code ${code}.`
    }
  }

  return 'Codex CLI transformation failed.'
}

const isCodexExecNoise = (line: string): boolean =>
  /^(OpenAI Codex v|[-]+|workdir:|model:|provider:|approval:|sandbox:|reasoning effort:|reasoning summaries:|session id:|user|codex|tokens used|mcp startup:)/i.test(
    line
  )

const runCommand: RunCommand = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = execFile(file, args, { cwd: options?.cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(
          Object.assign(error, {
            stdout: typeof stdout === 'string' ? stdout : '',
            stderr: typeof stderr === 'string' ? stderr : ''
          })
        )
        return
      }

      resolve({
        stdout: typeof stdout === 'string' ? stdout : '',
        stderr: typeof stderr === 'string' ? stderr : ''
      })
    })

    if (options?.input !== undefined) {
      child.stdin?.end(options.input)
    }
  })

const isMissingExecutable = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && (error as CommandError).code === 'ENOENT')
