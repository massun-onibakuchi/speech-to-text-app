---
title: Redesign LLM provider settings into simple cloud and Ollama sections
description: Break the LLM settings redesign into small PR-sized tickets that simplify provider and model selection, preserve readiness behavior, and keep the rollout reviewable.
date: 2026-04-02
status: active
review_by: 2026-04-09
links:
  decision: "0005"
tags:
  - plan
  - llm
  - settings
  - ui
  - ollama
  - renderer
---

# Redesign LLM provider settings into simple cloud and Ollama sections

## Context

Research in `docs/research/007-llm-settings-readiness-and-provider-form-design.md` confirmed that the current `LLM Transformation` settings area feels more complex than the STT area for structural reasons, not because it lacks dropdown controls.

Today the section combines:

- a local cleanup toggle and Ollama readiness UI
- a provider dropdown with only one local option
- a model dropdown for curated Ollama models
- a disabled fake API key row for local models
- a separate Google Gemini API-key form for cloud transformation

The requested direction is:

- make LLM settings feel closer to the STT provider/model setup
- keep provider and model selection simple
- prefer dropdowns for provider/model choices
- make provider and model selection look and behave very similarly to the STT selectors
- allow dedicated sections for cloud subscription and Ollama

This plan keeps implementation reviewable by separating:

- information architecture changes
- cloud subsection framing
- Ollama cleanup form simplification
- readiness UX behavior changes
- final regression locking

## Planning principles

- One ticket maps to one PR.
- Each PR should stay small enough to review in one pass.
- Preserve existing cleanup and preset behavior unless the ticket explicitly changes it.
- Do not move transformation preset provider/model ownership into global Settings unless a later ADR chooses that deliberately.
- Reuse the STT selector pattern directly where possible instead of creating a visually distinct LLM-specific selector flow.
- Default model display text should equal the model label or id unless a deliberate curated display name is needed.
- If confidence drops below 80 for a ticket, pause before coding.

## Cleaner option considered

There are two broad implementation shapes:

1. One large PR that renames the section, rearranges cloud and local controls, rewrites the Ollama readiness UI, and rethinks provider ownership together.
2. Several narrow PRs that first clarify structure, then simplify the local section, then refine readiness behavior, and only then polish cloud presentation.

This plan chooses option 2.

Why it is cleaner:

- it isolates visual restructuring from behavioral gating
- it keeps the highest-risk part, readiness UX, out of the first UI refactor
- it avoids mixing transformation-preset architecture changes into the same review

Trade-off:

- temporary intermediate states will exist between PRs
- some copy may be refined more than once

That trade-off is acceptable because the user feedback is primarily about structure and clarity, and those are easier to improve safely in layers.

## Dependency graph

```text
LLM-001 -> LLM-002
LLM-001 -> LLM-004
LLM-002 -> LLM-003
LLM-003 -> LLM-005
LLM-004 -> LLM-005

LLM-003 also depends on the readiness-contract work already planned in docs/plans/002-local-cleanup-reliability-rollout.md and must not redefine the IPC shape independently.
LLM-004 can run in parallel with LLM-002 after LLM-001 lands.
LLM-005 should be the final merge because it validates the combined experience.
```

## Ticket summary

| ID | Title | Priority | Confidence | Depends on | Parallelizable |
| --- | --- | --- | --- | --- | --- |
| LLM-001 | Split the LLM settings area into explicit Cloud and Ollama sections | P0 | 93 | — | No |
| LLM-002 | Simplify the Ollama cleanup form to provider/model/status only | P0 | 88 | LLM-001 | No |
| LLM-003 | Tighten Ollama readiness UX and cleanup enablement rules | P1 | 82 | LLM-002 | No |
| LLM-004 | Present cloud subscription/auth as its own focused section | P1 | 81 | LLM-001 | Yes |
| LLM-005 | Add end-to-end regression coverage and docs alignment for the redesigned flow | P2 | 86 | LLM-003, LLM-004 | No |

## Parallelization and sequencing

