/*
Where: src/renderer/home-react.ts
What: React-rendered Home page panels with parity-focused selector/behavior contracts.
Why: Migrate Home rendering/actions to React while keeping existing command/state semantics.
*/

import { createElement, Fragment } from 'react'
import type { Settings } from '../shared/domain'
import type { ApiKeyStatusSnapshot, RecordingCommand } from '../shared/ipc'
import { resolveRecordingBlockedMessage, resolveTransformBlockedMessage } from './blocked-control'
import { resolveHomeCommandStatus } from './home-status'

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
  lastTransformSummary,
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

  const recordingButtons = recordingControls.map((control) => {
    const actionId = `recording:${control.command}`
    const state = resolveCommandButtonState(
      pendingActionId,
      actionId,
      recordingBlocked !== null,
      control.label,
      control.busyLabel
    )
    return createElement(
      'button',
      {
        key: control.command,
        className: `command-button${state.busy ? ' is-busy' : ''}`,
        type: 'button',
        disabled: state.disabled,
        'data-recording-command': control.command,
        'data-action-id': actionId,
        'data-label': control.label,
        'data-busy-label': control.busyLabel,
        'data-prereq-blocked': recordingBlocked !== null ? 'true' : 'false',
        onClick: () => {
          onRunRecordingCommand(control.command)
        }
      },
      state.text
    )
  })

  const transformButtonState = resolveCommandButtonState(
    pendingActionId,
    'transform:composite',
    transformBlocked !== null,
    'Run Composite Transform',
    'Transforming...'
  )

  return createElement(
    Fragment,
    null,
    createElement(
      'article',
      {
        className: 'card controls',
        'data-stagger': '',
        style: { '--delay': '100ms' } as any
      },
      createElement(
        'div',
        { className: 'panel-head' },
        createElement('h2', null, 'Recording Controls'),
        createElement(
          'span',
          {
            className: `status-dot ${status.cssClass}`,
            id: 'command-status-dot',
            role: 'status',
            'aria-live': 'polite',
            'aria-atomic': 'true'
          },
          status.label
        )
      ),
      createElement('p', { className: 'muted' }, 'Manual mode commands from v1 contract.'),
      recordingBlocked
        ? createElement(
            Fragment,
            null,
            createElement('p', { className: 'inline-error' }, recordingBlocked.reason),
            createElement('p', { className: 'inline-next-step' }, recordingBlocked.nextStep),
            recordingBlocked.deepLinkTarget
              ? createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'inline-link',
                    onClick: () => {
                      onOpenSettings()
                    }
                  },
                  'Open Settings'
                )
              : null
          )
        : null,
      createElement('div', { className: 'button-grid' }, ...recordingButtons)
    ),
    createElement(
      'article',
      {
        className: 'card controls',
        'data-stagger': '',
        style: { '--delay': '160ms' } as any
      },
      createElement('h2', null, 'Transform Shortcut'),
      createElement('p', { className: 'muted' }, 'Flow 5: pick-and-run transform on clipboard text in one action.'),
      createElement('p', { className: 'muted', id: 'transform-last-summary' }, lastTransformSummary),
      transformBlocked
        ? createElement(
            Fragment,
            null,
            createElement('p', { className: 'inline-error' }, transformBlocked.reason),
            createElement('p', { className: 'inline-next-step' }, transformBlocked.nextStep),
            transformBlocked.deepLinkTarget
              ? createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'inline-link',
                    onClick: () => {
                      onOpenSettings()
                    }
                  },
                  'Open Settings'
                )
              : null
          )
        : null,
      createElement(
        'div',
        { className: 'button-grid single' },
        createElement(
          'button',
          {
            id: 'run-composite-transform',
            className: `command-button${transformButtonState.busy ? ' is-busy' : ''}`,
            type: 'button',
            disabled: transformButtonState.disabled,
            'data-requires-transform-enabled': 'true',
            'data-requires-google-key': 'true',
            'data-action-id': 'transform:composite',
            'data-label': 'Run Composite Transform',
            'data-busy-label': 'Transforming...',
            'data-prereq-blocked': transformBlocked !== null ? 'true' : 'false',
            onClick: () => {
              onRunCompositeTransform()
            }
          },
          transformButtonState.text
        )
      )
    )
  )
}
