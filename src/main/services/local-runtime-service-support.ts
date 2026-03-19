// Where: Main process service layer.
// What: Launch, port, connection, and log-tail helpers for local runtime supervision.
// Why: Keeping process/bootstrap helpers separate lets the supervisor stay focused on lifecycle rules.

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { buildLocalRuntimeServiceHostScript } from '../config/local-runtime-service-host-script'
import {
  LOCAL_RUNTIME_SERVICE_AUTH_HEADER,
  LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM,
  LOCAL_RUNTIME_SERVICE_HEALTH_PATH,
  LOCAL_RUNTIME_SERVICE_HOST,
  LOCAL_RUNTIME_SERVICE_LOG_TAIL_LIMIT,
  LOCAL_RUNTIME_SERVICE_MODELS_PATH,
  LOCAL_RUNTIME_SERVICE_WEBSOCKET_PATH,
  LOCAL_RUNTIME_SERVICE_WRAPPER_FILENAME
} from '../config/local-runtime-service'
import type {
  LocalRuntimeServiceConnection,
  LocalRuntimeServiceLaunchCommand,
  LocalRuntimeServiceLaunchInput
} from './local-runtime-service-types'

export const appendLocalRuntimeServiceLogTail = (current: string, nextChunk: string): string => {
  const next = `${current}${nextChunk}`
  if (next.length <= LOCAL_RUNTIME_SERVICE_LOG_TAIL_LIMIT) {
    return next
  }
  return next.slice(-LOCAL_RUNTIME_SERVICE_LOG_TAIL_LIMIT)
}

export const waitForLocalRuntimeServiceDelay = async (durationMs: number): Promise<void> =>
  await new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })

export const reserveLoopbackPort = async (host: string): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = createServer()

    server.on('error', (error) => {
      reject(error)
    })

    server.listen(0, host, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve a loopback port.')))
        return
      }

      const { port } = address
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })

export const createLocalRuntimeServiceConnection = (port: number): LocalRuntimeServiceConnection => {
  const baseUrl = `http://${LOCAL_RUNTIME_SERVICE_HOST}:${port}`
  return {
    endpoint: {
      host: LOCAL_RUNTIME_SERVICE_HOST,
      port,
      baseUrl,
      healthUrl: `${baseUrl}${LOCAL_RUNTIME_SERVICE_HEALTH_PATH}`,
      modelsUrl: `${baseUrl}${LOCAL_RUNTIME_SERVICE_MODELS_PATH}`,
      wsUrl: `ws://${LOCAL_RUNTIME_SERVICE_HOST}:${port}${LOCAL_RUNTIME_SERVICE_WEBSOCKET_PATH}`
    },
    credentials: {
      authHeaderName: LOCAL_RUNTIME_SERVICE_AUTH_HEADER,
      authQueryParamName: LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM,
      authToken: randomBytes(24).toString('hex'),
      // Ticket 6 consumes this per-service session token during websocket session establishment.
      sessionToken: randomBytes(24).toString('hex')
    },
    pid: null
  }
}

const ensureServiceHostScript = (runtimeRoot: string): string => {
  const scriptPath = join(runtimeRoot, LOCAL_RUNTIME_SERVICE_WRAPPER_FILENAME)
  const nextContents = buildLocalRuntimeServiceHostScript()
  const currentContents = existsSync(scriptPath) ? readFileSync(scriptPath, 'utf8') : null
  if (currentContents !== nextContents) {
    writeFileSync(scriptPath, nextContents, 'utf8')
  }
  return scriptPath
}

export const buildDefaultLocalRuntimeServiceLaunchCommand = (
  input: LocalRuntimeServiceLaunchInput
): LocalRuntimeServiceLaunchCommand => {
  const scriptPath = ensureServiceHostScript(input.runtimeRoot)
  return {
    command: input.managedPythonExecutable,
    args: [
      scriptPath,
      '--host',
      input.endpoint.host,
      '--port',
      String(input.endpoint.port),
      '--backend',
      input.manifestBackend
    ],
    cwd: input.runtimeRoot,
    env: {
      PYTHONUNBUFFERED: '1',
      DICTA_SERVICE_TOKEN: input.credentials.authToken
    }
  }
}
