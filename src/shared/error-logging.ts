// Where: src/shared/error-logging.ts
// What:  Structured logging helpers with sensitive-data redaction.
// Why:   Enforce a consistent observability policy across main + renderer.

export type LogLevel = 'error' | 'warn' | 'info'
export type LogScope = 'main' | 'renderer'

export interface StructuredLogInput {
  level: LogLevel
  scope: LogScope
  event: string
  message?: string
  error?: unknown
  context?: Record<string, unknown>
}

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization)/i
const TOKEN_PATTERNS: RegExp[] = [
  /(bearer\s+)[a-z0-9._-]+/gi,
  /\b(sk-[a-z0-9_-]{8,})\b/gi,
  /\b(AIza[a-z0-9_-]{8,})\b/gi
]

const redactSensitiveString = (input: string): string => {
  let output = input
  output = output.replace(
    /((?:api[_ -]?key|token|secret|password|authorization)\s*[:=]\s*)[^\s,;]+/gi,
    `$1${REDACTED}`
  )
  for (const pattern of TOKEN_PATTERNS) {
    output = output.replace(pattern, REDACTED)
  }
  return output
}

const redactValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return redactSensitiveString(value)
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item))
  }
  if (value && typeof value === 'object') {
    const next: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(item)
    }
    return next
  }
  return value
}

const getErrorShape = (error: unknown): Record<string, unknown> | null => {
  if (!(error instanceof Error)) {
    return null
  }
  return {
    name: error.name,
    message: redactSensitiveString(error.message),
    stack: typeof error.stack === 'string' ? redactSensitiveString(error.stack) : undefined
  }
}

export const buildStructuredLogEntry = (input: StructuredLogInput): Record<string, unknown> => ({
  timestamp: new Date().toISOString(),
  level: input.level,
  scope: input.scope,
  event: input.event,
  message: redactSensitiveString(input.message ?? ''),
  context: redactValue(input.context ?? {}),
  error: getErrorShape(input.error)
})

export const logStructured = (input: StructuredLogInput): void => {
  const entry = buildStructuredLogEntry(input)
  const serialized = JSON.stringify(entry)
  if (input.level === 'error') {
    console.error(serialized)
    return
  }
  if (input.level === 'warn') {
    console.warn(serialized)
    return
  }
  console.info(serialized)
}
