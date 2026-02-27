/*
Where: src/renderer/home-react.tsx
What: React-rendered Home page panels and command controls.
Why: Keep Home behavior React-native without legacy selector compatibility shims.
     Migrated from .ts (createElement) to .tsx (JSX) as part of the project-wide TSX migration.
*/

import type { CSSProperties } from 'react'
import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, RecordingCommand } from '../shared/ipc'
import { resolveRecordingBlockedMessage } from './blocked-control'
import { resolveHomeCommandStatus } from './home-status'

type StaggerStyle = CSSProperties & { '--delay': string }

interface HomeReactProps {
  settings: Settings
  apiKeyStatus: ApiKeyStatusSnapshot
  pendingActionId: string | null
  hasCommandError: boolean
  isRecording: boolean
  onRunRecordingCommand: (command: RecordingCommand) => void
  onOpenSettings: () => void
}

const TOGGLE_CONTROL: { command: RecordingCommand; label: string; busyLabel: string } = {
  command: 'toggleRecording',
  label: 'Toggle',
  busyLabel: 'Toggling...'
}

const CANCEL_CONTROL: { command: RecordingCommand; label: string; busyLabel: string } = {
  command: 'cancelRecording',
  label: 'Cancel',
  busyLabel: 'Cancelling...'
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

export const HomeReact = ({
  settings,
  apiKeyStatus,
  pendingActionId,
  hasCommandError,
  isRecording,
  onRunRecordingCommand,
  onOpenSettings
}: HomeReactProps) => {
  const recordingBlocked = resolveRecordingBlockedMessage(settings, apiKeyStatus)
  const status = resolveHomeCommandStatus({
    pendingActionId,
    hasCommandError,
    isRecording
  })
  const recordingControls = isRecording ? [TOGGLE_CONTROL, CANCEL_CONTROL] : [TOGGLE_CONTROL]

  return (
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
      <p className="muted">Use Toggle to start/stop. Cancel appears while recording.</p>
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
          const isBlockedByPrereq = control.command === 'toggleRecording' && recordingBlocked !== null
          const state = resolveCommandButtonState(
            pendingActionId,
            actionId,
            isBlockedByPrereq,
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
  )
}
