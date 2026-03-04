<!--
Where: docs/research/settings-top-save-message-surfaces.md
What: Investigation of the top-of-page settings save/status message behavior, including profile-related actions.
Why: Validate all non-toast user-visible text surfaces when settings are changed.
-->

# Research: Top Settings/Shortcuts Save Message Surface

Date: 2026-03-04

## Question
When settings are changed (including transformation profile changes), what text is shown at the top of the Settings page, and where does it come from?

## Primary Surface
The top message is rendered by `AppShell` from `state.settingsSaveMessage`:
- Render location: `src/renderer/app-shell-react.tsx` (`data-settings-save-message`)
- Visibility rule: shown only when active tab is `shortcuts` or `settings`
- Accessibility: `aria-live="polite"`

Implication: profile operations can set message text, but the message is not visible while user remains on the `profiles` tab.

## State Source of Truth
`settingsSaveMessage` lives in renderer app state:
- State field: `src/renderer/renderer-app.tsx`
- Setter: `setSettingsSaveMessage(message)` in same file
- Non-secret autosave path can also write this field directly for validation/failure cases.

## Operations That Update Top Message

### Non-secret autosave (output/audio/shortcuts/provider/model changes)
Source: `src/renderer/renderer-app.tsx`
- Triggers include output selection/destinations, shortcut drafts, transcription provider/model, and recording input settings (method/sample rate/device).
- Validation fail: `Fix the highlighted validation errors before autosave.`
- Autosave success: clears inline message (`''`) and uses toast `Settings autosaved.`
- Autosave failure: `Autosave failed: <detail>. Reverted unsaved changes.`

### Profile operations (Profiles tab actions)
Source: `src/renderer/settings-mutations.ts`
- Save profile validation fail: `Fix the highlighted validation errors before saving.`
- Save profile success: `Profile saved.`
- Save profile failure: `Failed to save profile: <detail>`
- Missing profile edge case: `Selected profile is no longer available.`
- Set default profile success: no top inline message is set (toast-only feedback if any)
- Set default profile failure: `Failed to update default profile: <detail>`
- Add profile success: no top inline message is set (toast-only feedback if any)
- Add profile failure: `Failed to add profile: <detail>`
- Remove profile success: no top inline message is set (toast-only feedback if any)
- Remove profile failure: `Failed to remove profile: <detail>`
- Remove last profile guard: top message `At least one profile is required.` plus error toast with the same text (the `Profile removal failed.` fallback exists but is not currently reached by helper output)

### Manual save flow (legacy helper still present)
Source: `src/renderer/settings-mutations.ts` (`saveSettingsFromState`)
- Missing default profile guard: `No transformation profile is available to save.`
- Validation fail: `Fix the highlighted validation errors before saving.`
- Success: `Settings saved.`
- Failure: `Failed to save settings: <detail>`

Note: current UI no longer renders a non-API "Save Settings" button in Settings/Shortcuts tab; this path remains as mutation logic.

## Other Non-Toast User Text Surfaces Affected by Setting Changes

### Inline API key status text (provider-specific)
- STT form: `src/renderer/settings-stt-provider-form-react.tsx`
- LLM form: `src/renderer/settings-api-keys-react.tsx`
- Values come from `state.apiKeySaveStatus[provider]` (e.g., `Validating key...`, `Saving key...`, `Saved.`, `Failed: ...`).

### Inline validation text near fields
- Shortcut/preset validation strings from `src/renderer/settings-validation.ts`
- Rendered in:
  - `src/renderer/settings-shortcut-editor-react.tsx`
  - `src/renderer/profiles-panel-react.tsx`

### Home blocked guidance and deep-link
- Resolver: `src/renderer/blocked-control.ts`
- Render: `src/renderer/home-react.tsx`
- Shows reasons/next steps like missing provider keys and `Open Settings` action.

### Status/footer metadata
- `src/renderer/status-bar-react.tsx` reflects updated settings (provider/model/device/default profile label).

### Settings output warning text
- `src/renderer/settings-output-react.tsx` warning appears when both destinations are disabled.

## Behavior Gap Observed
Profile actions call `setSettingsSaveMessage(...)`, but the top message surface is not visible on the `profiles` tab where profile actions happen. Users may only see toast feedback unless they switch to `settings` or `shortcuts`.

The same visibility mismatch also exists for the `audio-input` tab: validation/autosave can set `settingsSaveMessage`, but that inline message is hidden while remaining on `audio-input`.

This is likely the mismatch behind the reported "text displayed at the top of the Settings tab page when changes are made to your profile" behavior.

## Existing Test Coverage References
- Top message rendering conditions: `src/renderer/app-shell-react.test.tsx`
- Autosave top-message behavior: `src/renderer/renderer-app.test.ts`
- Mutation-level coverage for key save paths and API-key statuses (not exhaustive per-profile message assertions): `src/renderer/settings-mutations.test.ts`
