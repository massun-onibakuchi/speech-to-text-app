<!--
Where: docs/research/issues-349-350-profile-default-autosave-and-api-key-delete-modal.md
What: Deep research dossier for GitHub issues #349 and #350 plus current delete-API-key modal behavior in Settings.
Why: Establish exact current behavior, root causes, and code-level constraints before any implementation work.
-->

# Research: Issues #349-#350 and Settings API Key Deletion Modal

## 1. Scope and issue snapshot

This document covers three behaviors in the current app:

1. Issue #349: unexpected default profile change when adding a profile.
2. Issue #350: profile editor auto-saves invalid/incomplete state instead of requiring explicit save with dirty-draft flow.
3. How delete API key modal works in Settings.

Issue status checked on **March 5, 2026 (UTC)** via GitHub CLI:
- #349 `OPEN`: https://github.com/massun-onibakuchi/speech-to-text-app/issues/349
- #350 `OPEN`: https://github.com/massun-onibakuchi/speech-to-text-app/issues/350

## 2. Architecture map (only the paths involved)

### 2.1 Profile settings/persistence path

- UI composition: `AppShell` wires Profiles tab callbacks to persisted mutation helpers.
  - `onSelectDefaultPreset` -> `onSelectDefaultPresetAndSave`
  - `onAddPreset` -> `onAddPresetAndSave`
  - `onRemovePreset` -> `onRemovePresetAndSave`
  - `onSavePresetDraft` -> explicit save path
  - Source: `src/renderer/app-shell-react.tsx:302-320`
- Mutation implementations live in `createSettingsMutations`.
  - Source: `src/renderer/settings-mutations.ts`
- Persist target is main-process `settings:set` IPC -> `SettingsService.setSettings(...)`.
  - Source: `src/main/ipc/register-handlers.ts:234-238`

### 2.2 Non-secret autosave path

- Debounced autosave (`450ms`) for non-API settings is orchestrated in `renderer-app.tsx`.
- Validation runs before scheduling; invalid candidates are not persisted.
- Sources:
  - `src/renderer/renderer-app.tsx:216-276`
  - `docs/decisions/settings-non-api-autosave.md`

### 2.3 API key settings path

- API key UI components:
  - STT providers (Groq/ElevenLabs): `src/renderer/settings-stt-provider-form-react.tsx`
  - Google LLM key: `src/renderer/settings-api-keys-react.tsx`
- API key save path is blur-triggered and explicit per key input.
- IPC contract has `setApiKey`, `getApiKeyStatus`, `testApiKeyConnection` but no delete API.
- Sources:
  - `src/shared/ipc.ts:54-90`
  - `src/preload/index.ts`
  - `src/main/ipc/register-handlers.ts:239-247`
  - `docs/decisions/api-key-blur-autosave.md`

## 3. Root cause: unexpected default profile change on add (#349)

## 3.1 Exact cause in mutation builder

`buildSettingsWithAddedPreset(...)` always assigns the new preset as default:
- `defaultPresetId: newPresetId`
- Source: `src/renderer/settings-mutations.ts:57-79`

So any add operation structurally means:
1. append preset
2. switch `defaultPresetId` to that appended preset

This is not an incidental side effect; it is the direct contract of the helper.

## 3.2 Why Profiles tab always persists that behavior

Profiles tab add button calls `onAddPreset`, which is wired to persisted helper `onAddPresetAndSave`:
- `AppShell`: `onAddPreset={async () => { await callbacks.onAddPresetAndSave() }}`
- Source: `src/renderer/app-shell-react.tsx:314-316`

The persisted helper `addTransformationPresetAndSave` uses `buildSettingsWithAddedPreset` and writes immediately through `setSettings`:
- Source: `src/renderer/settings-mutations.ts:403-420`

Result: adding profile immediately and persistently changes default profile.

## 3.3 Secondary UI coupling that reinforces the effect

Profiles panel auto-opens editor for whichever preset matches current `defaultPresetId` after count increase:
- Source: `src/renderer/profiles-panel-react.tsx:332-344`
- Inline comment explicitly states current assumption:
  - `addTransformationPreset() auto-sets defaultPresetId to the new preset's id.`

This means the UI presentation itself currently assumes "new profile becomes default".

## 3.4 Test suite currently codifies this behavior

Unit test asserts add selects new profile as default:
- `createSettingsMutations.addTransformationPreset` test expects `defaultPresetId` equals added preset id.
- Source: `src/renderer/settings-mutations.test.ts:535-560`

This confirms issue #349 is not a hidden regression; it is currently expected behavior in tests.

## 3.5 Deletion fallback behavior vs issue #349 requirement

