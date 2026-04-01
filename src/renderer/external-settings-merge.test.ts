/*
Where: src/renderer/external-settings-merge.test.ts
What: Unit tests for external settings merge policy helpers.
Why: Guard the safe-merge contract used when menu-bar changes arrive while the
     renderer still has unrelated unsaved settings edits.
*/

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/domain'
import { canMergeExternalSettings, mergeExternalSettingsIntoLocalDraft } from './external-settings-merge'

describe('external settings merge helpers', () => {
  it('allows safe merge when only output and preset pointers changed externally', () => {
    const previousPersisted = structuredClone(DEFAULT_SETTINGS)
    const latestPersisted = structuredClone(DEFAULT_SETTINGS)
    latestPersisted.output.selectedTextSource = 'transcript'
    latestPersisted.output.transcript.copyToClipboard = false
    latestPersisted.output.transcript.pasteAtCursor = true
    latestPersisted.output.transformed.copyToClipboard = false
    latestPersisted.output.transformed.pasteAtCursor = true
    latestPersisted.transformation.lastPickedPresetId = 'default'

    expect(canMergeExternalSettings(previousPersisted, latestPersisted)).toBe(true)
  })

  it('rejects safe merge when unrelated persisted fields changed externally', () => {
    const previousPersisted = structuredClone(DEFAULT_SETTINGS)
    const latestPersisted = structuredClone(DEFAULT_SETTINGS)
    latestPersisted.shortcuts.toggleRecording = 'Ctrl+Shift+1'

    expect(canMergeExternalSettings(previousPersisted, latestPersisted)).toBe(false)
  })

  it('merges output and preset pointers into the local dirty draft while preserving unrelated edits', () => {
    const localDraft = structuredClone(DEFAULT_SETTINGS)
    localDraft.shortcuts.toggleRecording = 'Ctrl+Shift+1'

    const latestPersisted = structuredClone(DEFAULT_SETTINGS)
    latestPersisted.output.selectedTextSource = 'transcript'
    latestPersisted.output.transcript.copyToClipboard = false
    latestPersisted.output.transcript.pasteAtCursor = true
    latestPersisted.output.transformed.copyToClipboard = false
    latestPersisted.output.transformed.pasteAtCursor = true
    latestPersisted.transformation.lastPickedPresetId = 'default'

    const merged = mergeExternalSettingsIntoLocalDraft(DEFAULT_SETTINGS, localDraft, latestPersisted)

    expect(merged.shortcuts.toggleRecording).toBe('Ctrl+Shift+1')
    expect(merged.output).toEqual(latestPersisted.output)
    expect(merged.transformation.defaultPresetId).toBe(latestPersisted.transformation.defaultPresetId)
    expect(merged.transformation.lastPickedPresetId).toBe(latestPersisted.transformation.lastPickedPresetId)
  })

  it('preserves local output edits when the external update only changes preset pointers', () => {
    const previousPersisted = structuredClone(DEFAULT_SETTINGS)
    const localDraft = structuredClone(DEFAULT_SETTINGS)
    localDraft.output = {
      selectedTextSource: 'transcript',
      transcript: {
        copyToClipboard: false,
        pasteAtCursor: true
      },
      transformed: {
        copyToClipboard: false,
        pasteAtCursor: true
      }
    }

    const latestPersisted = structuredClone(DEFAULT_SETTINGS)
    latestPersisted.transformation.lastPickedPresetId = 'default'

    const merged = mergeExternalSettingsIntoLocalDraft(previousPersisted, localDraft, latestPersisted)

    expect(merged.output).toEqual(localDraft.output)
    expect(merged.transformation.lastPickedPresetId).toBe('default')
  })
})
