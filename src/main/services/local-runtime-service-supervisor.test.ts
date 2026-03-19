import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_RUNTIME_MANIFEST } from '../../shared/local-runtime'
import { LocalRuntimeInstallManager } from './local-runtime-install-manager'
import {
  LocalRuntimeServiceStartupError,
  LocalRuntimeServiceSupervisor,
  type LocalRuntimeServiceLaunchInput,
  type LocalRuntimeServiceLaunchCommand,
  type LocalRuntimeServiceTermination
} from './local-runtime-service-supervisor'

const electronMocks = vi.hoisted(() => ({
  getPath: vi.fn(() => '/tmp/dicta-tests')
}))

vi.mock('electron', () => ({
  app: {
    getPath: electronMocks.getPath
  }
}))

const createTempRoot = (): string => mkdtempSync(join(tmpdir(), 'dicta-local-service-'))

const seedInstalledRuntime = (runtimeBaseRoot: string, version: string = LOCAL_RUNTIME_MANIFEST.version): void => {
  const runtimeRoot = join(runtimeBaseRoot, 'current')
  const managedPythonExecutable = join(runtimeRoot, 'venv', 'bin', 'python')
  mkdirSync(join(runtimeRoot, 'venv', 'bin'), { recursive: true })
  writeFileSync(managedPythonExecutable, '#!/usr/bin/env bash\n', 'utf8')
  chmodSync(managedPythonExecutable, 0o755)
  writeFileSync(
    join(runtimeRoot, 'install-metadata.json'),
    JSON.stringify({
      runtimeId: LOCAL_RUNTIME_MANIFEST.runtimeId,
      backend: LOCAL_RUNTIME_MANIFEST.backend,
      version,
      installedAt: new Date().toISOString(),
      pythonExecutable: 'python3',
      pythonVersion: '3.11.9'
    }),
    'utf8'
  )
}

const writeFakeServiceScript = (rootDir: string): string => {
  const scriptPath = join(rootDir, 'fake-runtime-service.mjs')
  writeFileSync(
    scriptPath,
    `import { createServer } from 'node:http'

const host = process.env.DICTA_FAKE_HOST
const port = Number(process.env.DICTA_FAKE_PORT)
const backend = process.env.DICTA_FAKE_BACKEND
const token = process.env.DICTA_FAKE_TOKEN
const authHeader = (process.env.DICTA_FAKE_AUTH_HEADER ?? 'x-dicta-service-token').toLowerCase()
const readyDelayMs = Number(process.env.DICTA_FAKE_READY_DELAY_MS ?? '0')
const exitAfterMs = Number(process.env.DICTA_FAKE_EXIT_AFTER_MS ?? '0')
const failHealthAfterMs = Number(process.env.DICTA_FAKE_FAIL_HEALTH_AFTER_MS ?? '0')
const startTime = Date.now()

const isAuthorized = (request) => {
  const headerToken = request.headers[authHeader]
  if (typeof headerToken === 'string' && headerToken === token) {
    return true
  }

  const requestUrl = new URL(request.url ?? '/', \`http://\${host}:\${port}\`)
  return requestUrl.searchParams.get('service_token') === token
}

const server = createServer((request, response) => {
  if (!isAuthorized(request)) {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ detail: 'Unauthorized' }))
    return
  }

  const elapsedMs = Date.now() - startTime
  const requestUrl = new URL(request.url ?? '/', \`http://\${host}:\${port}\`)
  if (requestUrl.pathname === '/health') {
    const ready = elapsedMs >= readyDelayMs
    const unhealthy = failHealthAfterMs > 0 && elapsedMs >= failHealthAfterMs
    response.writeHead(unhealthy ? 503 : 200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      status: unhealthy ? 'error' : 'ok',
      backend,
      ready: ready && !unhealthy
    }))
    return
  }

  if (requestUrl.pathname === '/v1/models') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      object: 'list',
      data: [{ id: backend, object: 'model', owned_by: 'fake-runtime' }]
    }))
    return
  }

  response.writeHead(404, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ detail: 'Not found' }))
})

server.listen(port, host)

if (exitAfterMs > 0) {
  setTimeout(() => {
    process.exit(23)
  }, exitAfterMs)
}

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0)
  })
})
`,
    'utf8'
  )
  return scriptPath
}

