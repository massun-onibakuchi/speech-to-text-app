/*
Where: src/renderer/home-react.tsx
What: React-rendered Home page panels and command controls.
Why: Keep Home behavior React-native without legacy selector compatibility shims.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import type { CSSProperties } from 'react'
import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, RecordingCommand } from '../shared/ipc'
import { resolveRecordingBlockedMessage, resolveTransformBlockedMessage } from './blocked-control'
import { resolveHomeCommandStatus } from './home-status'

type StaggerStyle = CSSProperties & { '--delay': string }

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

const recordingControls: Array<{ command: RecordingCommand; label: string; busyLabel: string }> = [
  { command: 'startRecording', label: 'Start', busyLabel: 'Starting...' },
  { command: 'stopRecording', label: 'Stop', busyLabel: 'Stopping...' },
  { command: 'toggleRecording', label: 'Toggle', busyLabel: 'Toggling...' },
  { command: 'cancelRecording', label: 'Cancel', busyLabel: 'Cancelling...' }
]

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
  const status = resolveHomeCommandStatus({
    pendingActionId,
    hasCommandError,
    isRecording
  })

  const transformButtonState = resolveCommandButtonState(
    pendingActionId,
    'transform:composite',
    transformBlocked !== null,
    'Transform',
    'Transforming...'
  )

  return (
    <>
      <article
        className="card controls"
        data-stagger=""
        style={{ '--delay': '100ms' } as StaggerStyle}
      >
        <div className="panel-head">
          <h2>Recording Controls</h2>
          <span
            className={`status-dot ${status.cssClass}`}
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {status.label}
          </span>
        </div>
        <p className="muted">Manual mode commands from v1 contract.</p>
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
                Open Settings
              </button>
            ) : null}
          </>
        ) : null}
        <div className="button-grid">
          {recordingControls.map((control) => {
            const actionId = `recording:${control.command}`
            const state = resolveCommandButtonState(
              pendingActionId,
              actionId,
              recordingBlocked !== null,
              control.label,
              control.busyLabel
            )
            return (
              <button
                key={control.command}
                className={`command-button${state.busy ? ' is-busy' : ''}`}
                type="button"
                disabled={state.disabled}
                onClick={() => { onRunRecordingCommand(control.command) }}
              >
                {state.text}
              </button>
            )
          })}
        </div>
      </article>
      <article
        className="card controls"
        data-stagger=""
        style={{ '--delay': '160ms' } as StaggerStyle}
      >
        <h2>Transform Shortcut</h2>
        <p className="muted">Run transformation on clipboard text</p>
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
                Open Settings
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
