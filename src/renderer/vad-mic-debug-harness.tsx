/*
Where: src/renderer/vad-mic-debug-harness.tsx
What: Minimal manual harness for exercising the live Groq/browser MicVAD path in Electron.
Why: Reproduce microphone/VAD lifecycle bugs against the real renderer integration instead of a fake test seam.
*/

import { startTransition, useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  startGroqBrowserVadCapture,
  type GroqBrowserVadCapture,
  type GroqBrowserVadDebugEvent
} from './groq-browser-vad-capture'
import {
  appendVadDebugEvent,
  describeVadDebugEvent,
  parseVadHarnessConfigDraft,
  summarizeVadUtterance,
  type VadHarnessConfigDraft,
  type VadHarnessUtteranceSummary
} from './vad-mic-debug-utils'

const OFFICIAL_MIC_VAD_DOC_DEFAULTS = {
  positiveSpeechThreshold: 0.3,
  negativeSpeechThreshold: 0.25,
  redemptionMs: 1_400,
  preSpeechPadMs: 800,
  minSpeechMs: 400,
  backpressureSignalMs: 300
} as const

type BrowserMicDevice = {
  id: string
  label: string
}

type HarnessStatus = 'idle' | 'starting' | 'listening' | 'stopping' | 'error'

const createDefaultConfigDraft = (): VadHarnessConfigDraft => ({
  positiveSpeechThreshold: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.positiveSpeechThreshold),
  negativeSpeechThreshold: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.negativeSpeechThreshold),
  redemptionMs: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.redemptionMs),
  preSpeechPadMs: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.preSpeechPadMs),
  minSpeechMs: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.minSpeechMs),
  backpressureSignalMs: String(OFFICIAL_MIC_VAD_DOC_DEFAULTS.backpressureSignalMs)
})

const formatTimestamp = (value: number): string => `${Math.round(value)}ms`

const enumerateMicDevices = async (): Promise<BrowserMicDevice[]> => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  let unnamedCount = 0
  return devices
    .filter((device) => device.kind === 'audioinput')
    .map((device) => {
      unnamedCount += 1
      return {
        id: device.deviceId,
        label: device.label.trim() || `Microphone ${unnamedCount}`
      }
    })
}

