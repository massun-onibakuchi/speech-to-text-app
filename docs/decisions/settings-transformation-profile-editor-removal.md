# Decision: Remove Transformation Profile Editor from Settings (Issue #195)

## Context

Before this change, the Settings panel contained a full transformation profile editor
(`SettingsTransformationReact`) inside the "LLM Transformation" section. This included:

- Default profile selector (`#settings-transform-default-preset`)
- Add Profile / Remove Profile / Run Selected Profile buttons
- Profile name input, model selector, system prompt, user prompt textareas
- Validation error display for preset fields

A parallel `ProfilesPanelReact` tab was already the primary home for profile management.
Having profile editing in two places created a confusing IA — users didn't know which
location was canonical, and save semantics differed (Settings form required "Save Settings"
while Profiles used per-preset inline Save).

## Decision

Remove the `SettingsTransformationReact` component and all Settings-level profile editor
wiring. The **Profiles tab** becomes the single source of truth for:

- Creating, renaming, editing prompts, and removing profiles
- Selecting the default profile
- Setting per-profile model

The **Settings LLM Transformation section** retains:
- Google (LLM) API key form (`SettingsApiKeysReact`)
- LLM base URL override (`SettingsEndpointOverridesReact`)

## Removed AppShellCallbacks

Five callbacks that were exclusively used by SettingsTransformationReact are removed:

| Removed | Reason |
|---------|--------|
| `onSelectDefaultPreset` | Profiles tab uses `onSelectDefaultPresetAndSave` |
| `onChangeDefaultPresetDraft` | Profiles uses inline draft state; no global draft |
| `onRunSelectedPreset` | "Run Selected Profile" was a Settings-only affordance |
| `onAddPreset` | Profiles tab uses `onAddPresetAndSave` |
| `onRemovePreset` | Profiles tab uses `onRemovePresetAndSave` |

Retained `...AndSave` variants are still wired to `ProfilesPanelReact`.

## Consequences

- **Positive**: Settings IA is simpler — no profile management, just output source, STT
  provider, LLM key, audio input, and shortcuts.
- **Positive**: Profile CRUD has a single, consistent save path (Profiles inline Save).
- **Negative**: "Run Selected Profile" shortcut from Settings is removed. Users can trigger
  transforms via keyboard shortcut or the Home panel.
- **E2E impact**: Tests referencing `#settings-preset-add`, `#settings-transform-default-preset`,
  `#settings-transform-preset-name`, `#settings-user-prompt` in the Settings tab are updated
  to use Profiles tab selectors (`#profiles-panel-add`, `#profile-edit-name`,
  `#profile-edit-user-prompt`, `[aria-label="Edit ... profile"]`).
- **Test files deleted**: `settings-transformation-react.tsx` and its test file are removed.
