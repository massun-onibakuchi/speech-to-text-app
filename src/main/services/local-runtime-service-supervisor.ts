// Where: Main process service layer.
// What: Supervises the managed WhisperLiveKit localhost process, readiness checks, and health monitoring.
// Why: Ticket 4 moves local streaming onto an app-owned localhost boundary, so the app needs one place
//      to launch it safely, enforce the localhost auth contract, and surface typed startup/runtime failures.

import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  LOCAL_RUNTIME_SERVICE_HOST,
  LOCAL_RUNTIME_SERVICE_HEALTHCHECK_INTERVAL_MS,
  LOCAL_RUNTIME_SERVICE_HEALTHCHECK_TIMEOUT_MS,
  LOCAL_RUNTIME_SERVICE_SHUTDOWN_TIMEOUT_MS,
  LOCAL_RUNTIME_SERVICE_STARTUP_POLL_INTERVAL_MS,
  LOCAL_RUNTIME_SERVICE_STARTUP_TIMEOUT_MS
} from '../config/local-runtime-service'
import type { LocalRuntimeInstallManager } from './local-runtime-install-manager'
import {
  appendLocalRuntimeServiceLogTail,
  buildDefaultLocalRuntimeServiceLaunchCommand,
  createLocalRuntimeServiceConnection,
  reserveLoopbackPort,
  waitForLocalRuntimeServiceDelay
} from './local-runtime-service-support'
import {
  cloneLocalRuntimeServiceConnection,
  cloneLocalRuntimeServiceTermination,
  LocalRuntimeServiceStartupError,
  type LocalRuntimeServiceConnection,
  type LocalRuntimeServiceLaunchCommand,
  type LocalRuntimeServiceLaunchInput,
  type LocalRuntimeServiceTermination
} from './local-runtime-service-types'

export {
  LocalRuntimeServiceStartupError
} from './local-runtime-service-types'
export type {
  LocalRuntimeServiceConnection,
  LocalRuntimeServiceLaunchCommand,
  LocalRuntimeServiceLaunchInput,
  LocalRuntimeServiceTermination
} from './local-runtime-service-types'

export interface LocalRuntimeServiceSupervisorOptions {
  installManager: LocalRuntimeInstallManager
  startupTimeoutMs?: number
  startupPollIntervalMs?: number
  healthcheckIntervalMs?: number
  healthcheckTimeoutMs?: number
  shutdownTimeoutMs?: number
  spawnProcess?: typeof spawn
  fetchImpl?: typeof fetch
  reservePort?: (host: string) => Promise<number>
  buildLaunchCommand?: (input: LocalRuntimeServiceLaunchInput) => LocalRuntimeServiceLaunchCommand
  onTermination?: (termination: LocalRuntimeServiceTermination) => void
}

type ResolvedRuntimeContext = {
  runtimeRoot: string
  manifestBackend: string
  managedPythonExecutable: string
}

type ActiveService = {
  child: ChildProcess
  connection: LocalRuntimeServiceConnection
  recentLogs: string
  expectedStop: boolean
  terminated: boolean
  healthTimer: NodeJS.Timeout | null
  terminationOverride: LocalRuntimeServiceTermination | null
  healthCheckInFlight: boolean
  terminationPromise: Promise<LocalRuntimeServiceTermination>
  resolveTermination: (termination: LocalRuntimeServiceTermination) => void
}

export class LocalRuntimeServiceSupervisor {
  private readonly installManager: LocalRuntimeInstallManager
  private readonly startupTimeoutMs: number
  private readonly startupPollIntervalMs: number
  private readonly healthcheckIntervalMs: number
  private readonly healthcheckTimeoutMs: number
  private readonly shutdownTimeoutMs: number
  private readonly spawnProcess: typeof spawn
  private readonly fetchImpl: typeof fetch
  private readonly reservePort: (host: string) => Promise<number>
  private readonly buildLaunchCommand: (input: LocalRuntimeServiceLaunchInput) => LocalRuntimeServiceLaunchCommand
  private readonly onTermination?: (termination: LocalRuntimeServiceTermination) => void
  private activeService: ActiveService | null = null
  private startupPromise: Promise<LocalRuntimeServiceConnection> | null = null
  private lastTermination: LocalRuntimeServiceTermination | null = null