When removing a preset:
- if removed preset was default, fallback becomes `remaining[0].id`
- if removed preset was not default, default remains unchanged
- Source: `src/renderer/settings-mutations.ts:81-108`

This already aligns with most of issue #349 fallback intent (top-listed fallback on default deletion). Missing part is user notification text/toast specifically for fallback assignment.

## 4. Root cause: auto-save invalid profile / missing dirty-draft navigation model (#350)

Issue #350 has two parts:
1. invalid data should never persist (already mostly enforced for profile edit saves)
2. editor should have full dirty-draft lifecycle and navigation guarding (not implemented)

## 4.1 What is already true today

### 4.1.1 Inline profile edit is explicit-save, not per-keystroke persistence

In Profiles panel:
- form field changes only mutate local React state `editDraft`
- persistence happens only in `handleSave` -> `onSavePresetDraft(...)`
- cancel drops local draft
- Source: `src/renderer/profiles-panel-react.tsx:329-380`

### 4.1.2 Invalid profile draft is blocked from persistence

`saveTransformationPresetDraft(...)` validates name/system/user prompt and returns early on errors without calling `setSettings`:
- Source: `src/renderer/settings-mutations.ts:219-260`
- Validation rules come from `validateTransformationPresetDraft(...)`:
  - name required
  - system prompt required
  - user prompt required and must include `{{text}}`
- Source: `src/renderer/settings-validation.ts:60-86`

Tests verify invalid non-default profile drafts do not persist:
- Source: `src/renderer/settings-mutations.test.ts` (`blocks invalid non-default profile drafts and does not persist`)

## 4.2 What is missing vs #350 acceptance criteria

### 4.2.1 Add/remove/default profile operations bypass draft workflow

These operations are immediate persistence operations (not draft-local):
- `setDefaultTransformationPresetAndSave(...)`
- `addTransformationPresetAndSave(...)`
- `removeTransformationPresetAndSave(...)`
- Source: `src/renderer/settings-mutations.ts:384-445`

So profile-management surface is hybrid:
- edit fields: draft + explicit save
- add/remove/default toggle: immediate commit

Issue #350 expects uniform explicit commit semantics for profile management, but current architecture uses mixed semantics.

### 4.2.2 No dirty-state modal for internal navigation

Repository-wide search finds no profile unsaved-change modal implementation in renderer tabs/routing paths.
- No dialog/modal component wired for profile draft dirty checks.
- Source evidence: `rg "Modal|modal|Dialog|dialog|unsaved|dirty" src/renderer` (no relevant implementation hits)

### 4.2.3 No browser close/reload dirty warning

No `beforeunload`/native dirty-warning path is wired in renderer code for profile drafts.

### 4.2.4 Autosave decision context can conflict with profile-editor expectations

Global non-secret autosave policy is accepted for settings fields:
- Source: `docs/decisions/settings-non-api-autosave.md`

Profiles editor currently has local-draft save semantics, but broader app architecture still favors autosave for many non-secret fields. Issue #350 asks for stronger explicit-save model for profile editing/navigation lifecycle than current global autosave posture.

## 4.3 Important nuance: "auto-saves invalid profile" in current code

Based on current implementation:
- invalid *edit draft* does not persist through `saveTransformationPresetDraft`.
- however, issue perception can still occur because add/remove/default mutate persisted profile state immediately, and add currently creates minimal preset scaffold with empty prompts/name pattern then persists immediately.

That immediate persisted scaffold behavior is likely the practical source of confusion even if strict invalid edit-save is blocked.

## 5. Delete API key modal in Settings: current behavior

## 5.1 Current answer

There is currently **no delete API key modal** implemented in renderer Settings.

## 5.2 Code-level evidence

### 5.2.1 UI components expose only masked input + blur-save

- `SettingsApiKeysReact` (Google): input only; no delete button/modal state.
  - Source: `src/renderer/settings-api-keys-react.tsx:21-84`
- `SettingsSttProviderFormReact` (Groq/ElevenLabs): same pattern.
  - Source: `src/renderer/settings-stt-provider-form-react.tsx:42-185`

### 5.2.2 Mutation layer blocks empty saves and has no delete method

`saveApiKey` rejects blank input (`Enter a key before saving.`) and returns.
- Source: `src/renderer/settings-mutations.ts:172-179`

No `deleteApiKey` mutation exists in renderer.

### 5.2.3 IPC contract has no explicit delete API

`IpcApi` includes:
- `setApiKey`
- `getApiKeyStatus`
- `testApiKeyConnection`

No dedicated `deleteApiKey` contract/channel exists.
- Source: `src/shared/ipc.ts:54-90`

