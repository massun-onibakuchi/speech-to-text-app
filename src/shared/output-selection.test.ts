// Where: src/shared/output-selection.test.ts
// What:  Unit tests for provider-aware output selection helpers.
// Why:   Ticket 2 derives effective output policy from the selected STT provider
//        and must keep renderer/main behavior aligned.

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from './domain'
import {
  LOCAL_STREAMING_OUTPUT_RULE,
  buildOutputSettingsFromSelection,
  getEffectiveOutputSettings,
  getEffectiveSelectedOutputDestinations,
  getOutputDestinationLockReason,
  isLocalOutputPolicyLocked
} from './output-selection'

describe('output-selection local provider policy', () => {
  it('forces paste-only effective destinations for the local provider', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = 'local_whisperlivekit'
    settings.transcription.model = 'voxtral-mini-4b-realtime-mlx'
    settings.output.selectedTextSource = 'transformed'
    settings.output.transformed = { copyToClipboard: true, pasteAtCursor: false }

    expect(isLocalOutputPolicyLocked(settings)).toBe(true)
    expect(getEffectiveSelectedOutputDestinations(settings)).toEqual(LOCAL_STREAMING_OUTPUT_RULE)
    expect(getEffectiveOutputSettings(settings).transcript).toEqual(LOCAL_STREAMING_OUTPUT_RULE)
    expect(getEffectiveOutputSettings(settings).transformed).toEqual(LOCAL_STREAMING_OUTPUT_RULE)
    expect(getOutputDestinationLockReason(settings)).toContain('pastes finalized text at the cursor')
  })

  it('keeps existing destination choices for cloud providers', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.output.selectedTextSource = 'transcript'
    settings.output.transcript = { copyToClipboard: false, pasteAtCursor: true }

    expect(isLocalOutputPolicyLocked(settings)).toBe(false)
    expect(getEffectiveSelectedOutputDestinations(settings)).toEqual({ copyToClipboard: false, pasteAtCursor: true })
    expect(getOutputDestinationLockReason(settings)).toBeNull()
  })

  it('persists forced paste-only destinations when local provider changes output source', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.transcription.provider = 'local_whisperlivekit'
    settings.transcription.model = 'voxtral-mini-4b-realtime-mlx'

    const nextOutput = buildOutputSettingsFromSelection(settings, 'transcript', {
      copyToClipboard: true,
      pasteAtCursor: false
    })

    expect(nextOutput.selectedTextSource).toBe('transcript')
    expect(nextOutput.transcript).toEqual(LOCAL_STREAMING_OUTPUT_RULE)
    expect(nextOutput.transformed).toEqual(LOCAL_STREAMING_OUTPUT_RULE)
  })
})
