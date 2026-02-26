/*
Where: src/renderer/home-react.tsx
What: Redesigned Home page — recording orb as visual hero, waveform feedback, adaptive actions.
Why: The original 2×2 button grid created decision fatigue at the most critical interaction point.
     This revision promotes the Toggle command to a large, state-driven orb button (primary action),
     exposes Start/Stop/Cancel as small secondary ghost buttons below, and adds an animated
     waveform that confirms audio capture is active. The transform card remains but is visually
     subordinate — it's a secondary workflow.
*/

import type { CSSProperties } from 'react'
import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, RecordingCommand } from '../shared/ipc'
import { resolveRecordingBlockedMessage, resolveTransformBlockedMessage } from './blocked-control'
import { resolveHomeCommandStatus } from './home-status'

type StaggerStyle = CSSProperties & { '--delay': string; '--bar-i'?: string }

interface HomeReactProps {
  settings: Settings
  apiKeyStatus: ApiKeyStatusSnapshot
  lastTransformSummary: string
  pendingActionId: string | null
  hasCommandError: boolean
  isRecording: boolean
  onRunRecordingCommand: (command: RecordingCommand) => void
  onRunCompositeTransform: () => void
  onOpenSettings: () => void
}

const resolveCommandButtonState = (
  pendingActionId: string | null,
  actionId: string,
  blockedByPrereq: boolean,
  label: string,
  busyLabel: string
): { disabled: boolean; text: string; busy: boolean } => {
  const isBusy = pendingActionId !== null && pendingActionId === actionId
  const disabled = blockedByPrereq || (pendingActionId !== null && !isBusy)
  const text = isBusy && !blockedByPrereq ? busyLabel : label
  return { disabled, text, busy: isBusy && !blockedByPrereq }
}

// 12-bar waveform component — bars animate when active (recording).
// --bar-i drives per-bar animation delay via CSS custom property.
const WaveformBars = ({ active }: { active: boolean }) => (
  <div
    className={`waveform${active ? ' waveform--active' : ''}`}
    aria-hidden="true"
    title={active ? 'Recording audio' : 'Microphone idle'}
  >
    {Array.from({ length: 12 }, (_, i) => (
      <span
        key={i}
        style={{ '--bar-i': String(i) } as StaggerStyle}
      />
    ))}
  </div>
)

