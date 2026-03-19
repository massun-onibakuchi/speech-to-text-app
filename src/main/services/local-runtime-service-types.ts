// Where: Main process service layer.
// What: Shared types and typed errors for local runtime service supervision.
// Why: Ticket 4 introduces multiple collaborating modules around one localhost runtime contract,
//      so the transport and failure shapes need one reusable definition.

export type LocalRuntimeServiceStartupFailureCode =
  | 'runtime_not_ready'
  | 'version_mismatch'
  | 'runtime_executable_missing'
  | 'startup_aborted'
  | 'startup_timeout'
  | 'backend_mismatch'
  | 'startup_failed'

export type LocalRuntimeServiceTerminationCode =
  | 'stopped'
  | 'process_exit'
  | 'health_check_failed'

export interface LocalRuntimeServiceCredentials {
  authHeaderName: string
  authQueryParamName: string
  authToken: string
  // Reserved for Ticket 6 websocket/session setup so later tickets inherit one supervisor-owned token shape.
  sessionToken: string
}

export interface LocalRuntimeServiceEndpoint {
  host: string
  port: number
  baseUrl: string
  healthUrl: string
  modelsUrl: string
  wsUrl: string
}

export interface LocalRuntimeServiceConnection {
  endpoint: LocalRuntimeServiceEndpoint
  credentials: LocalRuntimeServiceCredentials
  pid: number | null
}

export interface LocalRuntimeServiceTermination {
  code: LocalRuntimeServiceTerminationCode
  detail: string
  exitCode: number | null
  signal: NodeJS.Signals | null
}

export interface LocalRuntimeServiceLaunchInput {
  runtimeRoot: string
  manifestBackend: string
  managedPythonExecutable: string
  endpoint: LocalRuntimeServiceEndpoint
  credentials: LocalRuntimeServiceCredentials
}

export interface LocalRuntimeServiceLaunchCommand {
  command: string
  args: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
}

export class LocalRuntimeServiceStartupError extends Error {
  readonly code: LocalRuntimeServiceStartupFailureCode

  constructor(code: LocalRuntimeServiceStartupFailureCode, message: string) {
    super(message)
    this.name = 'LocalRuntimeServiceStartupError'
    this.code = code
  }
}

export const cloneLocalRuntimeServiceConnection = (
  connection: LocalRuntimeServiceConnection
): LocalRuntimeServiceConnection => ({
  endpoint: { ...connection.endpoint },
  credentials: { ...connection.credentials },
  pid: connection.pid
})

export const cloneLocalRuntimeServiceTermination = (
  termination: LocalRuntimeServiceTermination
): LocalRuntimeServiceTermination => ({
  ...termination
})
