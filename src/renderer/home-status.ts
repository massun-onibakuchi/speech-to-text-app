// Where: Renderer UI state helper.
// What: Resolves Home status badge label + class from current command state.
// Why: Keeps 4-state badge logic deterministic and testable.

export interface HomeCommandStatusInput {
  pendingActionId: string | null
  isRecording: boolean
  hasCommandError: boolean
}

export interface HomeCommandStatusView {
  label: 'Idle' | 'Recording' | 'Busy' | 'Error'
  cssClass: 'is-idle' | 'is-recording' | 'is-busy' | 'is-error'
}

export const resolveHomeCommandStatus = (input: HomeCommandStatusInput): HomeCommandStatusView => {
  if (input.pendingActionId !== null) {
    return { label: 'Busy', cssClass: 'is-busy' }
  }
  if (input.isRecording) {
    return { label: 'Recording', cssClass: 'is-recording' }
  }
  if (input.hasCommandError) {
    return { label: 'Error', cssClass: 'is-error' }
  }
  return { label: 'Idle', cssClass: 'is-idle' }
}