export const HomeReact = ({
  settings,
  apiKeyStatus,
  pendingActionId,
  hasCommandError,
  isRecording,
  onRunRecordingCommand,
  onRunCompositeTransform,
  onOpenSettings
}: HomeReactProps) => {
  const recordingBlocked = resolveRecordingBlockedMessage(settings, apiKeyStatus)
  const transformBlocked = resolveTransformBlockedMessage(settings, apiKeyStatus)
  const status = resolveHomeCommandStatus({ pendingActionId, hasCommandError, isRecording })

  // Primary orb: toggle recording (handles both start & stop in one press)
  const toggleState = resolveCommandButtonState(
    pendingActionId,
    'recording:toggleRecording',
    recordingBlocked !== null,
    isRecording ? 'Stop' : 'Start',
    isRecording ? 'Stopping…' : 'Starting…'
  )

  // Secondary actions: explicit start/stop + cancel
  const startState = resolveCommandButtonState(
    pendingActionId, 'recording:startRecording', recordingBlocked !== null, 'Start', 'Starting…'
  )
  const stopState = resolveCommandButtonState(
    pendingActionId, 'recording:stopRecording', recordingBlocked !== null, 'Stop', 'Stopping…'
  )
  const cancelState = resolveCommandButtonState(
    pendingActionId, 'recording:cancelRecording', recordingBlocked !== null, 'Cancel', 'Cancelling…'
  )

  // Transform button
  const transformButtonState = resolveCommandButtonState(
    pendingActionId,
    'transform:composite',
    transformBlocked !== null,
    'Transform Clipboard',
    'Transforming…'
  )

  // Orb icon and accessible label vary by recording state
  const orbIcon = status.cssClass === 'is-busy' ? '⟳' : isRecording ? '■' : '●'
  const orbAriaLabel = isRecording ? 'Stop recording' : 'Start recording (toggle)'

  return (
    <>
      {/* ── Recording Controls Card ─────────────────────────────── */}
      <article
        className="card controls"
        data-stagger=""
        style={{ '--delay': '100ms' } as StaggerStyle}
      >
        <div className="panel-head">
          <h2>Recording</h2>
          <span
            className={`status-dot ${status.cssClass}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status.label}
          </span>
        </div>

        {/* Blocked message with settings link */}
        {recordingBlocked ? (
          <>
            <p className="inline-error">{recordingBlocked.reason}</p>
            <p className="inline-next-step">{recordingBlocked.nextStep}</p>
            {recordingBlocked.deepLinkTarget ? (
              <button
                type="button"
                className="inline-link"
                onClick={() => { onOpenSettings() }}
              >
                Open Settings →
              </button>
            ) : null}
          </>
        ) : null}

        {/* ── Recording orb hero ── */}
        <div className="record-section">
          {/* Waveform: shown above the orb, animates when recording */}
          <WaveformBars active={isRecording} />

          {/* Orb wrap provides the pulse ring overlay */}
          <div className="record-orb-wrap">
            <div
              className={`record-orb-ring${isRecording ? ' record-orb-ring--recording' : ''}`}
              aria-hidden="true"
            />
            <button
              type="button"
              className={`btn-record-orb${isRecording ? ' is-recording' : ''}${status.cssClass === 'is-busy' ? ' is-busy' : ''}`}
              disabled={toggleState.disabled}
              aria-label={orbAriaLabel}
              onClick={() => { onRunRecordingCommand('toggleRecording') }}
            >
              <span className="orb-icon" aria-hidden="true">{orbIcon}</span>
              <span className="orb-label">{toggleState.text}</span>
            </button>
          </div>

          {/* Secondary action row — explicit start / stop / cancel */}
          <div className="record-secondary-actions">
            <button
              type="button"
              className="btn-ghost"
              disabled={startState.disabled}
              onClick={() => { onRunRecordingCommand('startRecording') }}
              title="Explicitly start recording"
            >
              {startState.text}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={stopState.disabled}
              onClick={() => { onRunRecordingCommand('stopRecording') }}
              title="Explicitly stop recording"
            >
              {stopState.text}
            </button>
            {/* Cancel only shown when recording is active — reduces clutter when idle */}
            {isRecording || cancelState.busy ? (
              <button
                type="button"
                className="btn-cancel"
                disabled={cancelState.disabled}
                onClick={() => { onRunRecordingCommand('cancelRecording') }}
                title="Cancel and discard current recording"
              >
                {cancelState.text}
              </button>
            ) : null}
          </div>
        </div>
      </article>

      {/* ── Transform Shortcut Card ─────────────────────────────── */}
      <article
        className="card controls"
        data-stagger=""
        style={{ '--delay': '160ms' } as StaggerStyle}
      >
        <div className="panel-head">
          <h2>Transform</h2>
        </div>
        <p className="muted">Run AI transformation on clipboard text</p>

        {transformBlocked ? (
          <>
            <p className="inline-error">{transformBlocked.reason}</p>
            <p className="inline-next-step">{transformBlocked.nextStep}</p>
            {transformBlocked.deepLinkTarget ? (
              <button
                type="button"
                className="inline-link"
                onClick={() => { onOpenSettings() }}
              >
                Open Settings →
              </button>
            ) : null}
          </>
        ) : null}

        <div className="button-grid single">
          <button
            className={`command-button${transformButtonState.busy ? ' is-busy' : ''}`}
            type="button"
            disabled={transformButtonState.disabled}
            onClick={() => { onRunCompositeTransform() }}
          >
            {transformButtonState.text}
          </button>
        </div>
      </article>
    </>
  )
}
