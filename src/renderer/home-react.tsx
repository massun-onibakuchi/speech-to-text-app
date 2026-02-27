/*
 * Where: src/renderer/home-react.tsx
 * What: Recording controls panel — circular recording button, waveform, state display.
 * Why: STY-03 redesign: replaces legacy button-grid with the spec-compliant circular
 *      recording button for idle/recording/processing states and a live waveform strip.
 *
 * UX rationale (spec sections 6.1, 6.2, 7):
 *   • Circular size-20 target is large enough for reliable pointing regardless of motor precision.
 *   • Animate-ping outer ring + animate-pulse inner ring provide two layers of recording feedback
 *     without causing cognitive noise (both are background-layer, not foregrounded motion).
 *   • Processing state disables the button with opacity-60 + cursor-not-allowed — no ambiguous enabled state.
 *   • Cancel link uses hover:text-destructive to signal danger without a permanently alarming color.
 *   • Waveform bars transition-all duration-150 — fast enough to feel live, slow enough to read.
 */

import { useEffect, useRef, useState } from 'react'
import { Mic, Square, X } from 'lucide-react'
import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, RecordingCommand } from '../shared/ipc'
import { resolveRecordingBlockedMessage } from './blocked-control'
import { cn } from './lib/utils'

interface HomeReactProps {
  settings: Settings
  apiKeyStatus: ApiKeyStatusSnapshot
  pendingActionId: string | null
  hasCommandError: boolean
  isRecording: boolean
  onRunRecordingCommand: (command: RecordingCommand) => void
  onOpenSettings: () => void
}

// Sine-curve idle heights for 32 waveform bars per spec section 6.2
const IDLE_HEIGHTS = Array.from(
  { length: 32 },
  (_, i) => Math.round(Math.sin(i * 0.3) * 6 + 8)
)

// Format elapsed seconds as MM:SS for the recording timer
const formatTimer = (seconds: number): string => {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const HomeReact = ({
  settings,
  apiKeyStatus,
  pendingActionId,
  hasCommandError: _hasCommandError,
  isRecording,
  onRunRecordingCommand,
  onOpenSettings
}: HomeReactProps) => {
  const recordingBlocked = resolveRecordingBlockedMessage(settings, apiKeyStatus)

  // Determine recording state: idle | recording | processing
  // Processing = a pending action exists but not yet recording (e.g. toggling or cancelling)
  const isProcessing = pendingActionId !== null && !isRecording
  const isIdle = !isRecording && !isProcessing

  // Recording timer — counts up every second while isRecording is true
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (isRecording) {
      setElapsedSeconds(0)
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1)
      }, 1000)
    } else {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setElapsedSeconds(0)
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  // Waveform bar heights — idle = sine curve, recording = randomised per-frame
  const [barHeights, setBarHeights] = useState<number[]>(IDLE_HEIGHTS)
  const waveframeRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (isRecording) {
      waveframeRef.current = setInterval(() => {
        setBarHeights(
          Array.from({ length: 32 }, () => Math.round(Math.random() * 24 + 4))
        )
      }, 150)
    } else {
      if (waveframeRef.current !== null) {
        clearInterval(waveframeRef.current)
        waveframeRef.current = null
      }
      setBarHeights(IDLE_HEIGHTS)
    }
    return () => {
      if (waveframeRef.current !== null) {
        clearInterval(waveframeRef.current)
        waveframeRef.current = null
      }
    }
  }, [isRecording])

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Recording button area ──────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-8">

        {/* Blocked message — shown above the button when prereqs are missing */}
        {recordingBlocked && (
          <div className="text-center mb-2">
            <p className="text-xs text-destructive" role="alert">{recordingBlocked.reason}</p>
            {recordingBlocked.nextStep && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{recordingBlocked.nextStep}</p>
            )}
            {recordingBlocked.deepLinkTarget && (
              <button
                type="button"
                className="inline-link mt-2 text-[11px] text-primary hover:underline"
                onClick={() => { onOpenSettings() }}
              >
                Open Settings
              </button>
            )}
          </div>
        )}

        {/* Button + rings container */}
        <div className="relative flex items-center justify-center">
          {/* Outer ping ring — recording animation only per spec section 6.1 */}
          {isRecording && (
            <span
              className="absolute inset-0 rounded-full bg-recording/20 animate-ping"
              aria-hidden="true"
            />
          )}
          {/* Inner pulse ring — recording animation only */}
          {isRecording && (
            <span
              className="absolute -inset-3 rounded-full bg-recording/10 animate-pulse"
              aria-hidden="true"
            />
          )}

          {/* Main recording button */}
          <button
            type="button"
            aria-label={
              isRecording
                ? 'Stop recording'
                : isProcessing
                ? 'Processing, please wait'
                : 'Start recording'
            }
            disabled={isProcessing || (recordingBlocked !== null && isIdle)}
            onClick={() => { onRunRecordingCommand('toggleRecording') }}
            className={cn(
              'relative size-20 rounded-full flex items-center justify-center',
              'transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isRecording && 'bg-recording',
              isProcessing && 'bg-muted opacity-60 cursor-not-allowed',
              isIdle && !recordingBlocked && 'bg-primary',
              isIdle && recordingBlocked && 'bg-muted opacity-60 cursor-not-allowed'
            )}
          >
            {isRecording ? (
              <Square className="size-7 fill-current" aria-hidden="true" />
            ) : (
              <Mic className="size-7" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* State label / timer */}
        {isRecording ? (
          <div className="flex flex-col items-center gap-1">
            <span
              className="font-mono text-lg text-recording tabular-nums"
              role="timer"
              aria-live="polite"
              aria-label={`Recording time: ${formatTimer(elapsedSeconds)}`}
            >
              {formatTimer(elapsedSeconds)}
            </span>
          </div>
        ) : isProcessing ? (
          <span className="text-sm text-muted-foreground animate-pulse" role="status">
            Processing...
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {recordingBlocked ? recordingBlocked.reason.split('.')[0] : 'Click to record'}
          </span>
        )}

        {/* Cancel affordance — recording state only per spec section 6.1 */}
        {isRecording && (
          <button
            type="button"
            aria-label="Cancel recording"
            onClick={() => { onRunRecordingCommand('cancelRecording') }}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="size-3" aria-hidden="true" />
            Cancel
          </button>
        )}

        {/* Explicit Open Settings link when blocked — provides keyboard access per spec section 8 */}
        {!recordingBlocked && isIdle && (
          <button
            type="button"
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            onClick={() => { onOpenSettings() }}
            aria-label="Open settings panel"
          >
            Settings
          </button>
        )}
      </div>

      {/* ── Waveform strip ─────────────────────────────────────── */}
      <div
        className="h-16 bg-card/30 flex items-center justify-center gap-[3px] px-6"
        aria-hidden="true"
        role="presentation"
      >
        {barHeights.map((height, i) => (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-all duration-150',
              isRecording ? 'bg-recording/80' : 'bg-muted-foreground/20'
            )}
            style={{ height: `${height}px` }}
          />
        ))}
      </div>
    </div>
  )
}