const createLaunchCommandBuilder = (
  scriptPath: string,
  overrides?: {
    readyDelayMs?: number
    exitAfterMs?: number
    failHealthAfterMs?: number
    tokenOverride?: string
  }
) =>
  (input: LocalRuntimeServiceLaunchInput): LocalRuntimeServiceLaunchCommand => ({
    command: process.execPath,
    args: [scriptPath],
    env: {
      DICTA_FAKE_HOST: input.endpoint.host,
      DICTA_FAKE_PORT: String(input.endpoint.port),
      DICTA_FAKE_BACKEND: input.manifestBackend,
      DICTA_FAKE_TOKEN: overrides?.tokenOverride ?? input.credentials.authToken,
      DICTA_FAKE_AUTH_HEADER: input.credentials.authHeaderName,
      DICTA_FAKE_READY_DELAY_MS: String(overrides?.readyDelayMs ?? 0),
      DICTA_FAKE_EXIT_AFTER_MS: String(overrides?.exitAfterMs ?? 0),
      DICTA_FAKE_FAIL_HEALTH_AFTER_MS: String(overrides?.failHealthAfterMs ?? 0)
    }
  })

const waitForTermination = async (
  observed: Array<LocalRuntimeServiceTermination>,
  expectedCode: LocalRuntimeServiceTermination['code']
): Promise<LocalRuntimeServiceTermination> => {
  return await vi.waitFor(() => {
    const match = observed.find((termination) => termination.code === expectedCode)
    expect(match).toBeDefined()
    return match as LocalRuntimeServiceTermination
  })
}

