<!--
Where: docs/research/profile-settings-feedback-message-research.md
What: Deep research document for the profile-settings feedback message behavior and why profile save/update messages appear in Settings.
Why: Support issue analysis and implementation planning for removing profile-change messages from Settings UI.
-->

# Research: Profile Settings Feedback Messages Showing in Settings Tab

## 1. Issue Summary

### Reported behavior
When a profile is updated (for example, saved from the Profiles tab), user-facing messages such as `Profile saved.` or profile-related errors can appear in the **Settings** tab.

### Requested goal
Remove profile-change feedback messages so they no longer appear on Settings after profile updates.

### Clarification from current implementation
There are two user-visible feedback channels:
1. Inline message: `state.settingsSaveMessage`, rendered near the top of `Shortcuts` and `Settings` tabs.
2. Toast notification: `state.toasts`, rendered globally in a bottom-right toast layer.

Profile mutations currently write to one or both channels, so profile actions can leak into tabs that are not profile-focused.
There is also an `addActivity(...)` hook invoked by some mutations, but in the current code it is a no-op in `renderer-app.tsx`, so it is not user-visible feedback.

---

## 2. Current Architecture (Message Flow)

## 2.1 State owner and sinks

In [`src/renderer/renderer-app.tsx`](../../src/renderer/renderer-app.tsx):
- `state.settingsSaveMessage` is global renderer state.
- `setSettingsSaveMessage(message)` updates that state and triggers rerender.
- `addToast(message, tone)` appends global toast items.

In [`src/renderer/app-shell-react.tsx`](../../src/renderer/app-shell-react.tsx):
- Inline message rendering condition:
  - active tab is `shortcuts` or `settings`
  - `settingsSaveMessage.length > 0`
- Toast layer is global and always rendered, regardless of active tab.

Result: a message produced by a profile operation can become visible later when the user is on `Settings`/`Shortcuts`.

## 2.2 Profile UI event entry points

In [`src/renderer/profiles-panel-react.tsx`](../../src/renderer/profiles-panel-react.tsx), profile actions call these callbacks:
- `onSavePresetDraft`
- `onSelectDefaultPreset` (wired to immediate-save variant)
- `onAddPreset`
- `onRemovePreset`

These callbacks are wired in [`src/renderer/renderer-app.tsx`](../../src/renderer/renderer-app.tsx) to settings mutation functions from [`src/renderer/settings-mutations.ts`](../../src/renderer/settings-mutations.ts).

---

## 3. Exact Message Emitters for Profile-Related Mutations

All below are in [`src/renderer/settings-mutations.ts`](../../src/renderer/settings-mutations.ts).

## 3.1 `saveTransformationPresetDraft(...)`

Branches and emitted feedback:
- Missing preset:
  - inline: `Selected profile is no longer available.`
  - toast: same message (`error`)
- Validation failure:
  - inline: `Fix the highlighted validation errors before saving.`
  - toast: `Profile validation failed. Fix highlighted fields.` (`error`)
- Success:
  - inline: `Profile saved.`
  - activity hook invoked: `Profile "<name>" saved.` (`success`) (currently not visible because `addActivity` is a no-op)
  - toast: `Profile saved.` (`success`)
- Persistence failure:
  - inline: `Failed to save profile: <message>`
  - toast: same message (`error`)

This is the primary source of the issue.

## 3.2 `setDefaultTransformationPresetAndSave(...)`

- Success: no inline message, no toast.
- Failure:
  - inline: `Failed to update default profile: <message>`
  - toast: same message (`error`)

## 3.3 `addTransformationPresetAndSave(...)`

- Success: no inline message, no toast.
- Failure:
  - inline: `Failed to add profile: <message>`
  - toast: same message (`error`)

## 3.4 `removeTransformationPresetAndSave(...)`

- Invalid removal (`<=1` profile):
  - inline: `At least one profile is required.` (or fallback text)
  - toast: same message (`error`)
- Save failure:
  - inline: `Failed to remove profile: <message>`
  - toast: same message (`error`)
- Success: no inline message, no toast.

---

## 4. Why Messages Show Up in Settings

Root cause is architectural coupling:
1. Profile actions write feedback into a global key (`settingsSaveMessage`).
2. Inline renderer for that key lives in `Shortcuts` and `Settings` tabs, not `Profiles`.
3. The value is sticky until overwritten/cleared.

So profile-originated feedback is not scoped to the profile surface and can appear in Settings later.

---

## 5. Existing Behavior Already Intentionally Suppressed