  constructor(options: LocalRuntimeServiceSupervisorOptions) {
    this.installManager = options.installManager
    this.startupTimeoutMs = options.startupTimeoutMs ?? LOCAL_RUNTIME_SERVICE_STARTUP_TIMEOUT_MS
    this.startupPollIntervalMs = options.startupPollIntervalMs ?? LOCAL_RUNTIME_SERVICE_STARTUP_POLL_INTERVAL_MS
    this.healthcheckIntervalMs = options.healthcheckIntervalMs ?? LOCAL_RUNTIME_SERVICE_HEALTHCHECK_INTERVAL_MS
    this.healthcheckTimeoutMs = options.healthcheckTimeoutMs ?? LOCAL_RUNTIME_SERVICE_HEALTHCHECK_TIMEOUT_MS
    this.shutdownTimeoutMs = options.shutdownTimeoutMs ?? LOCAL_RUNTIME_SERVICE_SHUTDOWN_TIMEOUT_MS
    this.spawnProcess = options.spawnProcess ?? spawn
    this.fetchImpl = options.fetchImpl ?? fetch
    this.reservePort = options.reservePort ?? reserveLoopbackPort
    this.buildLaunchCommand = options.buildLaunchCommand ?? buildDefaultLocalRuntimeServiceLaunchCommand
    this.onTermination = options.onTermination
  }

  getActiveConnection(): LocalRuntimeServiceConnection | null {
    if (!this.activeService || this.activeService.terminated || this.startupPromise !== null) {
      return null
    }
    return cloneLocalRuntimeServiceConnection(this.activeService.connection)
  }

  getLastTermination(): LocalRuntimeServiceTermination | null {
    return this.lastTermination ? cloneLocalRuntimeServiceTermination(this.lastTermination) : null
  }