Main IPC handlers similarly expose no delete channel.
- Source: `src/main/ipc/register-handlers.ts:239-247`

Important nuance:
- The existing `setApiKey(provider, apiKey: string)` path can technically clear a key if called with an empty string, because handlers forward the value directly and storage normalizes empty to absent on read.
- In practice, renderer mutation policy blocks this path for users (`saveApiKey` rejects blank input), and there is no explicit Settings delete action/modal.

## 5.3 What exists underneath (storage capability)

Main `SecretStore` can effectively represent key absence (`getApiKey` returns `null` for empty stored value), and writes accept arbitrary strings including empty.
- Source: `src/main/services/secret-store.ts:23-59`

So the blocker is product/API workflow shape, not low-level storage impossibility.

## 5.4 Relationship to existing research

There is already an API-key deletion research doc with deeper option analysis:
- `docs/research/api-key-deletion-settings-research.md`

This document agrees with that analysis and adds issue #349/#350 cross-context.

## 6. Current behavior vs issue acceptance criteria matrix

| Topic | Current behavior | Issue expectation | Gap status |
|---|---|---|---|
| Add profile changes default | Yes, always | Must not change default on create | Gap (direct root cause identified) |
| Edit profile persists only on Save | Yes | Explicit save only | Mostly aligned |
| Invalid profile draft persistence | Blocked on save validation | Must never persist invalid | Aligned for edit-save path |
| Delete non-default profile changes default | No | Must not change default | Aligned |
| Delete default profile fallback | First remaining profile | Top-listed fallback | Aligned structurally |
| Fallback notification toast on default deletion | Not explicit in mutation | Required by #349 | Gap |
| Dirty navigation modal (Save/Discard/Stay) | Not implemented | Required by #350 | Gap |
| Close/reload native unsaved warning | Not implemented | Required by #350 | Gap |
| Delete API key modal | Not implemented | User asked behavior; expected for delete flow | Gap |

## 7. Tests and docs that currently lock behavior

- Add-changes-default is explicitly tested.
  - `src/renderer/settings-mutations.test.ts:535-560`
- Profile mutation helpers are tested as immediate persistence for default/add/remove.
  - `src/renderer/settings-mutations.test.ts` (`persists default/add/remove profile actions immediately`)
- Profiles panel tests assert local draft + save/cancel interaction.
  - `src/renderer/profiles-panel-react.test.tsx`
- API key form tests assert no legacy explicit save/test controls and blur-save behavior.
  - `src/renderer/settings-api-keys-react.test.tsx`
  - `src/renderer/settings-stt-provider-form-react.test.tsx`

Implication: implementing #349/#350 or delete-modal behavior will require intentional test contract changes, not bugfix-only edits.

## 8. Integration risks to track when implementation starts

1. Preserving `SettingsSchema` invariants:
- `presets` min length 1
- `defaultPresetId` must reference existing preset
- Source: `src/shared/domain.ts:133-140`

2. Avoiding race between autosave generation and explicit profile mutations:
- explicit profile saves call `invalidatePendingAutosave()` before write.
- Source: `src/renderer/settings-mutations.ts` persisted profile helpers

3. Keeping pick-and-run semantics separate from default-profile persistence:
- `lastPickedPresetId` is focus memory, not default selector.
- remove/add/default changes must not accidentally alter this contract.

4. API key deletion UX should remain consistent with current security posture:
- masked-by-default fields
- no plaintext persistence
- per-provider save status/toast feedback model.

## 9. Key conclusions

1. Issue #349 root cause is deterministic and localized: add-profile helper sets `defaultPresetId` to new preset by design, and tests currently enforce that behavior.
2. Issue #350 is partly already addressed (explicit save + validation for edit drafts), but dirty-draft navigation lifecycle and close/reload protection are not implemented.
3. Delete API key modal currently does not exist in UI, and there is no explicit delete mutation/IPC contract; effective deletion is only implicit via `setApiKey('')`, which current renderer UX blocks.
4. Underlying storage can support delete semantics, so missing behavior is a workflow/API contract gap, not a persistence backend limitation.

## 10. Source index

Primary files reviewed:
- `src/renderer/profiles-panel-react.tsx`
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-validation.ts`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/profiles-panel-react.test.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/settings-stt-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.test.tsx`
- `src/renderer/settings-stt-provider-form-react.test.tsx`
- `src/shared/ipc.ts`
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/services/secret-store.ts`
- `src/shared/domain.ts`
- `docs/decisions/settings-non-api-autosave.md`
- `docs/decisions/api-key-blur-autosave.md`
- `docs/decisions/settings-transformation-profile-editor-removal.md`
- `docs/research/api-key-deletion-settings-research.md`
