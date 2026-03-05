<!--
Where: docs/plans/settings-top-message-removal-plan.md
What: Step-by-step execution plan for removing top settings save messages and migrating that feedback to toast-only.
Why: Enforce zero back-compat for top save-message surfaces while preserving inline non-toast field-level text surfaces.
-->

# Execution Plan: Remove Top Settings Message Surfaces

Date: 2026-03-04  
Research: [docs/research/settings-top-save-message-surfaces.md](../research/settings-top-save-message-surfaces.md)

## Objective

- Remove top-of-page settings/shortcuts message surfaces completely.
- Replace all top-message feedback with toast feedback.
- Keep non-toast field-level text surfaces (inline validation and inline API key status).
- Remove legacy/back-compat code paths tied to top-message/manual-save contracts.

## Ticket Priority and Granularity

1. P1: Contract + decision docs alignment (small, low risk, clarifies implementation boundary).
2. P2: Migrate all top-message writers to toast first (prevents no-feedback regression).
3. P3: Remove top-message rendering and state/type plumbing.
4. P4: Remove legacy manual-save helper and stale components/tests (explicit no-backcompat cleanup).
5. P5: Regression matrix, risk checks, and docs sync.

## Ticket 1 (P1): Decision Contract and Doc Deconfliction

### Goal

Create one active contract for save feedback: toast-only global feedback, retained inline field-level text.

### Approach

- Add a new decision doc for top-message removal.
- Mark conflicting historical decisions as superseded/replaced.
- Include a mapping table from old top-message writes to toast equivalents.

### Scope Files

- `docs/decisions/settings-top-message-toast-only.md` (new)
- `docs/decisions/settings-save-feedback-react-state-slice.md` (superseded note)
- `docs/decisions/settings-save-react-ownership-slice.md` (scope update if needed)

### Trade-offs

- Pro: Removes ambiguity and prevents mixed contracts during implementation.
- Con: Slight doc overhead.

### Code Snippet

```ts
// Before
setSettingsSaveMessage('Fix the highlighted validation errors before autosave.')

// After
addToast('Fix the highlighted validation errors before autosave.', 'error')
```

### Checklist

- [ ] New decision doc defines retained vs removed text surfaces.
- [ ] Supersession note added to prior decision docs.
- [ ] Mapping covers autosave, profile actions, and legacy manual-save messages.

### Tasks

- [ ] Write context, decision, consequences, rollback notes.
- [ ] Add explicit non-goals: no changes to inline API key status or field validation rendering.
- [ ] Add cross-links among old/new decisions.

### Gates

- [ ] One unambiguous active save-feedback contract in docs.
- [ ] No unresolved decision conflict for reviewers.

## Ticket 2 (P2): Migrate Message Writers to Toast-Only (No UI Surface Removal Yet)

### Goal

Ensure every current `setSettingsSaveMessage` behavior path has toast feedback before removing UI/state surfaces.

### Approach

- Convert all writers in `settings-mutations.ts` to `addToast` and preserve severity.
- Convert `renderer-app.tsx` autosave branches to toast-only, including:
  - autosave validation failure (`Fix the highlighted validation errors before autosave.`)
  - autosave persistence failure (`Autosave failed: ... Reverted unsaved changes.`)
  - autosave success remains toast (`Settings autosaved.`)
- Keep inline field-level validation logic untouched.

### Scope Files

- `src/renderer/settings-mutations.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/renderer-app.test.ts`

### Trade-offs

- Pro: Prevents intermediate regression where top messages are removed before replacement feedback exists.
- Con: Temporary duplicated plumbing may exist until Ticket 3.

### Code Snippets

```ts
// settings-mutations.ts (planned)
// remove direct save-message writes, emit toast instead
addToast(`Failed to remove profile: ${message}`, 'error')
```

```ts
// renderer-app.tsx applyNonSecretAutosavePatch (planned)
if (Object.keys(validation.errors).length > 0) {
  invalidatePendingAutosave()
  addToast('Fix the highlighted validation errors before autosave.', 'error')
  rerenderShellFromState()
  return
}
```

### Checklist

- [ ] All existing top-message writer branches now emit equivalent toast messages.
- [ ] Autosave validation failure path emits toast.
- [ ] Tests assert toast behavior, not top-message state calls.

### Tasks

- [ ] Replace `setSettingsSaveMessage(...)` calls in mutation error/validation paths with `addToast(...)`.
- [ ] Update autosave validation/failure branches in renderer app to toast-only.
- [ ] Update mutation and renderer tests for toast-layer assertions (`#toast-layer`, tone selectors, or role-based status/alert).

### Gates

- [ ] Renderer tests cover toast emission for autosave success, autosave failure, autosave validation failure.
- [ ] Mutation tests cover toast emission for profile save/add/remove/default failure and validation paths.
- [ ] Tests verify toast tone parity (error/success) for each migrated path, not only message text.
- [ ] No behavior relies on reading top-message DOM.

## Ticket 3 (P3): Remove Top Message UI Surface and State Plumbing

### Goal

Delete the top message render surface and associated state/type plumbing from shell/orchestration.

### Approach

- Remove `<p data-settings-save-message ...>` block from `AppShell`.
- Remove `settingsSaveMessage` from:
  - `AppShellState`
  - renderer `state`
  - render callbacks/props wiring
- Keep toast overlay and field-level inline surfaces unchanged.

### Scope Files

- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/app-shell-react.test.tsx`
- `src/renderer/renderer-app.test.ts`

### Trade-offs

- Pro: Removes hidden-tab mismatch and simplifies shell state.
- Con: Requires broad test updates where selectors used `data-settings-save-message`.

### Code Snippet

```tsx
// Remove entirely:
<p data-settings-save-message aria-live="polite">...</p>
```

### Checklist

- [ ] No top-message markup remains.
- [ ] `AppShellState` no longer includes `settingsSaveMessage`.
- [ ] Tests no longer query `data-settings-save-message`.

### Tasks

- [ ] Remove top-message JSX and related types/props.
- [ ] Update shell and renderer integration tests to validate toast outcomes instead.
- [ ] Verify no stale references remain.

### Gates

- [ ] `rg "data-settings-save-message|settingsSaveMessage" src/renderer/app-shell-react.tsx src/renderer/renderer-app.tsx` returns 0 hits.
- [ ] App-shell and renderer-app test files pass.

## Ticket 4 (P4): Remove Legacy Helper/Component Paths (Explicit No-Backcompat)

### Goal

Remove legacy manual-save and save-message components/tests unconditionally unless a current UI entry point is intentionally reintroduced in the same PR.

### Approach

- Remove `saveSettingsFromState` from `settings-mutations.ts` and returned API.
- Remove `setSettingsSaveMessage` from mutation deps and creation wiring.
- Remove stale `SettingsSaveReact` component/tests if unused by current shell.
- Update tests to reflect pruned API surface.

### Scope Files

- `src/renderer/settings-mutations.ts`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-save-react.tsx` (remove if unreferenced)
- `src/renderer/settings-save-react.test.tsx` (remove if component removed)

### Trade-offs

- Pro: Eliminates dead code and old contracts, lowers maintenance risk.
- Con: Hard cutoff can break undocumented consumers; acceptable by requirement.

### Code Snippet

```ts
// createSettingsMutations return (planned)
return {
  saveApiKey,
  setDefaultTransformationPreset,
  setDefaultTransformationPresetAndSave,
  patchDefaultTransformationPresetDraft,
  saveTransformationPresetDraft,
  addTransformationPresetAndSave,
  removeTransformationPresetAndSave,
  applyTranscriptionProviderChange
}
```

### Checklist

- [ ] `saveSettingsFromState` removed.
- [ ] `setSettingsSaveMessage` removed from deps and caller wiring.
- [ ] `SettingsSaveReact` and its tests removed if dead.

### Tasks

- [ ] Delete helper implementation and tests tied to manual save path.
- [ ] Prune stale exports/types and update call sites.
- [ ] Run type-check to catch hidden references.

### Gates

- [ ] `rg "saveSettingsFromState|setSettingsSaveMessage|settings-save-message|SettingsSaveReact" src/renderer --glob "!**/*.test.*"` returns no production references.
- [ ] `createSettingsMutations` deps contract has no save-message callback.
- [ ] Type-check and targeted tests are green.

## Ticket 5 (P5): Verification, Risk Review, and Docs Sync

### Goal

Validate correctness end-to-end and document final feedback-surface behavior.

### Approach

- Run focused test matrix first, then full suite.
- Add/update docs with post-change “feedback surface matrix.”
- Run final sub-agent review on diff risk.

### Scope Files

- `src/renderer/app-shell-react.test.tsx`
- `src/renderer/renderer-app.test.ts`
- `src/renderer/settings-mutations.test.ts`
- `src/renderer/settings-stt-provider-form-react.test.tsx`
- `src/renderer/settings-api-keys-react.test.tsx`
- `src/renderer/settings-shortcut-editor-react.test.tsx`
- `src/renderer/profiles-panel-react.test.tsx`
- `docs/research/settings-top-save-message-surfaces.md` (post-change status section) or `docs/decisions/settings-top-message-toast-only.md`

### Trade-offs

- Pro: Catches regressions on inline non-toast surfaces that must remain.
- Con: Larger verification set.

### Code Snippet (test shape)

```ts
expect(mountPoint.querySelector('[data-settings-save-message]')).toBeNull()
expect(mountPoint.querySelector('#toast-layer')?.textContent ?? '').toContain('Autosave failed: Disk full')
```

### Checklist

- [ ] Focused tests pass.
- [ ] Full test suite passes.
- [ ] Docs updated with final retained/removed surface matrix.

### Tasks

- [ ] Run:
  - `pnpm vitest run src/renderer/app-shell-react.test.tsx`
  - `pnpm vitest run src/renderer/settings-mutations.test.ts`
  - `pnpm vitest run src/renderer/renderer-app.test.ts`
- [ ] Run inline-surface regression tests (API key status + field validation surfaces).
- [ ] Run `pnpm test`.
- [ ] Execute sub-agent review focused on behavioral regressions and dead code.

### Gates

- [ ] Toast-only global feedback behavior verified for migrated paths.
- [ ] Inline non-toast surfaces verified intact.
- [ ] No dead save-message/manual-save code remains.

## Risk Register

- Risk: Feedback gap if UI surface removal precedes writer migration.
  - Mitigation: enforce Ticket 2 before Ticket 3.
- Risk: Autosave validation message may be lost if not migrated.
  - Mitigation: explicit Ticket 2 task and test gate for validation-failure toast.
- Risk: Dead components and old decisions cause contract drift.
  - Mitigation: explicit cleanup in Ticket 4 + doc deconfliction in Ticket 1.
- Risk: Toast transience reduces persistence of failures.
  - Mitigation: preserve strong error copy + tone + regression checks in tests.

## Feasibility

- Feasibility: High.
- Recommended PR split:
  1. PR-A: Ticket 1-2 (contract + writer migration).
  2. PR-B: Ticket 3-5 (UI/state removal + legacy cleanup + verification).
