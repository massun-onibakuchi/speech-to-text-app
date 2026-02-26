// Where: Shared module (main + renderer).
// What: Helpers for output-source precedence and output-settings UI mapping.
// Why: #148 requires a single selected output text source for capture flows while
// preserving existing transcript/transformed output rules used by other paths.

import type { OutputRule, OutputSettings, OutputTextSource } from './domain'

export interface CaptureOutputSelection {
  source: OutputTextSource
  rule: Readonly<OutputRule>
}

export const hasAnyOutputDestination = (rule: Readonly<OutputRule>): boolean =>
  rule.copyToClipboard || rule.pasteAtCursor

/**
 * Derive the selected output text source for legacy settings that predate the explicit field.
 * Transformed wins to prevent duplicate transcript+transform delivery in capture flows.
 */
export const deriveLegacySelectedTextSource = (output: Pick<OutputSettings, 'transcript' | 'transformed'>): OutputTextSource =>
  hasAnyOutputDestination(output.transformed) ? 'transformed' : 'transcript'

/**
 * Capture-flow precedence for #148:
 * - Use the selected transformed output when a transformed result exists.
 * - Otherwise fall back to transcript output (preserves existing transform-failure fallback behavior).
 */
export const selectCaptureOutput = (
  output: Readonly<OutputSettings>,
  hasTransformedText: boolean
): CaptureOutputSelection => {
  if (output.selectedTextSource === 'transformed' && hasTransformedText) {
    return { source: 'transformed', rule: output.transformed }
  }
  return { source: 'transcript', rule: output.transcript }
}

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
