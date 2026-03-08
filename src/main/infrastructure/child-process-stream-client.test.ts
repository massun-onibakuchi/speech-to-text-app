/**
 * Where: src/main/infrastructure/child-process-stream-client.test.ts
 * What:  Tests for the line-oriented child-process stream client.
 * Why:   Lock process lifecycle and abnormal-exit behavior before the local
 *        whisper.cpp adapter is wired on top of this abstraction.
 */

import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { ChildProcessStreamClient } from './child-process-stream-client'

class FakeReadable extends EventEmitter {
  setEncoding(): void {}
}

class FakeWritable {
  writes: string[] = []
  write(chunk: string): void {
    this.writes.push(chunk)
  }
}

class FakeChildProcess extends EventEmitter {
  stdout = new FakeReadable()
  stderr = new FakeReadable()
  stdin = new FakeWritable()
  private readonly emitExitOnSignal: Partial<Record<NodeJS.Signals, boolean>>

  constructor(options: { emitExitOnSignal?: Partial<Record<NodeJS.Signals, boolean>> } = {}) {
    super()
    this.emitExitOnSignal = options.emitExitOnSignal ?? {
      SIGTERM: true,
      SIGKILL: true
    }
  }

  kill = vi.fn((signal?: NodeJS.Signals) => {
    const normalizedSignal = signal ?? null
    if (normalizedSignal && this.emitExitOnSignal[normalizedSignal] === false) {
      return true
    }
    this.emit('exit', 0, normalizedSignal)
    return true
  })
}

describe('ChildProcessStreamClient', () => {
  it('parses stdout and stderr into newline-delimited events', () => {
    const child = new FakeChildProcess()
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any)
      }
    )

    const stdoutLines: string[] = []
    const stderrLines: string[] = []
    client.onStdoutLine((line) => stdoutLines.push(line))
    client.onStderrLine((line) => stderrLines.push(line))

    client.start()
    child.stdout.emit('data', 'hello\nworld')
    child.stdout.emit('data', '\n')
    child.stderr.emit('data', 'warn\n')

    expect(stdoutLines).toEqual(['hello', 'world'])
    expect(stderrLines).toEqual(['warn'])
  })

  it('writes newline-terminated control lines to stdin', () => {
    const child = new FakeChildProcess()
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any)
      }
    )

    client.start()
    client.writeLine('{"type":"start"}')

    expect(child.stdin.writes).toEqual(['{"type":"start"}\n'])
  })

  it('notifies exit listeners on unexpected child exit', () => {
    const child = new FakeChildProcess()
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any)
      }
    )

    const onExit = vi.fn()
    client.onExit(onExit)

    client.start()
    child.emit('exit', 1, 'SIGABRT')

    expect(onExit).toHaveBeenCalledWith({ code: 1, signal: 'SIGABRT' })
  })

  it('notifies error listeners on child process startup errors', () => {
    const child = new FakeChildProcess()
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any)
      }
    )

    const onError = vi.fn()
    client.onError(onError)

    client.start()
    child.emit('error', new Error('spawn ENOENT'))

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'spawn ENOENT'
    }))
  })

  it('stops cleanly with SIGTERM', async () => {
    const child = new FakeChildProcess()
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any)
      }
    )

    client.start()
    await client.stop()

    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  })

  it('escalates to SIGKILL when the child ignores SIGTERM', async () => {
    vi.useFakeTimers()
    const child = new FakeChildProcess({
      emitExitOnSignal: {
        SIGTERM: false,
        SIGKILL: true
      }
    })
    const client = new ChildProcessStreamClient(
      {
        command: '/bin/fake'
      },
      {
        spawnFn: vi.fn(() => child as any),
        stopTimeoutMs: 25
      }
    )

    client.start()
    const stopPromise = client.stop()
    await vi.advanceTimersByTimeAsync(25)
    await stopPromise

    expect(child.kill).toHaveBeenNthCalledWith(1, 'SIGTERM')
    expect(child.kill).toHaveBeenNthCalledWith(2, 'SIGKILL')
    vi.useRealTimers()
  })
})