Sequential work:

- `LLM-001` should land first because it establishes the new section boundaries without changing behavior.
- `LLM-004` can land next because it is independent of local readiness behavior and makes the cloud side intentional before Ollama-specific work starts.
- `LLM-002` should follow because it simplifies the Ollama section inside the new structure.
- `LLM-003` should wait for `LLM-002` so enablement and readiness changes target the final local-section shape.
- `LLM-005` should be last because it validates the combined experience.

Parallel work:

- `LLM-004` can proceed after `LLM-001` because the cloud section is structurally separate from Ollama readiness logic.

## Architecture guardrails

- Keep `settings.cleanup` as the source of truth for local cleanup.
- Keep transformation preset provider/model ownership in `settings.transformation.presets`.
- Do not create a fake global cloud model selector if the actual runtime still resolves model/provider per preset.
- Preserve the `getLocalCleanupStatus` IPC boundary as the readiness source for Ollama-specific UI.
- Preserve snapshot-based cleanup behavior in the capture pipeline.
- Prefer one small shared subsection wrapper or header pattern so Cloud and Ollama layouts do not drift into duplicated one-off section logic.
- Provider and model dropdowns in the LLM area should reuse the STT form's interaction pattern, spacing, trigger structure, and labeling style as closely as possible.
- Model option naming should stay literal by default. Example: `sorc/qwen3.5-instruct:0.8b` should display as `Sorc Qwen 3.5 Instruct 0.8B`, while most other models, including GPT-style ids, should display exactly their label text.

## Ticket details

## LLM-001 - Split the LLM settings area into explicit Cloud and Ollama sections

**Priority**: P0  
**Confidence**: 93  
**PR size target**: small

### Goal

Make the settings information architecture match the real product model by replacing one overloaded `LLM Transformation` block with clearly separated cloud and local subsections.

### Proposed approach

Refactor the settings layout only. Do not change cleanup behavior, cloud auth behavior, readiness logic, or explanatory copy beyond headings in this PR.

Preferred structure:

- overall section title becomes `LLM`
- subsection 1: cloud subscription or provider access
- subsection 2: local Ollama cleanup

This is cleaner than trying to make one mixed form look like STT because the current code already has two distinct ownership domains:

- local cleanup in `settings.cleanup`
- cloud transformation auth in the secret store plus preset-owned provider/model

### Files in scope

- `src/renderer/app-shell-react.tsx`
- `src/renderer/app-shell-react.test.tsx`
- `src/renderer/settings-llm-provider-form-react.tsx`
- `src/renderer/settings-api-keys-react.tsx`
- `specs/spec.md`

### Checklist

- [ ] Rename the top-level LLM section to match the new structure
- [ ] Introduce explicit Cloud and Ollama subsection headers
- [ ] Keep current controls working without behavior changes
- [ ] Adjust tests that assert section labels or ordering
- [ ] Update the spec if section naming or durable grouping changes

### Tasks

1. Update the settings layout in `app-shell-react.tsx`.
2. Add subsection headings only.
3. Re-run and update renderer tests that depend on labels or DOM grouping.
4. Update spec text if section taxonomy becomes durable behavior.

### Definition of Done

- The settings UI clearly separates cloud and Ollama concerns.
- No runtime or persistence behavior changes in this PR.
- Existing callbacks still flow through the same components.

### Trade-offs

- Pros: low-risk clarity win, better reviewability, stronger base for later tickets.
- Cons: the local form still contains some awkward details until `LLM-002`.

### Example snippet

```tsx
<section data-settings-section="llm">
  <SettingsSectionHeader icon={Cpu} title="LLM" />
  <section aria-labelledby="llm-cloud-heading">
    <h3 id="llm-cloud-heading">Cloud</h3>
    <SettingsApiKeysReact {...cloudProps} />
  </section>
  <section aria-labelledby="llm-ollama-heading">
    <h3 id="llm-ollama-heading">Ollama</h3>
    <SettingsLlmProviderFormReact {...ollamaProps} />
  </section>
</section>
```

