/*
Where: src/renderer/external-settings-merge.ts
What: Merge policy for external main-process settings updates into dirty renderer state.
Why: Prevent menu-bar output changes and hotkey-driven preset-pointer updates from
     clobbering unrelated unsaved Settings edits in the renderer.
*/

import type { Settings } from '../shared/domain'

const stripSafeExternalFields = (settings: Settings): Settings => ({
  ...settings,
  output: {
    selectedTextSource: 'transformed',
    transcript: {
      copyToClipboard: false,
      pasteAtCursor: false
    },
    transformed: {
      copyToClipboard: false,
      pasteAtCursor: false
    }
  },
  transformation: {
    ...settings.transformation,
    defaultPresetId: '__external_sync__',
    lastPickedPresetId: '__external_sync__'
  }
})

export const canMergeExternalSettings = (
  previousPersisted: Readonly<Settings>,
  latestPersisted: Readonly<Settings>
): boolean =>
  JSON.stringify(stripSafeExternalFields(structuredClone(previousPersisted))) ===
  JSON.stringify(stripSafeExternalFields(structuredClone(latestPersisted)))

export const mergeExternalSettingsIntoLocalDraft = (
  previousPersisted: Readonly<Settings>,
  localDraft: Readonly<Settings>,
  latestPersisted: Readonly<Settings>
): Settings => {
  const merged: Settings = structuredClone(localDraft)

  if (JSON.stringify(previousPersisted.output) !== JSON.stringify(latestPersisted.output)) {
    merged.output = structuredClone(latestPersisted.output)
  }

  if (previousPersisted.transformation.defaultPresetId !== latestPersisted.transformation.defaultPresetId) {
    merged.transformation.defaultPresetId = latestPersisted.transformation.defaultPresetId
  }

  if (previousPersisted.transformation.lastPickedPresetId !== latestPersisted.transformation.lastPickedPresetId) {
    merged.transformation.lastPickedPresetId = latestPersisted.transformation.lastPickedPresetId
  }

  return merged
}