  async ensureRunning(options?: { signal?: AbortSignal }): Promise<LocalRuntimeServiceConnection> {
    if (this.startupPromise) {
      return await this.awaitWithCallerAbort(this.startupPromise, options?.signal)
    }

    if (this.activeService && !this.activeService.terminated) {
      return cloneLocalRuntimeServiceConnection(this.activeService.connection)
    }

    const startup = this.startService(options?.signal)
    this.startupPromise = startup

    try {
      return await startup
    } finally {
      if (this.startupPromise === startup) {
        this.startupPromise = null
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.activeService || this.activeService.terminated) {
      return
    }

    this.activeService.expectedStop = true
    await this.terminateService(this.activeService, {
      code: 'stopped',
      detail: 'Local runtime service stopped.',
      exitCode: null,
      signal: null
    })
  }

  private async startService(signal?: AbortSignal): Promise<LocalRuntimeServiceConnection> {
    const runtime = this.resolveRuntimeContext()
    const port = await this.reservePort(LOCAL_RUNTIME_SERVICE_HOST)
    if (signal?.aborted) {
      throw new LocalRuntimeServiceStartupError('startup_aborted', 'Local runtime service startup was aborted.')
    }

    const connection = createLocalRuntimeServiceConnection(port)
    const launch = this.buildLaunchCommand({
      runtimeRoot: runtime.runtimeRoot,
      manifestBackend: runtime.manifestBackend,
      managedPythonExecutable: runtime.managedPythonExecutable,
      endpoint: connection.endpoint,
      credentials: connection.credentials
    })
    const child = this.spawnProcess(launch.command, launch.args, {
      cwd: launch.cwd,
      env: {
        ...process.env,
        ...launch.env
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    const active = this.createActiveService(child, {
      ...connection,
      pid: child.pid ?? null
    })
    this.activeService = active

    const abortListener = (): void => {
      void this.terminateService(active, {
        code: 'stopped',
        detail: 'Local runtime service startup was aborted.',
        exitCode: null,
        signal: null
      })
    }
    signal?.addEventListener('abort', abortListener, { once: true })

    try {
      await this.waitForReadiness(active, runtime.manifestBackend, signal)
      this.startHealthMonitoring(active, runtime.manifestBackend)
      return cloneLocalRuntimeServiceConnection(active.connection)
    } catch (error) {
      if (!active.terminated) {
        const detail = error instanceof Error
          ? error.message
          : 'Local runtime service startup failed before the service became ready.'
        await this.terminateService(active, {
          code: 'stopped',
          detail,
          exitCode: null,
          signal: null
        })
      }
      throw error
    } finally {
      signal?.removeEventListener('abort', abortListener)
    }
  }

  private createActiveService(child: ChildProcess, connection: LocalRuntimeServiceConnection): ActiveService {
    let resolveTermination: (termination: LocalRuntimeServiceTermination) => void = () => {}
    const terminationPromise = new Promise<LocalRuntimeServiceTermination>((resolve) => {
      resolveTermination = resolve
    })

    const active: ActiveService = {
      child,
      connection,
      recentLogs: '',
      expectedStop: false,
      terminated: false,
      healthTimer: null,
      terminationOverride: null,
      healthCheckInFlight: false,
      terminationPromise,
      resolveTermination
    }

    child.stdout?.on('data', (chunk: Buffer | string) => {
      active.recentLogs = appendLocalRuntimeServiceLogTail(active.recentLogs, chunk.toString())
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      active.recentLogs = appendLocalRuntimeServiceLogTail(active.recentLogs, chunk.toString())
    })
    child.on('error', (error) => {
      active.recentLogs = appendLocalRuntimeServiceLogTail(active.recentLogs, `${error.message}\n`)
      this.finalizeTermination(active, {
        code: active.expectedStop ? 'stopped' : 'process_exit',
        detail: active.expectedStop
          ? 'Local runtime service stopped.'
          : `Local runtime service failed to start: ${error.message}`,
        exitCode: null,
        signal: null
      })
    })
    child.on('exit', (exitCode, signal) => {
      const defaultTermination: LocalRuntimeServiceTermination = active.expectedStop
        ? {
            code: 'stopped',
            detail: 'Local runtime service stopped.',
            exitCode,
            signal
          }
        : {
            code: 'process_exit',
            detail: 'Local runtime service exited unexpectedly.',
            exitCode,
            signal
          }
      this.finalizeTermination(active, defaultTermination)
    })

    return active
  }

  private finalizeTermination(active: ActiveService, defaultTermination: LocalRuntimeServiceTermination): void {
    if (active.terminated) {
      return
    }

    active.terminated = true
    if (active.healthTimer) {
      clearInterval(active.healthTimer)
      active.healthTimer = null
    }

    const termination = cloneLocalRuntimeServiceTermination(active.terminationOverride ?? defaultTermination)
    if (
      termination.code !== 'stopped' &&
      active.recentLogs.trim().length > 0 &&
      !termination.detail.includes('Recent service logs:')
    ) {
      termination.detail = `${termination.detail}\n\nRecent service logs:\n${active.recentLogs.trim()}`
    }

    if (this.activeService === active) {
      this.activeService = null
    }
    this.lastTermination = cloneLocalRuntimeServiceTermination(termination)
    active.resolveTermination(termination)
    this.onTermination?.(cloneLocalRuntimeServiceTermination(termination))
  }

  private async waitForReadiness(
    active: ActiveService,
    expectedBackend: string,
    signal?: AbortSignal
  ): Promise<void> {
    const deadline = Date.now() + this.startupTimeoutMs

    while (Date.now() < deadline) {
      if (signal?.aborted) {
        await this.terminateService(active, {
          code: 'stopped',
          detail: 'Local runtime service startup was aborted.',
          exitCode: null,
          signal: null
        })
        throw new LocalRuntimeServiceStartupError('startup_aborted', 'Local runtime service startup was aborted.')
      }

      if (active.terminated) {
        throw new LocalRuntimeServiceStartupError(
          'startup_failed',
          this.buildStartupFailureDetail('Local runtime service exited before it became ready.', active)
        )
      }

      try {
        const health = await this.fetchHealth(active.connection)
        if (health.response.status === 401) {
          throw new LocalRuntimeServiceStartupError(
            'startup_failed',
            this.buildStartupFailureDetail('Local runtime service rejected the app auth token.', active)
          )
        }

        if (health.response.ok && health.ready) {
          if (health.backend !== expectedBackend) {
            await this.terminateService(active, {
              code: 'stopped',
              detail: `Local runtime service reported backend ${health.backend} instead of ${expectedBackend}.`,
              exitCode: null,
              signal: null
            })
            throw new LocalRuntimeServiceStartupError(
              'backend_mismatch',
              `Local runtime service reported backend ${health.backend} instead of ${expectedBackend}.`
            )
          }

          await this.assertModelsEndpoint(active.connection)
          return
        }
      } catch (error) {
        if (error instanceof LocalRuntimeServiceStartupError) {
          throw error
        }
      }

      await waitForLocalRuntimeServiceDelay(this.startupPollIntervalMs)
    }

    await this.terminateService(active, {
      code: 'stopped',
      detail: 'Local runtime service startup timed out.',
      exitCode: null,
      signal: null
    })
    throw new LocalRuntimeServiceStartupError(
      'startup_timeout',
      this.buildStartupFailureDetail('Local runtime service did not become ready before the startup timeout.', active)
    )
  }

  private startHealthMonitoring(active: ActiveService, expectedBackend: string): void {
    active.healthTimer = setInterval(() => {
      if (active.terminated || active.healthCheckInFlight) {
        return
      }

      active.healthCheckInFlight = true
      void (async () => {
        try {
          const health = await this.fetchHealth(active.connection)
          if (!health.response.ok || !health.ready) {
            await this.terminateService(active, {
              code: 'health_check_failed',
              detail: `Local runtime health check returned ${health.response.status}.`,
              exitCode: null,
              signal: null
            })
            return
          }

          if (health.backend !== expectedBackend) {
            await this.terminateService(active, {
              code: 'health_check_failed',
              detail: `Local runtime backend changed to ${health.backend} while ${expectedBackend} was expected.`,
              exitCode: null,
              signal: null
            })
          }
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown local runtime health check failure.'
          await this.terminateService(active, {
            code: 'health_check_failed',
            detail,
            exitCode: null,
            signal: null
          })
        } finally {
          active.healthCheckInFlight = false
        }
      })()
    }, this.healthcheckIntervalMs)
  }

  private async terminateService(active: ActiveService, termination: LocalRuntimeServiceTermination): Promise<void> {
    if (active.terminated) {
      return
    }

    active.terminationOverride = cloneLocalRuntimeServiceTermination(termination)
    if (!active.child.killed) {
      active.child.kill('SIGTERM')
    }

    const completed = await Promise.race([
      active.terminationPromise.then(() => true),
      waitForLocalRuntimeServiceDelay(this.shutdownTimeoutMs).then(() => false)
    ])

    if (!completed) {
      active.child.kill('SIGKILL')
      await active.terminationPromise
    }
  }

  private async fetchHealth(connection: LocalRuntimeServiceConnection): Promise<{
    response: Response
    ready: boolean
    backend: string | null
  }> {
    const response = await this.fetchWithTimeout(connection.endpoint.healthUrl, {
      headers: {
        [connection.credentials.authHeaderName]: connection.credentials.authToken
      }
    })

    let ready = false
    let backend: string | null = null

    try {
      const payload = (await response.json()) as Record<string, unknown>
      ready = payload.ready === true
      backend = typeof payload.backend === 'string' ? payload.backend : null
    } catch {
      ready = false
      backend = null
    }

    return { response, ready, backend }
  }

  private async assertModelsEndpoint(connection: LocalRuntimeServiceConnection): Promise<void> {
    const response = await this.fetchWithTimeout(connection.endpoint.modelsUrl, {
      headers: {
        [connection.credentials.authHeaderName]: connection.credentials.authToken
      }
    })

    if (response.status === 401) {
      throw new LocalRuntimeServiceStartupError(
        'startup_failed',
        'Local runtime models endpoint rejected the app auth token.'
      )
    }
    if (!response.ok) {
      throw new LocalRuntimeServiceStartupError(
        'startup_failed',
        `Local runtime models endpoint returned ${response.status}.`
      )
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
    }, this.healthcheckTimeoutMs)

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal
      })
    } finally {
      clearTimeout(timeout)
    }
  }