export const VadMicDebugHarness = () => {
  const captureRef = useRef<GroqBrowserVadCapture | null>(null)
  const [status, setStatus] = useState<HarnessStatus>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [devices, setDevices] = useState<BrowserMicDevice[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [configDraft, setConfigDraft] = useState<VadHarnessConfigDraft>(() => createDefaultConfigDraft())
  const [events, setEvents] = useState<GroqBrowserVadDebugEvent[]>([])
  const [utterances, setUtterances] = useState<VadHarnessUtteranceSummary[]>([])
  const [fatalError, setFatalError] = useState('')

  const refreshDevices = async (): Promise<void> => {
    try {
      const nextDevices = await enumerateMicDevices()
      setDevices(nextDevices)
      if (nextDevices.length > 0 && selectedDeviceId.length === 0) {
        setSelectedDeviceId(nextDevices[0]!.id)
      }
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error))
    }
  }

  useEffect(() => {
    void refreshDevices()
  }, [])

  useEffect(() => () => {
    void captureRef.current?.cancel().catch(() => {})
  }, [])

  const appendEvent = (event: GroqBrowserVadDebugEvent): void => {
    startTransition(() => {
      setEvents((current) => appendVadDebugEvent(current, event))
    })
  }

  const startListening = async (): Promise<void> => {
    if (captureRef.current) {
      return
    }

    setStatus('starting')
    setFatalError('')
    setEvents([])
    setUtterances([])
    const nextSessionId = `vad-debug-${Date.now()}`
    setSessionId(nextSessionId)
    const parsedConfig = parseVadHarnessConfigDraft(configDraft)
    if (parsedConfig.error) {
      setStatus('error')
      setFatalError(parsedConfig.error)
      return
    }

    try {
      const capture = await startGroqBrowserVadCapture({
        sessionId: nextSessionId,
        deviceConstraints: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          channelCount: { ideal: 1 },
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        },
        sink: {
          pushStreamingAudioUtteranceChunk: async (chunk) => {
            startTransition(() => {
              setUtterances((current) => [...current, summarizeVadUtterance(chunk)])
            })
          }
        },
        onFatalError: (error) => {
          captureRef.current = null
          setStatus('error')
          setFatalError(error instanceof Error ? error.message : String(error))
        },
        onDebugEvent: appendEvent,
        traceEnabled: true,
        config: parsedConfig.config
      })
      captureRef.current = capture
      setStatus('listening')
    } catch (error) {
      captureRef.current = null
      setStatus('error')
      setFatalError(error instanceof Error ? error.message : String(error))
    }
  }

  const stopListening = async (mode: 'stop' | 'cancel'): Promise<void> => {
    if (!captureRef.current) {
      return
    }

    setStatus('stopping')
    try {
      if (mode === 'stop') {
        await captureRef.current.stop('user_stop')
      } else {
        await captureRef.current.cancel()
      }
      captureRef.current = null
      setStatus('idle')
    } catch (error) {
      captureRef.current = null
      setStatus('error')
      setFatalError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <main className="min-h-screen bg-background px-6 py-6 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-xl border border-border bg-card/80 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Mic VAD Harness</p>
              <h1 className="text-2xl font-semibold">Groq browser VAD live repro page</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                This page runs the real <code>startGroqBrowserVadCapture()</code> path with a local sink so you can inspect
                the second-utterance loss boundary: utterance 0 seals, then either post-seal frames stop entirely or they
                continue without reopening a second <code>speech_start</code>. Stop now matches the Epicenter reference:
                it destroys MicVAD and does not synthesize a trailing utterance.
              </p>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Recommended repro: say <code>Hello everyone.</code>, pause briefly, then say <code>hows it going?</code> and
                watch the post-seal summary row in the event log.
              </p>
              <p className="max-w-3xl text-sm text-muted-foreground">
                The form starts from the official MicVAD doc defaults: <code>0.3</code>, <code>0.25</code>, <code>1400</code>,
                <code>800</code>, <code>400</code>.
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background/70 px-4 py-3 font-mono text-xs text-muted-foreground">
              <div>Status: {status}</div>
              <div>Session: {sessionId ?? 'not started'}</div>
              <div>Events: {events.length}</div>
              <div>Utterances: {utterances.length}</div>
            </div>
          </div>
          {fatalError ? (
            <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
              {fatalError}
            </div>
          ) : null}
        </header>

        <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Controls</h2>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  disabled={status === 'starting' || status === 'listening' || status === 'stopping'}
                  onClick={() => {
                    void startListening()
                  }}
                >
                  Start listening
                </button>
                <button
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
                  disabled={status !== 'listening'}
                  onClick={() => {
                    void stopListening('stop')
                  }}
                >
                  Stop listening
                </button>
                <button
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium disabled:opacity-50"
                  disabled={status !== 'listening'}
                  onClick={() => {
                    void stopListening('cancel')
                  }}
                >
                  Cancel without flush
                </button>
                <button
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium"
                  onClick={() => {
                    setEvents([])
                    setUtterances([])
                    setFatalError('')
                  }}
                >
                  Clear log
                </button>
                <button
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium"
                  onClick={() => {
                    void refreshDevices()
                  }}
                >
                  Refresh devices
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Input Device</h2>
              <label className="mt-4 block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                Browser microphone
                <select
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={selectedDeviceId}
                  onChange={(event) => {
                    setSelectedDeviceId(event.target.value)
                  }}
                >
                  <option value="">System default</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">MicVAD Config</h2>
              <div className="mt-4 grid gap-3">
                {Object.entries(configDraft).map(([key, value]) => (
                  <label key={key} className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {key}
                    <input
                      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      inputMode="decimal"
                      value={value}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setConfigDraft((current) => ({
                          ...current,
                          [key]: nextValue
                        }))
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Utterances</h2>
              <div className="mt-4 space-y-3">
                {utterances.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No utterances captured yet.</p>
                ) : (
                  utterances.map((utterance) => (
                    <div key={`${utterance.utteranceIndex}-${utterance.endedAtEpochMs}`} className="rounded-lg border border-border bg-background/70 p-3 font-mono text-xs">
                      <div>utterance={utterance.utteranceIndex}</div>
                      <div>reason={utterance.reason}</div>
                      <div>durationMs={utterance.durationMs}</div>
                      <div>wavBytes={utterance.wavBytes}</div>
                      <div>endedAtEpochMs={utterance.endedAtEpochMs}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">Event Log</h2>
              <div className="mt-4 max-h-[70vh] overflow-auto rounded-lg border border-border bg-background/70">
                {events.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No VAD events yet.</p>
                ) : (
                  <ul className="divide-y divide-border font-mono text-xs">
                    {events.map((event, index) => (
                      <li key={`${event.type}-${event.atMs}-${index}`} className="flex items-start justify-between gap-4 px-4 py-3">
                        <span>{describeVadDebugEvent(event)}</span>
                        <span className="shrink-0 text-muted-foreground">{formatTimestamp(event.atMs)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  )
}

let harnessRoot: Root | null = null

export const startVadMicDebugHarness = (mountPoint: HTMLDivElement): void => {
  if (!harnessRoot) {
    harnessRoot = createRoot(mountPoint)
  }
  harnessRoot.render(<VadMicDebugHarness />)
}