## LLM-002 - Simplify the Ollama cleanup form to provider/model/status only

**Priority**: P0  
**Confidence**: 88  
**PR size target**: medium

### Goal

Make the Ollama cleanup subsection feel closer to the STT provider/model pattern by reducing it to the controls that matter:

- enable cleanup
- provider dropdown
- model dropdown
- readiness/status block

Provider and model controls in this ticket should intentionally mirror the STT section's selector pattern rather than introducing a new LLM-specific variant.

### Proposed approach

Refactor `SettingsLlmProviderFormReact` so the primary flow reads top to bottom:

1. cleanup enablement
2. provider selection
3. model selection
4. readiness state and recovery guidance

Remove the disabled fake API-key row for local models. Replace it with concise explanatory copy near the provider area if needed.

This is cleaner than keeping the fake auth row because local model setup is not an auth workflow. The STT analogy should come from simple ordering, not from reproducing every row literally.

Because this changes an accepted architecture decision, the PR must also update architecture records before merge. Do not treat that as follow-up.

Model option naming rule for this ticket:

- use curated display names only when they materially improve readability
- otherwise show the exact model label text
- `sorc/qwen3.5-instruct:0.8b` should render as `Sorc Qwen 3.5 Instruct 0.8B`
- most other local models should display exactly their label text

### Files in scope

- `src/renderer/settings-llm-provider-form-react.tsx`
- `src/renderer/settings-llm-provider-form-react.test.tsx`
- `src/renderer/styles.css`
- `docs/adr/0005-llm-settings-use-provider-form-shape.md` or a superseding ADR
- `specs/spec.md`

### Checklist

- [ ] Keep provider and model as dropdowns
- [ ] Make provider and model dropdowns visually and behaviorally align with the STT section
- [ ] Remove the disabled local API-key field
- [ ] Replace it with shorter explanatory copy only if necessary
- [ ] Make the readiness state read as a status panel rather than a stray warning paragraph
- [ ] Preserve current IPC fetch behavior and model-option logic
- [ ] Apply the model display-name rule consistently
- [ ] Write a superseding ADR or update architecture records before merge
- [ ] Update tests for the new structure

### Tasks

1. Reshape the component layout around provider, model, and status.
2. Reuse the STT selector pattern for provider and model controls.
3. Move or rewrite local-auth explanatory copy.
4. Normalize model display names, including `Sorc Qwen 3.5 Instruct 0.8B` for `sorc/qwen3.5-instruct:0.8b`.
5. Keep `Refresh` in the status area if it still exists at this stage.
6. Update ADR `0005` or add a superseding ADR that explains why the fake auth row is being removed.
7. Update component tests to assert the simplified structure and naming.
8. Update spec wording if the visible setup flow changes durably.

### Definition of Done

- The Ollama subsection no longer contains a fake API-key row.
- Provider and model selection remain dropdown-based.
- Provider and model selectors feel materially the same as the STT selectors.
- Readiness information is visually grouped with setup status.

### Trade-offs

- Pros: reduces visual noise, better matches local-runtime reality, easier to scan.
- Cons: departs from ADR `0005`'s literal provider-model-auth mimicry and may require either updating or superseding that decision.

### Example snippet

```tsx
<div className="space-y-3">
  <CleanupToggleCard ... />
  <ProviderSelect value={settings.cleanup.runtime} ... />
  <ModelSelect value={settings.cleanup.localModelId} ... />
  <StatusPanel
    kind={cleanupStatus.status.kind}
    message={cleanupStatus.status.message}
    onRefresh={() => void refreshCleanupStatus()}
  />
</div>
```

## LLM-003 - Tighten Ollama readiness UX and cleanup enablement rules

**Priority**: P1  
**Confidence**: 82  
**PR size target**: medium

### Goal

Make the simplified Ollama section honest about readiness by preventing obviously broken enablement paths and improving the setup-state messaging.

### Proposed approach

Build on the simplified local form from `LLM-002`.

