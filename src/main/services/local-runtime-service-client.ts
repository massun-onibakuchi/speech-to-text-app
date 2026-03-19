// Where: Main process service layer.
// What: Opens and normalizes a WhisperLiveKit localhost websocket session for the session controller.
// Why: Ticket 6 centralizes runtime transport ownership in Electron main, including auth/session tokens,
//      partial suppression, and finalized-segment normalization.

import {
  LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM,
  LOCAL_RUNTIME_SERVICE_SESSION_QUERY_PARAM
} from '../config/local-runtime-service'
import type { LocalStreamingRuntimeEvent } from '../../shared/domain'
import type { LocalRuntimeServiceConnection } from './local-runtime-service-types'

type RuntimeSnapshotLine = {
  speaker?: number
  text?: string | null
}

type RuntimeConfigMessage = {
  type: 'config'
}

type RuntimeReadyToStopMessage = {
  type: 'ready_to_stop'
}

type RuntimeSnapshotMessage = {
  type?: string
  error?: string
  lines?: RuntimeSnapshotLine[]
}

export type LocalRuntimeServiceClientErrorCode =
  | 'open_aborted'
  | 'service_connect_failed'
  | 'prepare_failed'
  | 'stream_interrupted'

export class LocalRuntimeServiceClientError extends Error {
  readonly code: LocalRuntimeServiceClientErrorCode

  constructor(code: LocalRuntimeServiceClientErrorCode, message: string) {
    super(message)
    this.name = 'LocalRuntimeServiceClientError'
    this.code = code
  }
}

export interface LocalRuntimeServiceClientFinalizationPolicy {
  strategy: 'runtime_default'
}

export const DEFAULT_LOCAL_RUNTIME_SESSION_FINALIZATION_POLICY: Readonly<LocalRuntimeServiceClientFinalizationPolicy> = Object.freeze({
  strategy: 'runtime_default'
})

export interface LocalRuntimeServiceClientOpenSessionOptions {
  connection: LocalRuntimeServiceConnection
  model: string
  language: string
  dictionaryTerms: readonly string[]
  finalization: LocalRuntimeServiceClientFinalizationPolicy
  signal?: AbortSignal
  onEvent?: (event: LocalStreamingRuntimeEvent) => void
  onPhaseChange?: (phase: 'prepare') => void
}

export interface LocalRuntimeServiceClientSession {
  appendAudio: (pcmFrames: Int16Array) => Promise<void>
  stop: () => Promise<void>
  cancel: () => Promise<void>
}

type WebSocketEventMap = {
  open: Event
  message: MessageEvent<unknown>
  close: CloseEvent
  error: Event
}

export interface LocalRuntimeServiceWebSocket {
  readonly readyState: number
  send(data: string | ArrayBuffer | Blob | ArrayBufferView): void
  close(code?: number, reason?: string): void
  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void
  ): void
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (event: WebSocketEventMap[K]) => void
  ): void
}

export interface LocalRuntimeServiceClientOptions {
  createWebSocket?: (url: string) => LocalRuntimeServiceWebSocket
  sessionQueryParamName?: string
}

const OPEN_WEBSOCKET_STATE = 1
const CONNECTING_WEBSOCKET_STATE = 0

const buildQueryParamUrl = (baseUrl: string, queryParamName: string, queryParamValue: string): URL => {
  const url = new URL(baseUrl)
  url.searchParams.set(queryParamName, queryParamValue)
  return url
}

const readMessageText = async (data: unknown): Promise<string> => {
  if (typeof data === 'string') {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(data))
  }
  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    return await data.text()
  }
  throw new Error('Local runtime websocket produced an unsupported message payload.')
}

const normalizeCloseDetail = (event: CloseEvent): string => {
  const reason = event.reason.trim()
  if (reason.length > 0) {
    return `Local runtime websocket closed unexpectedly (${event.code}): ${reason}`
  }
  return `Local runtime websocket closed unexpectedly (${event.code}).`
}

const isNonSilenceTextLine = (line: RuntimeSnapshotLine): line is RuntimeSnapshotLine & { text: string } =>
  line.speaker !== -2 && typeof line.text === 'string' && line.text.trim().length > 0

const extractAppendedFinalTexts = (
  previousLines: readonly RuntimeSnapshotLine[],
  currentLines: readonly RuntimeSnapshotLine[]
): string[] => {
  const previousKeys = previousLines.map((line) => JSON.stringify(line))
  const currentKeys = currentLines.map((line) => JSON.stringify(line))

  let pruneOffset = 0
  if (currentKeys.length === 0) {
    pruneOffset = previousKeys.length
  } else if (previousKeys.length > 0) {
    const firstCurrent = currentKeys[0]
    const matchedIndex = previousKeys.findIndex((key) => key === firstCurrent)
    pruneOffset = matchedIndex >= 0 ? matchedIndex : previousKeys.length
  }

  let commonPrefixLength = 0
  const remainingPrevious = previousKeys.length - pruneOffset
  const maxComparable = Math.min(remainingPrevious, currentKeys.length)
  while (
    commonPrefixLength < maxComparable &&
    previousKeys[pruneOffset + commonPrefixLength] === currentKeys[commonPrefixLength]
  ) {
    commonPrefixLength += 1
  }

  return currentLines
    .slice(commonPrefixLength)
    .filter(isNonSilenceTextLine)
    .map((line) => line.text.trim())
}

