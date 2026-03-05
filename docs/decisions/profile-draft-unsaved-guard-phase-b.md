# Decision: Profile Draft Unsaved-Change Guards (Issue #350 Phase B)

Where: `src/renderer/app-shell-react.tsx`, `src/renderer/profiles-panel-react.tsx`, `src/renderer/renderer-app.tsx`
What: Introduce explicit unsaved-change guard flow for profile drafts across tab navigation and window unload.
Why: Prevent accidental data loss when users edit profile drafts and navigate away or close/reload the renderer.

## Context

Phase A introduced explicit-save profile creation/edit drafts.
Phase B adds lifecycle guardrails required by issue #350 acceptance:
- navigation interception with Save/Discard/Stay,
- unload warning while profile draft is dirty.

## Decision

1. Keep profile draft editing state local to `ProfilesPanelReact`, but expose a minimal imperative guard API to parent shell:
   - `saveActiveDraft(): Promise<boolean>`
   - `discardActiveDraft(): void`
2. Publish profile draft guard state from panel to shell (`isDirty`, `hasDraft`, `isSaving`) via callback.
3. In `AppShell`, block navigation away from `profiles` while dirty and open a modal:
   - `Stay`: keep editing and close modal
   - `Discard`: clear draft and continue navigation
   - `Save and continue`: persist draft; continue only on success
4. In `renderer-app`, bind `beforeunload` only while a profile draft is dirty and remove binding once clean.

## Trade-offs

- Pros:
  - Guard logic is centralized at tab-routing level where navigation decisions occur.
  - Draft ownership stays in the profile editor, avoiding broad state reshaping.
  - `beforeunload` warning is tightly scoped to actual risk state.
- Cons:
  - Imperative ref contract adds coupling between shell and profiles panel.
  - Guard flow relies on profile panel callback/ref staying in sync.

## Legacy/Compatibility

No legacy fallback path is retained.
Old behavior (silent tab switch with dirty draft loss) is removed.

## Validation

- Added UI tests for guarded profile-tab navigation modal behavior.
- Added renderer integration test for `beforeunload` bind/unbind based on draft dirtiness.
