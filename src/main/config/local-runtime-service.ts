// Where: Main-process config.
// What: Centralized runtime service supervision defaults and transport constants.
// Why: Ticket 4 adds an out-of-process localhost runtime, so ports, auth names, and timing
//      knobs need one shared source of truth instead of scattered literals.

export const LOCAL_RUNTIME_SERVICE_HOST = '127.0.0.1' as const
export const LOCAL_RUNTIME_SERVICE_HEALTH_PATH = '/health' as const
export const LOCAL_RUNTIME_SERVICE_MODELS_PATH = '/v1/models' as const
export const LOCAL_RUNTIME_SERVICE_WEBSOCKET_PATH = '/asr' as const
export const LOCAL_RUNTIME_SERVICE_AUTH_HEADER = 'x-dicta-service-token' as const
export const LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM = 'service_token' as const
export const LOCAL_RUNTIME_SERVICE_SESSION_QUERY_PARAM = 'session_token' as const
export const LOCAL_RUNTIME_SERVICE_WRAPPER_FILENAME = 'dicta-runtime-service-host.py' as const

export const LOCAL_RUNTIME_SERVICE_STARTUP_TIMEOUT_MS = 45_000 as const
export const LOCAL_RUNTIME_SERVICE_STARTUP_POLL_INTERVAL_MS = 150 as const
export const LOCAL_RUNTIME_SERVICE_HEALTHCHECK_INTERVAL_MS = 2_000 as const
export const LOCAL_RUNTIME_SERVICE_HEALTHCHECK_TIMEOUT_MS = 1_500 as const
export const LOCAL_RUNTIME_SERVICE_SHUTDOWN_TIMEOUT_MS = 5_000 as const
export const LOCAL_RUNTIME_SERVICE_LOG_TAIL_LIMIT = 8_192 as const