  private resolveRuntimeContext(): ResolvedRuntimeContext {
    const snapshot = this.installManager.getStatusSnapshot()
    if (snapshot.requiresUpdate || (snapshot.installedVersion !== null && snapshot.installedVersion !== snapshot.manifest.version)) {
      throw new LocalRuntimeServiceStartupError(
        'version_mismatch',
        snapshot.detail ?? 'Local runtime version does not match the app-managed pinned version.'
      )
    }
    if (snapshot.state !== 'ready' || snapshot.installedVersion === null) {
      throw new LocalRuntimeServiceStartupError(
        'runtime_not_ready',
        snapshot.detail ?? snapshot.summary
      )
    }

    const managedPythonExecutable = join(snapshot.runtimeRoot, 'venv', 'bin', 'python')
    if (!existsSync(managedPythonExecutable)) {
      throw new LocalRuntimeServiceStartupError(
        'runtime_executable_missing',
        `Managed runtime executable is missing at ${managedPythonExecutable}. Reinstall the local runtime and try again.`
      )
    }

    return {
      runtimeRoot: snapshot.runtimeRoot,
      manifestBackend: snapshot.manifest.backend,
      managedPythonExecutable
    }
  }

  private buildStartupFailureDetail(prefix: string, active: ActiveService): string {
    if (active.recentLogs.trim().length === 0) {
      return prefix
    }
    return `${prefix}\n\nRecent service logs:\n${active.recentLogs.trim()}`
  }

  private async awaitWithCallerAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return await promise
    }
    if (signal.aborted) {
      throw new LocalRuntimeServiceStartupError('startup_aborted', 'Local runtime service startup was aborted.')
    }

    return await new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        signal.removeEventListener('abort', onAbort)
        reject(new LocalRuntimeServiceStartupError('startup_aborted', 'Local runtime service startup was aborted.'))
      }

      signal.addEventListener('abort', onAbort, { once: true })
      void promise.then(
        (value) => {
          signal.removeEventListener('abort', onAbort)
          resolve(value)
        },
        (error) => {
          signal.removeEventListener('abort', onAbort)
          reject(error)
        }
      )
    })
  }
}
