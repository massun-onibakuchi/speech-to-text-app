// Where: Shared module (main + renderer).
// What: Helpers for capture/output destination selection and output-settings UI mapping.
// Why: #148 requires a single selected output text source for capture flows while
// preserving existing transcript/transformed output rules used by other paths.
// Ticket 2 also makes output destinations provider-aware for local streaming.

import type { OutputRule, OutputSettings, OutputTextSource, Settings } from './domain'
import { isLocalSttProvider } from './local-stt'

export const LOCAL_STREAMING_OUTPUT_RULE: Readonly<OutputRule> = Object.freeze({
  copyToClipboard: false,
  pasteAtCursor: true
})

export const isLocalOutputPolicyLocked = (settings: Pick<Settings, 'transcription'>): boolean =>
  isLocalSttProvider(settings.transcription.provider)

export const getOutputDestinationLockReason = (
  settings: Pick<Settings, 'transcription'>
): string | null =>
  isLocalOutputPolicyLocked(settings)
    ? 'Local streaming pastes finalized text at the cursor and does not expose clipboard-copy mode.'
    : null

/**
 * Settings UI uses a single destination matrix shared by the selected text source. To keep
 * transform shortcuts working, both transcript/transformed rules are synchronized.
 */
export const buildOutputSettingsFromSelection = (
  settings: Pick<Settings, 'transcription' | 'output'>,
  selection: OutputTextSource,
  destinations: Readonly<OutputRule>
): OutputSettings => ({
  ...settings.output,
  selectedTextSource: selection,
  transcript: isLocalOutputPolicyLocked(settings) ? { ...LOCAL_STREAMING_OUTPUT_RULE } : { ...destinations },
  transformed: isLocalOutputPolicyLocked(settings) ? { ...LOCAL_STREAMING_OUTPUT_RULE } : { ...destinations }
})

export const getSelectedOutputDestinations = (output: Readonly<OutputSettings>): Readonly<OutputRule> =>
  output.selectedTextSource === 'transformed' ? output.transformed : output.transcript

export const getEffectiveSelectedOutputDestinations = (
  settings: Pick<Settings, 'transcription' | 'output'>
): Readonly<OutputRule> =>
  isLocalOutputPolicyLocked(settings) ? LOCAL_STREAMING_OUTPUT_RULE : getSelectedOutputDestinations(settings.output)

export const getEffectiveOutputSettings = (
  settings: Pick<Settings, 'transcription' | 'output'>
): OutputSettings => ({
  ...settings.output,
  transcript: isLocalOutputPolicyLocked(settings)
    ? { ...LOCAL_STREAMING_OUTPUT_RULE }
    : { ...settings.output.transcript },
  transformed: isLocalOutputPolicyLocked(settings)
    ? { ...LOCAL_STREAMING_OUTPUT_RULE }
    : { ...settings.output.transformed }
})