describe('LocalRuntimeServiceSupervisor', () => {
  let tempRoot = ''

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  it('starts a loopback-only authenticated service and returns endpoint credentials', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath),
      startupTimeoutMs: 2_000,
      healthcheckIntervalMs: 5_000
    })

    const connection = await supervisor.ensureRunning()

    expect(connection.endpoint.host).toBe('127.0.0.1')
    expect(connection.endpoint.wsUrl).toContain(`ws://127.0.0.1:${connection.endpoint.port}/asr`)

    const unauthorized = await fetch(connection.endpoint.healthUrl)
    expect(unauthorized.status).toBe(401)

    const authorized = await fetch(connection.endpoint.healthUrl, {
      headers: {
        [connection.credentials.authHeaderName]: connection.credentials.authToken
      }
    })
    expect(authorized.status).toBe(200)
    await expect(authorized.json()).resolves.toMatchObject({
      status: 'ok',
      backend: LOCAL_RUNTIME_MANIFEST.backend,
      ready: true
    })

    const models = await fetch(connection.endpoint.modelsUrl, {
      headers: {
        [connection.credentials.authHeaderName]: connection.credentials.authToken
      }
    })
    expect(models.status).toBe(200)

    await supervisor.stop()
  })

  it('aborts startup cleanly before the service becomes ready', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath, { readyDelayMs: 1_000 }),
      startupTimeoutMs: 2_000,
      startupPollIntervalMs: 20,
      healthcheckIntervalMs: 5_000
    })

    const controller = new AbortController()
    const startup = supervisor.ensureRunning({ signal: controller.signal })
    setTimeout(() => {
      controller.abort()
    }, 50)

    await expect(startup).rejects.toMatchObject({
      name: 'LocalRuntimeServiceStartupError',
      code: 'startup_aborted'
    } satisfies Partial<LocalRuntimeServiceStartupError>)
    expect(supervisor.getActiveConnection()).toBeNull()
  })

  it('fails with startup_timeout when readiness never arrives before the deadline', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath, { readyDelayMs: 1_000 }),
      startupTimeoutMs: 120,
      startupPollIntervalMs: 20,
      healthcheckIntervalMs: 5_000
    })

    await expect(supervisor.ensureRunning()).rejects.toMatchObject({
      name: 'LocalRuntimeServiceStartupError',
      code: 'startup_timeout'
    } satisfies Partial<LocalRuntimeServiceStartupError>)
    expect(supervisor.getActiveConnection()).toBeNull()
    expect(supervisor.getLastTermination()).toMatchObject({
      code: 'stopped',
      detail: 'Local runtime service startup timed out.'
    })
  })

  it('fails before launch when the installed runtime version drifts from the manifest', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot, '0.0.1')
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const buildLaunchCommand = vi.fn()
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand
    })

    await expect(supervisor.ensureRunning()).rejects.toMatchObject({
      name: 'LocalRuntimeServiceStartupError',
      code: 'version_mismatch'
    } satisfies Partial<LocalRuntimeServiceStartupError>)
    expect(buildLaunchCommand).not.toHaveBeenCalled()
  })

  it('reports unexpected process exit after readiness', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const observed: LocalRuntimeServiceTermination[] = []
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath, { exitAfterMs: 120 }),
      startupTimeoutMs: 2_000,
      startupPollIntervalMs: 20,
      healthcheckIntervalMs: 40,
      healthcheckTimeoutMs: 200,
      onTermination: (termination) => {
        observed.push(termination)
      }
    })

    await supervisor.ensureRunning()
    const termination = await waitForTermination(observed, 'process_exit')

    expect(termination.exitCode).toBe(23)
    expect(supervisor.getActiveConnection()).toBeNull()
  })

  it('reports unhealthy services through the health monitor', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const observed: LocalRuntimeServiceTermination[] = []
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath, { failHealthAfterMs: 180 }),
      startupTimeoutMs: 2_000,
      startupPollIntervalMs: 20,
      healthcheckIntervalMs: 40,
      healthcheckTimeoutMs: 200,
      onTermination: (termination) => {
        observed.push(termination)
      }
    })

    await supervisor.ensureRunning()
    const termination = await waitForTermination(observed, 'health_check_failed')

    expect(termination.detail).toContain('health check returned')
    expect(supervisor.getActiveConnection()).toBeNull()
  })

  it('cleans up failed startup attempts so a later retry can launch fresh', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    let useWrongToken = true
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: (input) =>
        createLaunchCommandBuilder(scriptPath, {
          tokenOverride: useWrongToken ? 'wrong-token' : undefined
        })(input),
      startupTimeoutMs: 800,
      startupPollIntervalMs: 20,
      healthcheckIntervalMs: 5_000
    })

    await expect(supervisor.ensureRunning()).rejects.toMatchObject({
      name: 'LocalRuntimeServiceStartupError',
      code: 'startup_failed'
    } satisfies Partial<LocalRuntimeServiceStartupError>)
    expect(supervisor.getActiveConnection()).toBeNull()

    useWrongToken = false
    const connection = await supervisor.ensureRunning()
    expect(connection.pid).not.toBeNull()

    await supervisor.stop()
  })

  it('stops and starts a fresh service instance cleanly', async () => {
    tempRoot = createTempRoot()
    seedInstalledRuntime(tempRoot)
    const manager = new LocalRuntimeInstallManager({ runtimeBaseRoot: tempRoot })
    const scriptPath = writeFakeServiceScript(tempRoot)
    const supervisor = new LocalRuntimeServiceSupervisor({
      installManager: manager,
      buildLaunchCommand: createLaunchCommandBuilder(scriptPath),
      startupTimeoutMs: 2_000,
      healthcheckIntervalMs: 5_000
    })

    const first = await supervisor.ensureRunning()
    await supervisor.stop()
    expect(supervisor.getLastTermination()).toMatchObject({
      code: 'stopped'
    })

    const second = await supervisor.ensureRunning()
    expect(second.endpoint.port).not.toBe(first.endpoint.port)
    expect(second.credentials.authToken).not.toBe(first.credentials.authToken)

    await supervisor.stop()
  })
})