Behavior target:

- disable or strongly gate cleanup enablement when Ollama is not ready
- keep selected-model-missing and no-supported-models states actionable
- give refresh obvious loading and completion feedback

This is cleaner than leaving readiness as passive warning text because the local section is fundamentally a setup flow, not a best-effort decorative option.

### Feasibility note

Confidence is 82, above the threshold, but this ticket has the highest product-coupling risk in the plan because it overlaps with the existing local-cleanup reliability rollout. This PR should consume the readiness contract from `docs/plans/002-local-cleanup-reliability-rollout.md` rather than redefining it. If that dependency is not settled, pause before coding.

### Files in scope

- `src/renderer/settings-llm-provider-form-react.tsx`
- `src/renderer/settings-llm-provider-form-react.test.tsx`
- `docs/plans/002-local-cleanup-reliability-rollout.md`
- `specs/spec.md`

### Checklist

- [ ] Define when cleanup may be enabled
- [ ] Add loading and completion feedback for readiness refresh
- [ ] Keep each readiness state actionable
- [ ] Reuse the existing readiness contract from the cleanup reliability work instead of changing IPC shape here
- [ ] Add tests for blocked and allowed enablement states
- [ ] Update the spec if cleanup gating becomes durable behavior

### Tasks

1. Derive `canEnableCleanup` from readiness state.
2. Disable or gate the switch for impossible states.
3. Add refresh loading state and visible completion feedback.
4. Ensure warnings remain specific for each readiness state.
5. Add renderer coverage for changed behavior.

### Definition of Done

- Users can understand whether Ollama is ready without trial and error.
- The cleanup switch no longer implies a working setup when one does not exist.
- Tests cover the supported readiness states and gating rules.

### Trade-offs

- Pros: more honest UX, fewer silent misconfiguration paths.
- Cons: behavior changes can surprise users who were previously allowed to pre-enable cleanup.

### Example snippet

```tsx
const canEnableCleanup =
  cleanupStatus.status.kind === 'ready' ||
  cleanupStatus.status.kind === 'selected_model_missing'

<Switch
  checked={settings.cleanup.enabled}
  disabled={!canEnableCleanup || isRefreshing}
  onCheckedChange={(checked) => onChangeCleanupSettings({ ...settings.cleanup, enabled: checked })}
/>
```

## LLM-004 - Present cloud subscription/auth as its own focused section

**Priority**: P1  
**Confidence**: 81  
**PR size target**: small

### Goal

Make the cloud subsection read as one focused setup task instead of a leftover field at the bottom of the old mixed LLM section.

### Proposed approach

Keep the current implementation boundaries:

- cloud auth stays in `SettingsApiKeysReact`
- transformation preset provider/model stays in the preset system

Improve only the presentation:

- clearer section title and explanatory copy
- provider-specific wording
- room for future provider expansion without pretending there is already a global cloud model selector

This is cleaner than inventing a fake cloud provider/model dropdown now, because that would misrepresent the current architecture.

To keep this ticket worthwhile as a standalone PR, extract a dedicated wrapper component for the cloud subsection instead of making this only a copy edit.

If a cloud provider or model selector is introduced later, it should follow the same naming rule: for most models, display text should match the exact label text. The same rule applies to GPT model ids unless a curated display name is explicitly justified.

### Feasibility note

Confidence is 81. The main risk is product-contract ambiguity, not implementation difficulty: users may still expect a provider/model dropdown on the cloud side. If product insists on that, scope will expand into preset ownership and likely needs a new ADR.

### Files in scope

- `src/renderer/settings-api-keys-react.tsx`
- `src/renderer/settings-api-keys-react.test.tsx`
- `src/renderer/settings-cloud-llm-access-react.tsx`
- `src/renderer/app-shell-react.tsx`
- `specs/spec.md`

### Checklist

