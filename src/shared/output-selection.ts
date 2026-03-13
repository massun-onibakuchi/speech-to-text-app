// Where: Shared module (main + renderer).
// What: Helpers for capture/output destination selection and output-settings UI mapping.
// Why: #148 requires a single selected output text source for capture flows while
// preserving existing transcript/transformed output rules used by other paths.

import type { OutputRule, OutputSettings, OutputTextSource } from './domain'

/**
 * Settings UI uses a single destination matrix shared by the selected text source. To keep
 * transform shortcuts working, both transcript/transformed rules are synchronized.
 */
export const buildOutputSettingsFromSelection = (
  output: Readonly<OutputSettings>,
  selection: OutputTextSource,
  destinations: Readonly<OutputRule>
): OutputSettings => ({
  ...output,
  selectedTextSource: selection,
  transcript: { ...destinations },
  transformed: { ...destinations }
})

export const getSelectedOutputDestinations = (output: Readonly<OutputSettings>): Readonly<OutputRule> =>
  output.selectedTextSource === 'transformed' ? output.transformed : output.transcript
