/**
 * Where: src/main/infrastructure/child-process-stream-client.ts
 * What:  Small wrapper around a long-lived line-oriented child process.
 * Why:   Local whisper.cpp streaming will be integrated as a spawned runtime,
 *        so process lifecycle, stdout parsing, and abnormal exits need one
 *        deterministic main-process abstraction.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

export interface ChildProcessStreamClientOptions {
  command: string
  args?: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export interface ChildProcessStreamClientDependencies {
  spawnFn?: typeof spawn
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
  stopTimeoutMs?: number
}

type LineListener = (line: string) => void
type ExitListener = (payload: { code: number | null; signal: NodeJS.Signals | null }) => void
type ErrorListener = (error: Error) => void

export class ChildProcessStreamClient {
  private readonly spawnFn: typeof spawn
  private readonly setTimeoutFn: typeof setTimeout
  private readonly clearTimeoutFn: typeof clearTimeout
  private readonly stopTimeoutMs: number
  private readonly stdoutListeners = new Set<LineListener>()
  private readonly stderrListeners = new Set<LineListener>()
  private readonly exitListeners = new Set<ExitListener>()
  private readonly errorListeners = new Set<ErrorListener>()
  private child: ChildProcessWithoutNullStreams | null = null
  private stdoutBuffer = ''
  private stderrBuffer = ''

  constructor(
    private readonly options: ChildProcessStreamClientOptions,
    dependencies: ChildProcessStreamClientDependencies = {}
  ) {
    this.spawnFn = dependencies.spawnFn ?? spawn
    this.setTimeoutFn = dependencies.setTimeoutFn ?? setTimeout
    this.clearTimeoutFn = dependencies.clearTimeoutFn ?? clearTimeout
    this.stopTimeoutMs = dependencies.stopTimeoutMs ?? 2_000
  }

  start(): void {
    if (this.child) {
      throw new Error('Child process stream client is already running.')
    }

    const child = this.spawnFn(this.options.command, this.options.args ?? [], {
      cwd: this.options.cwd,
      env: this.options.env,
      stdio: 'pipe'
    })
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    child.stdout.on('data', (chunk: string | Buffer) => {
      this.stdoutBuffer = this.emitLines(this.stdoutBuffer, String(chunk), this.stdoutListeners)
    })
    child.stderr.on('data', (chunk: string | Buffer) => {
      this.stderrBuffer = this.emitLines(this.stderrBuffer, String(chunk), this.stderrListeners)
    })
    child.on('exit', (code, signal) => {
      this.child = null
      this.stdoutBuffer = ''
      this.stderrBuffer = ''
      for (const listener of this.exitListeners) {
        listener({ code, signal })
      }
    })
    child.on('error', (error) => {
      this.child = null
      this.stdoutBuffer = ''
      this.stderrBuffer = ''
      const normalized = error instanceof Error ? error : new Error(String(error))
      for (const listener of this.errorListeners) {
        listener(normalized)
      }
    })
  }

  writeLine(line: string): void {
    if (!this.child?.stdin) {
      throw new Error('Child process stream client is not running.')
    }
    this.child.stdin.write(`${line}\n`)
  }

  async stop(): Promise<void> {
    if (!this.child) {
      return
    }

    const child = this.child
    await new Promise<void>((resolve) => {
      let settled = false
      let escalationTimer: ReturnType<typeof setTimeout> | null = null
      const settle = () => {
        if (settled) {
          return
        }
        settled = true
        if (escalationTimer !== null) {
          this.clearTimeoutFn(escalationTimer)
        }
        resolve()
      }

      child.once('exit', () => {
        settle()
      })
      escalationTimer = this.setTimeoutFn(() => {
        if (this.child === child) {
          child.kill('SIGKILL')
        }
      }, this.stopTimeoutMs)
      const didSignal = child.kill('SIGTERM')
      if (!didSignal && this.child !== child) {
        settle()
      }
    })
  }

  onStdoutLine(listener: LineListener): () => void {
    this.stdoutListeners.add(listener)
    return () => {
      this.stdoutListeners.delete(listener)
    }
  }

  onStderrLine(listener: LineListener): () => void {
    this.stderrListeners.add(listener)
    return () => {
      this.stderrListeners.delete(listener)
    }
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)
    return () => {
      this.exitListeners.delete(listener)
    }
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener)
    return () => {
      this.errorListeners.delete(listener)
    }
  }

  private emitLines(buffer: string, chunk: string, listeners: Set<LineListener>): string {
    const combined = buffer + chunk
    const parts = combined.split('\n')
    const trailing = parts.pop() ?? ''
    for (const line of parts) {
      const normalized = line.replace(/\r$/, '')
      if (normalized.length === 0) {
        continue
      }
      for (const listener of listeners) {
        listener(normalized)
      }
    }
    return trailing
  }
}