- [ ] Rename the cloud subsection copy to fit current behavior
- [ ] Keep the API-key workflow intact
- [ ] Extract a dedicated cloud subsection wrapper component
- [ ] Make the UI future-compatible with additional cloud providers
- [ ] Update tests for changed labels or helper copy
- [ ] Update the spec if the subsection wording becomes durable behavior

### Tasks

1. Extract `SettingsCloudLlmAccessReact` as the focused cloud subsection wrapper.
2. Rewrite the subsection heading and helper text.
3. Clarify that provider/model for transformation are preset-owned, not globally selected here.
4. Adjust tests for the new component and copy.
5. Update spec wording if needed.

### Definition of Done

- The cloud subsection reads as intentional, not leftover.
- The UI no longer suggests that this area should behave exactly like the Ollama cleanup form.
- Tests cover the new labels and copy.

### Trade-offs

- Pros: preserves architecture, lowers confusion, avoids over-promising global controls.
- Cons: cloud setup will still be less STT-like than the local section until transformation provider ownership changes.

### Example snippet

```tsx
<section aria-labelledby="llm-cloud-heading">
  <h3 id="llm-cloud-heading">Cloud provider access</h3>
  <p className="text-xs text-muted-foreground">
    Cloud transformation providers are configured in presets. This section manages the subscription or API access they use.
  </p>
  <SettingsApiKeysReact {...props} />
</section>
```

## LLM-005 - Add end-to-end regression coverage and docs alignment for the redesigned flow

**Priority**: P2  
**Confidence**: 86  
**PR size target**: medium

### Goal

Lock the redesigned settings flow down with regression coverage and doc updates once the structure and readiness behavior have settled.

### Proposed approach

Use this PR to close gaps rather than introduce new UI ideas.

Coverage focus:

- section grouping and labels
- Ollama provider/model/status flow
- cleanup toggle behavior across readiness states
- cloud subsection wording and accessibility

This is cleaner than spreading final polish across earlier tickets because it keeps each earlier PR narrowly scoped to one change theme.

### Files in scope

- `src/renderer/app-shell-react.test.tsx`
- `src/renderer/settings-llm-provider-form-react.test.tsx`
- `src/renderer/settings-api-keys-react.test.tsx`
- `e2e/electron-ui.e2e.ts`

### Checklist

- [ ] Add at least one E2E assertion for the redesigned settings flow
- [ ] Clean up stale selectors or old mixed-section assumptions that remain after earlier PRs
- [ ] Verify no stale references to the old mixed LLM section remain

### Tasks

1. Audit earlier tickets for any stale selectors or old-section assumptions.
2. Add one targeted E2E path for the new LLM settings layout.
3. Remove or rename stale test selectors if needed.

### Definition of Done

- Final layout is covered by at least one E2E test.
- No stale references to the old structure remain in tests or selectors.
- Earlier ticket-level renderer tests still read clearly after the redesign lands.

### Trade-offs

- Pros: improves maintainability and guards the redesign against regressions.
- Cons: final test polish may touch multiple files, so this PR should avoid any fresh UI behavior changes.

### Example snippet

```ts
await expect(page.getByRole('heading', { name: 'LLM' })).toBeVisible()
await expect(page.getByRole('heading', { name: 'Ollama' })).toBeVisible()
await expect(page.getByRole('heading', { name: 'Cloud provider access' })).toBeVisible()
```

## Risks and compatibility notes

Backward compatibility:

- persisted `settings.cleanup` and secret-store data must remain valid
- tests and selectors tied to the old section title will break if not updated carefully

Forward compatibility:

- do not hardcode the cloud subsection so tightly that adding OpenAI or another provider becomes awkward
- do not bake "Ollama only" assumptions too deeply into generic labels if more local runtimes may be added later

Maintainability:

- avoid one-off UI copy embedded in many components
- keep readiness ownership in one place
- do not duplicate provider/model state between presets and cleanup settings
- standardize subsection framing so Cloud and Ollama do not drift into copy-pasted layout shells

## Recommended implementation order

1. `LLM-001`
2. `LLM-004`
3. `LLM-002`
4. `LLM-003`
5. `LLM-005`