export const buildLocalRuntimeServiceSessionUrl = (
  connection: LocalRuntimeServiceConnection,
  options: Pick<LocalRuntimeServiceClientOpenSessionOptions, 'language'>
): string => {
  const authParamName = connection.credentials.authQueryParamName || LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM
  const sessionParamName = LOCAL_RUNTIME_SERVICE_SESSION_QUERY_PARAM
  const url = buildQueryParamUrl(connection.endpoint.wsUrl, authParamName, connection.credentials.authToken)
  url.searchParams.set(sessionParamName, connection.credentials.sessionToken)
  url.searchParams.set('mode', 'full')

  const normalizedLanguage = options.language.trim()
  if (normalizedLanguage.length > 0 && normalizedLanguage.toLowerCase() !== 'auto') {
    url.searchParams.set('language', normalizedLanguage)
  }

  return url.toString()
}

export class LocalRuntimeServiceClient {
  private readonly createWebSocket: (url: string) => LocalRuntimeServiceWebSocket
  private readonly sessionQueryParamName: string

  constructor(options: LocalRuntimeServiceClientOptions = {}) {
    this.createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url) as LocalRuntimeServiceWebSocket)
    this.sessionQueryParamName = options.sessionQueryParamName ?? LOCAL_RUNTIME_SERVICE_SESSION_QUERY_PARAM
  }

  async openSession(options: LocalRuntimeServiceClientOpenSessionOptions): Promise<LocalRuntimeServiceClientSession> {
    if (options.signal?.aborted) {
      throw new LocalRuntimeServiceClientError('open_aborted', 'Local runtime session startup was aborted.')
    }

    // WhisperLiveKit 0.2.20.post1 exposes per-session language but not websocket prompt/finalization fields.
    // The controller still carries hints/finalization explicitly so future runtime revisions can consume them
    // without changing its public contract.
    void options.model
    void options.dictionaryTerms
    void options.finalization

    const connection = {
      ...options.connection,
      credentials: {
        ...options.connection.credentials,
        authQueryParamName: options.connection.credentials.authQueryParamName || LOCAL_RUNTIME_SERVICE_AUTH_QUERY_PARAM
      }
    }
    const url = new URL(buildLocalRuntimeServiceSessionUrl(connection, options))
    url.searchParams.set(this.sessionQueryParamName, connection.credentials.sessionToken)
    const socket = this.createWebSocket(url.toString())

    let sequence = 0
    let openedTransport = false
    let receivedConfig = false
    let terminalState: 'running' | 'completed' | 'cancelled' | 'errored' = 'running'
    let previousLines: RuntimeSnapshotLine[] = []
    let openSettled = false
    let terminalSettled = false
    let stopRequested = false

    let resolveOpen: (session: LocalRuntimeServiceClientSession) => void = () => {}
    let rejectOpen: (error: unknown) => void = () => {}
    let resolveTerminal: () => void = () => {}
    const openPromise = new Promise<LocalRuntimeServiceClientSession>((resolve, reject) => {
      resolveOpen = resolve
      rejectOpen = reject
    })
    const terminalPromise = new Promise<void>((resolve) => {
      resolveTerminal = resolve
    })

    const cleanup = (): void => {
      socket.removeEventListener('open', handleOpen)
      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      socket.removeEventListener('error', handleError)
      options.signal?.removeEventListener('abort', handleAbort)
    }

    const settleOpenResolve = (session: LocalRuntimeServiceClientSession): void => {
      if (openSettled) {
        return
      }
      openSettled = true
      resolveOpen(session)
    }

    const settleOpenReject = (error: unknown): void => {
      if (openSettled) {
        return
      }
      openSettled = true
      rejectOpen(error)
    }

    const settleTerminal = (): void => {
      if (terminalSettled) {
        return
      }
      terminalSettled = true
      cleanup()
      resolveTerminal()
    }

    const safeClose = (): void => {
      if (socket.readyState !== CONNECTING_WEBSOCKET_STATE && socket.readyState !== OPEN_WEBSOCKET_STATE) {
        return
      }
      try {
        socket.close()
      } catch {
        // Ignore close races; the controller already owns terminal handling above this client.
      }
    }

    const emitEvent = (event: LocalStreamingRuntimeEvent): void => {
      try {
        options.onEvent?.(event)
      } catch {
        // The client must not let consumer callback failures break the websocket transport.
      }
    }

    const finishTerminal = (
      nextTerminalState: 'completed' | 'cancelled' | 'errored',
      detail?: string
    ): void => {
      if (terminalState !== 'running') {
        return
      }
      terminalState = nextTerminalState

      if (nextTerminalState === 'errored') {
        const error = new LocalRuntimeServiceClientError(
          receivedConfig
            ? 'stream_interrupted'
            : openedTransport
              ? 'prepare_failed'
              : 'service_connect_failed',
          detail ?? 'Local runtime websocket failed unexpectedly.'
        )
        if (receivedConfig) {
          emitEvent({
            kind: 'error',
            sequence,
            phase: 'stream_run',
            detail: error.message
          })
          sequence += 1
        } else {
          settleOpenReject(error)
        }
      }

      if (nextTerminalState === 'completed') {
        if (receivedConfig) {
          emitEvent({ kind: 'end', sequence })
          sequence += 1
        } else {
          settleOpenReject(
            new LocalRuntimeServiceClientError('prepare_failed', 'Local runtime websocket ended before session setup completed.')
          )
        }
      }

      if (nextTerminalState === 'cancelled') {
        if (!receivedConfig) {
          settleOpenReject(new LocalRuntimeServiceClientError('open_aborted', 'Local runtime session startup was aborted.'))
        }
      }

      safeClose()
      settleTerminal()
    }

    const handleAbort = (): void => {
      finishTerminal('cancelled')
    }

    const handleOpen = (): void => {
      openedTransport = true
      options.onPhaseChange?.('prepare')
    }

    const handleMessage = (event: MessageEvent<unknown>): void => {
      void (async () => {
        const rawText = await readMessageText(event.data)
        const payload = JSON.parse(rawText) as RuntimeConfigMessage | RuntimeReadyToStopMessage | RuntimeSnapshotMessage

        if (payload.type === 'config' && !receivedConfig) {
          receivedConfig = true
          settleOpenResolve(session)
          return
        }

        if (!receivedConfig) {
          finishTerminal('errored', 'Local runtime websocket did not send the expected config handshake.')
          return
        }

        if (payload.type === 'ready_to_stop') {
          finishTerminal('completed')
          return
        }

        const snapshot = payload as RuntimeSnapshotMessage
        if (typeof snapshot.error === 'string' && snapshot.error.trim().length > 0) {
          finishTerminal('errored', snapshot.error.trim())
          return
        }

        if (!Array.isArray(snapshot.lines)) {
          return
        }

        const appendedFinalTexts = extractAppendedFinalTexts(previousLines, snapshot.lines)
        previousLines = snapshot.lines.slice()
        for (const text of appendedFinalTexts) {
          emitEvent({
            kind: 'final',
            sequence,
            text
          })
          sequence += 1
        }
      })().catch((error) => {
        const detail = error instanceof Error
          ? error.message
          : 'Local runtime websocket produced an invalid message.'
        finishTerminal('errored', detail)
      })
    }

    const handleClose = (event: CloseEvent): void => {
      if (terminalState !== 'running') {
        settleTerminal()
        return
      }
      finishTerminal('errored', normalizeCloseDetail(event))
    }

    const handleError = (): void => {
      if (terminalState !== 'running') {
        return
      }
      finishTerminal('errored', 'Local runtime websocket reported an error.')
    }

    const session: LocalRuntimeServiceClientSession = {
      appendAudio: async (pcmFrames: Int16Array): Promise<void> => {
        if (terminalState !== 'running') {
          throw new LocalRuntimeServiceClientError('stream_interrupted', 'Local runtime session is not accepting audio.')
        }
        if (socket.readyState !== OPEN_WEBSOCKET_STATE) {
          throw new LocalRuntimeServiceClientError('stream_interrupted', 'Local runtime websocket is not open.')
        }
        if (pcmFrames.length === 0) {
          return
        }

        socket.send(new Uint8Array(pcmFrames.buffer, pcmFrames.byteOffset, pcmFrames.byteLength))
      },
      stop: async (): Promise<void> => {
        if (terminalState !== 'running') {
          await terminalPromise
          return
        }
        if (!stopRequested) {
          stopRequested = true
          if (socket.readyState !== OPEN_WEBSOCKET_STATE) {
            finishTerminal('errored', 'Local runtime websocket is not open.')
          } else {
            socket.send(new Uint8Array(0))
          }
        }
        await terminalPromise
      },
      cancel: async (): Promise<void> => {
        if (terminalState === 'running') {
          finishTerminal('cancelled')
        }
        await terminalPromise
      }
    }

    socket.addEventListener('open', handleOpen)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
    socket.addEventListener('error', handleError)
    options.signal?.addEventListener('abort', handleAbort, { once: true })

    return await openPromise
  }
}