The codebase has already suppressed inline success in some settings flows:
- Autosave success sets `state.settingsSaveMessage = ''` and uses toast only.
- Tests in [`src/renderer/renderer-app.test.ts`](../../src/renderer/renderer-app.test.ts) explicitly assert:
  - autosave success should show toast
  - no inline success message should render.

Also, profile helper tests in [`src/renderer/settings-mutations.test.ts`](../../src/renderer/settings-mutations.test.ts) assert that default/add-save success paths do **not** call `setSettingsSaveMessage`.

This indicates existing direction: avoid inline success noise, especially outside the action context.

---

## 6. Test Coverage Relevant to This Issue

## 6.1 Present coverage

- `settings-mutations.test.ts` covers many profile branches and validates calls to `setSettingsSaveMessage` in some paths.
- `app-shell-react.test.tsx` validates inline message rendering rules (`shortcuts/settings` + non-empty message).
- `renderer-app.test.ts` validates autosave feedback policy (toast success, inline for failure).

## 6.2 Missing targeted coverage

No explicit integration-style test currently asserts:
- profile save success should not produce Settings inline message
- profile save errors should not surface as Settings inline message (if that is final requirement)
- profile feedback should be scoped to profiles/toasts only

Adding those tests will protect against regression.

---

## 7. Change Surface to Meet Requested Goal

## 7.1 Minimum required files

Likely edits:
- [`src/renderer/settings-mutations.ts`](../../src/renderer/settings-mutations.ts)
- [`src/renderer/settings-mutations.test.ts`](../../src/renderer/settings-mutations.test.ts)
- Potentially [`src/renderer/renderer-app.test.ts`](../../src/renderer/renderer-app.test.ts) for cross-tab behavior assertion.

`app-shell-react.tsx` likely does not need changes if the fix is “stop profile operations from writing `settingsSaveMessage`.”

## 7.2 Candidate implementation options

### Option A: Remove only profile success messages (narrow interpretation)
- Stop setting inline `Profile saved.`
- Keep inline errors.
- Keep profile toasts.

Pros: smallest change.
Cons: still allows profile error text to appear in Settings (does not fully satisfy “remove any messages” wording).

### Option B: Remove all profile-originated inline messages (recommended for issue text)
- In profile mutation methods, stop calling `setSettingsSaveMessage(...)`.
- Keep toasts (or optionally reduce toast surface if desired by product).

Pros: directly prevents profile feedback from appearing in Settings inline area.
Cons: inline-only consumers lose that channel (currently not profile-tab-scoped anyway).

### Option C: Scope inline messages by domain
- Replace single `settingsSaveMessage` with scoped fields (`profilesMessage`, `settingsMessage`, etc.).
- Render each only in its corresponding tab.

Pros: clean architecture.
Cons: larger refactor than needed for this issue.

---

## 8. Risk Analysis

1. Silent failure risk:
- If both inline and toast are removed for profile errors, user may lose failure visibility.
- Mitigation: keep error toast (or add profile-local inline errors).

2. Test fragility risk:
- Existing mutation unit tests assert specific message calls.
- Mitigation: update assertions to new intended policy and add issue-specific tests.

3. Behavioral consistency:
- Other settings flows still use `settingsSaveMessage` for validation/autosave failure.
- Mitigation: document policy explicitly:
  - Global shortcuts/settings validation/autosave failures can use inline.
  - Profile CRUD/save should avoid global inline messages.

---

## 9. Recommended Direction

Given issue wording (“remove any messages on profile setting change”), the most direct interpretation is:
- Remove profile-originated `setSettingsSaveMessage(...)` calls for both success and error paths.
- Keep toast feedback for failure/success unless product explicitly asks to suppress those too.

If product intent is stricter (“no message at all”), then also remove corresponding profile toasts and rely on form-level validation + visible model state changes.

---

## 10. Verification Checklist for the Fix

After implementation, validate:
1. Save profile success:
  - no `[data-settings-save-message]` profile text appears in `Settings` or `Shortcuts`.
2. Save profile failure:
  - no profile error inline text appears in `Settings`/`Shortcuts`.
  - expected failure feedback channel remains (toast or profile-local UI).
3. Default/add/remove profile actions:
  - unchanged success behavior (no inline message).
  - expected error signaling still present.
4. Autosave behavior remains unchanged:
  - success toast only
  - inline autosave failure still shown.

---

## 11. Confidence

High confidence on root cause and change surface. The message leakage is directly attributable to global `settingsSaveMessage` usage in profile mutation branches plus tab-specific rendering in `AppShell`.
