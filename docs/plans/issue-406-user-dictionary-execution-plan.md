<!--
Where: docs/plans/issue-406-user-dictionary-execution-plan.md
What: Priority-sorted execution plan for issue #406 user dictionary requirements, including STT hint mapping and transcript-only correction flow.
Why: Break delivery into small, reviewable tickets (1 ticket = 1 PR) with explicit scope, trade-offs, and quality gates.
-->

# Issue #406 Execution Plan: User Dictionary (`key=value`) + STT Hints

Date: 2026-03-06
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/406
Inputs reviewed:
- `specs/spec.md` (notably §4.7, §5.1, §10.1)
- `docs/decisions/issue-406-user-dictionary-stt-hints.md`
- `docs/ui-design-guidelines.md` (canonical path; note: requested `docs/ui-design-guideline.md` does not exist)
- STT adapter + adapter-agnostic runtime paths in `src/main/services/transcription/*`, `src/main/services/transcription-service.ts`, `src/main/core/command-router.ts`, `src/main/orchestrators/capture-pipeline.ts`, `src/shared/domain.ts`, renderer settings shell/mutations.

## Current Gap Snapshot (Codebase vs Requirements)

1. `Settings` schema has `transcription.hints.contextText/dictionaryTerms`, but no global `correction.dictionary.entries` (`key=value`) model.
2. STT provider mapping exists (`Groq prompt`, `ElevenLabs keyterms`) but receives generic `dictionaryTerms`, not dictionary-entry derived terms from global user dictionary.
3. No transcript replacement stage exists in capture pipeline (`key -> value`, exact match, case-insensitive).
4. No dedicated top-level `Dictionary` tab in `AppShell`; current tabs: `activity`, `profiles`, `shortcuts`, `audio-input`, `settings`.
5. No dictionary CRUD UI exists; therefore no add/update/remove validation rules for case-insensitive key uniqueness and `value <= 256`.
6. No tests currently cover dictionary CRUD, ordering, transcript-only apply stage, or mapping from dictionary entries into STT-native hint fields.

## Delivery Rules

1. One ticket maps to one PR.
2. Tickets are sorted by priority and dependency.
3. Do not start implementation until this plan is approved.
4. User request override: dictionary item delete must be immediate (no confirmation dialog).

## Replacement Semantics Contract (for T3)

1. Matching is case-insensitive using locale-insensitive lowercase normalization.
2. Matching is exact term/phrase, not arbitrary substring in larger alphanumeric tokens.
3. Overlap resolution is deterministic: longest key first; for equal length, alphabetical by normalized key then raw-key byte tie-break.
4. Replacement is left-to-right and repeatable for all non-overlapping matches.
5. Rules apply only to transcript text; transformed text is never post-corrected.

## Ticket Priority Order

| Priority | Ticket | PR | Dependency | Why now |
|---|---|---|---|---|
| P0 | T1 - Domain Contract + Compatibility Strategy | PR-1 | none | establish canonical schema and startup behavior first |
| P0 | T2 - Adapter-Agnostic Dictionary→STT Hint Derivation | PR-2 | T1 | connect source-of-truth dictionary to current adapter contracts |
| P0 | T3 - Transcript-Only Dictionary Replacement Stage | PR-3 | T1 | enforce core correction behavior deterministically |
| P1 | T4 - Dictionary Tab UX + CRUD (No Delete Confirmation) | PR-4 | T1 | deliver user-facing capability with required validation |
| P1 | T5 - IPC/Preload Contract and Settings Propagation | PR-5 | T1, T4 | lock cross-process shape and update propagation |
| P1 | T6 - Cross-Layer Regression Suite + Full Test Gate | PR-6 | T2, T3, T4, T5 | prevent behavior drift and verify integration |
| P2 | T7 - Docs/Decision/Spec Sync + Manual QA | PR-7 | T6 | keep contracts truthful and rollout-verifiable |

---

## T1 - Domain Contract + Compatibility Strategy (P0)

### Goal
Introduce canonical settings schema for user dictionary entries as global app-level data (`key=value`) with strict validation, deterministic ordering, and explicit legacy-payload handling policy.

### Approach
- Add `correction.dictionary.entries` to shared domain schema/defaults.
- Keep `transcription.hints.contextText` for non-dictionary context.
- Compatibility strategy (explicit decision in this ticket): either load-time migration/coercion or fail-fast with recovery UX; whichever is chosen must be test-locked and documented.

### Scope files
- `src/shared/domain.ts`
- `src/shared/domain.test.ts`
- `src/main/services/settings-service.ts`
- `src/main/services/settings-service.test.ts`
- `src/main/ipc/register-handlers.ts` (if startup-path messaging changes)
- `src/main/test-support/factories.ts`
- `src/main/test-support/settings-fixtures.ts`
- decision note under `docs/decisions/`

### Trade-offs
- Migration path: better user continuity, more code complexity.
- Fail-fast path: simpler runtime, but existing local settings may require reset.

### Code snippet (planned)
```ts
const DictionaryEntrySchema = v.strictObject({
  key: v.pipe(v.string(), v.minLength(1), v.maxLength(128)),
  value: v.pipe(v.string(), v.minLength(1), v.maxLength(256))
})

correction: v.strictObject({
  dictionary: v.strictObject({
    entries: v.array(DictionaryEntrySchema)
  })
})
```

### Tasks
1. Add dictionary schema/types/default values to `SettingsSchema` and `DEFAULT_SETTINGS`.
2. Add case-insensitive duplicate-key validation rule.
3. Add deterministic sort normalization rule (case-insensitive compare + raw-byte tie-break).
4. Decide and implement compatibility behavior for legacy persisted payloads.
5. Add tests for legacy payload behavior based on chosen strategy.

### Checklist
- [ ] `Settings` includes `correction.dictionary.entries`.
- [ ] `value` length max 256 enforced.
- [ ] duplicate keys rejected case-insensitively.
- [ ] deterministic ordering policy defined and tested.
- [ ] compatibility behavior is explicit, documented, and tested.

### Gates
- [ ] `pnpm vitest run src/shared/domain.test.ts`
- [ ] `pnpm vitest run src/main/services/settings-service.test.ts`

---

## T2 - Adapter-Agnostic Dictionary→STT Hint Derivation (P0)

### Goal
Derive provider-agnostic STT hint input from user dictionary entries, then preserve current provider-native adapter mappings (Groq prompt, ElevenLabs keyterms).

### Approach
- Add one normalization/derivation utility that converts `entries: {key,value}[]` into lexical hint terms (from keys).
- Keep adapter contracts agnostic (`sttHints`) but ensure values come from dictionary pipeline.
- Add provider-cap-aware shaping (dedup, truncation, deterministic limits) before request mapping.

### Scope files
- `src/main/core/command-router.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/services/transcription/types.ts`
- `src/main/services/transcription/stt-hints-normalizer.ts`
- `src/main/services/transcription/stt-hints-policy.ts`
- `src/main/services/transcription/groq-transcription-adapter.ts`
- `src/main/services/transcription/elevenlabs-transcription-adapter.ts`
- tests in `src/main/services/transcription/*.test.ts`, `src/main/core/command-router.test.ts`, `src/main/routing/snapshot-immutability.test.ts`

### Trade-offs
- Pros: keeps adapters provider-focused and avoids UI/adapter coupling.
- Cons: additional shaping logic must stay deterministic to avoid flaky behavior.

### Code snippet (planned)
```ts
const derivedHints = buildSttHintsFromDictionary(settings.correction.dictionary.entries)

sttHints: {
  contextText: settings.transcription.hints.contextText,
  dictionaryTerms: derivedHints.dictionaryTerms
}
```

### Tasks
1. Introduce dictionary-to-hints derivation utility with deterministic output ordering.
2. Apply dedup and provider-cap-aware truncation policy deterministically.
3. Thread derived hints into capture snapshots and transcription requests.
4. Verify adapters still map only to provider-native STT fields (no LLM prompt channel usage).

### Checklist
- [ ] dictionary entries reach STT adapters through `sttHints` path.
- [ ] Groq maps hints to `prompt` only.
- [ ] ElevenLabs maps hints to `keyterms` only.
- [ ] no usage of LLM `systemPrompt/userPrompt` in STT path.
- [ ] provider limit behavior is deterministic and test-covered.

### Gates
- [ ] `pnpm vitest run src/main/services/transcription/stt-hints-normalizer.test.ts`
- [ ] `pnpm vitest run src/main/services/transcription/groq-transcription-adapter.test.ts`
- [ ] `pnpm vitest run src/main/services/transcription/elevenlabs-transcription-adapter.test.ts`
- [ ] `pnpm vitest run src/main/core/command-router.test.ts src/main/routing/snapshot-immutability.test.ts`

---

## T3 - Transcript-Only Dictionary Replacement Stage (P0)

### Goal
Apply deterministic dictionary replacements to transcript output only (never to transformed output), with explicit boundary/overlap behavior.

### Approach
- Add correction stage in capture pipeline between transcription and transformation.
- Feed corrected transcript into transformation when selected output source is transformed.
- Never mutate transformed text with dictionary logic.

### Scope files
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/capture-pipeline.test.ts`
- `src/main/orchestrators/processing-orchestrator.ts` (legacy parity check)
- `src/main/orchestrators/processing-orchestrator.test.ts`
- new helper: `src/main/services/transcription/dictionary-replacement.ts` (+ tests)

### Trade-offs
- Pros: deterministic single-stage correction, aligns with decision doc and spec.
- Cons: boundary rules may not cover all language-specific tokenization edge cases in v1.

### Code snippet (planned)
```ts
const correctedTranscript = applyDictionaryReplacement(transcriptText, dictionaryEntries)
transcriptText = correctedTranscript

// transform stage consumes corrected transcript
text: transcriptText
```

### Tasks
1. Implement replacement helper with contract from "Replacement Semantics Contract".
2. Insert helper in capture pipeline after STT response and before optional transform.
3. Add tests for overlaps (`AB` vs `A`), phrase keys, punctuation boundaries, and repeated matches.
4. Add tests proving transformed text is not directly post-corrected.

### Checklist
- [ ] replacement applies to transcript path only.
- [ ] replacement follows deterministic boundary + overlap rules.
- [ ] transformed-output post-processing is untouched.
- [ ] history/output semantics remain unchanged except corrected transcript content.

### Gates
- [ ] `pnpm vitest run src/main/orchestrators/capture-pipeline.test.ts`
- [ ] `pnpm vitest run src/main/orchestrators/processing-orchestrator.test.ts`
- [ ] `pnpm vitest run src/main/services/transcription/dictionary-replacement.test.ts`

---

## T4 - Dictionary Tab UX + CRUD (No Delete Confirmation) (P1)

### Goal
Provide dedicated top-level `Dictionary` tab with add/update/remove flows for `key=value` entries and required validation, including immediate delete (no confirmation modal).

### Approach
- Extend workspace IA with `dictionary` tab in `AppShell`.
- Add focused dictionary panel component with compact tokenized UI per design guidelines.
- Delete is immediate and non-modal; include lightweight undo affordance via toast action.

### Scope files
- `src/renderer/app-shell-react.tsx`
- `src/renderer/renderer-app.tsx`
- `src/renderer/settings-mutations.ts`
- new: `src/renderer/dictionary-panel-react.tsx`
- tests: `src/renderer/app-shell-react.test.tsx`, new `src/renderer/dictionary-panel-react.test.tsx`, `src/renderer/renderer-app.test.ts`

### Trade-offs
- Pros: fast dictionary maintenance; satisfies explicit user request.
- Cons: accidental deletion risk is higher; mitigated by undo toast instead of confirmation modal.

### Code snippet (planned)
```tsx
<button
  type="button"
  aria-label={`Delete dictionary entry ${entry.key}`}
  onClick={() => onDeleteEntry(entry.key)}
>
  Delete
</button>
```

### Tasks
1. Add `dictionary` to app tab union and tab rail order.
2. Build dictionary list/editor UI (`key=value` input, inline validation, sorted display).
3. Define update interaction explicitly (inline row edit, not delete+re-add only).
4. Wire add/update/remove mutations to settings autosave flow.
5. Implement immediate delete without confirmation dialog and add undo toast action.

### Checklist
- [ ] dictionary tab appears as top-level workspace tab.
- [ ] add/update/remove works on persisted settings.
- [ ] duplicate-key and value-length validation errors are shown.
- [ ] delete is immediate, confirmation-free, and has undo toast.
- [ ] icon-only actions include `aria-label`; keyboard access is test-covered.

### Gates
- [ ] `pnpm vitest run src/renderer/app-shell-react.test.tsx`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`
- [ ] `pnpm vitest run src/renderer/dictionary-panel-react.test.tsx`

---

## T5 - IPC/Preload Contract and Settings Propagation (P1)

### Goal
Verify dictionary fields remain stable across shared types, preload bridge, and main/renderer settings update propagation.

### Approach
- Keep using existing `getSettings/setSettings` channels.
- Update shared types and bridge tests only where needed.
- Keep this PR narrow (contract + propagation only).

### Scope files
- `src/shared/ipc.ts` (if type surface changes)
- `src/preload/index.ts`
- `src/main/ipc/register-handlers.ts` and tests
- `src/renderer/ipc-listeners.ts`
- `src/main/test-support/ipc-round-trip.test.ts`

### Trade-offs
- Pros: small, reviewable PR to lock process boundaries.
- Cons: integration behavior testing is deferred to T6 by design.

### Code snippet (planned)
```ts
ipcMain.handle(IPC_CHANNELS.setSettings, (_event, nextSettings: Settings) => {
  const saved = svc.settingsService.setSettings(nextSettings)
  svc.hotkeyService.registerFromSettings()
  return saved
})
```

### Tasks
1. Ensure dictionary fields survive IPC round-trip unchanged.
2. Verify `settings:on-updated` propagation refreshes renderer state correctly.
3. Add focused tests for bridge typing and event wiring.

### Checklist
- [ ] dictionary payload survives IPC round-trip.
- [ ] renderer refresh path remains stable on external settings updates.
- [ ] no new IPC channel is added unless strictly required.

### Gates
- [ ] `pnpm vitest run src/main/ipc/register-handlers.test.ts src/main/test-support/ipc-round-trip.test.ts`
- [ ] `pnpm vitest run src/renderer/renderer-app.test.ts`

---

## T6 - Cross-Layer Regression Suite + Full Test Gate (P1)

### Goal
Lock end-to-end behavior for dictionary contract and guard against regressions across schema, pipeline, and renderer flows.

### Approach
- Add behavior-driven regression scenarios spanning settings load, capture pipeline, and UI CRUD.
- Add full-suite gate once targeted tests are green.

### Scope files
- selected tests across `src/shared`, `src/main`, `src/renderer`
- CI command docs if needed

### Trade-offs
- Pros: high confidence before merge.
- Cons: longer CI runtime.

### Code snippet (planned)
```bash
pnpm vitest run
```

### Tasks
1. Add regression matrix covering migration/fail-fast decision, replacement semantics, and no-confirm delete with undo.
2. Add performance sanity test for large dictionary replacement cost.
3. Run full test suite and attach results in PR.

### Checklist
- [ ] targeted regression tests pass.
- [ ] full `vitest` suite passes.
- [ ] core behavior matrix is documented in PR description.

### Gates
- [ ] `pnpm vitest run`

---

## T7 - Docs/Decision/Spec Sync + Manual QA (P2)

### Goal
Keep docs and decisions aligned with final implementation details and codify manual verification steps.

### Approach
- Update plan/spec/decision docs after behavior lands.
- Capture final edge-case behavior (ordering, no-confirm delete, transcript-only replacement semantics).

### Scope files
- `specs/spec.md`
- `docs/decisions/issue-406-user-dictionary-stt-hints.md`
- `docs/ui-design-guidelines.md` (tab IA update if changed)
- release/test notes

### Trade-offs
- Pros: prevents contract drift.
- Cons: doc churn; keep concise and exact.

### Code snippet (planned)
```md
Dictionary delete behavior: removing an entry is immediate and does not show a confirmation dialog.
```

### Tasks
1. Update spec sections to match shipped behavior.
2. Record compatibility strategy and replacement semantics decision in docs/decisions.
3. Add manual QA checklist for CRUD, ordering, STT mapping, replacement boundaries, and undo behavior.

### Checklist
- [ ] all relevant docs updated with exact current behavior.
- [ ] manual QA includes positive + negative cases.
- [ ] no stale UI IA references remain.

### Gates
- [ ] doc review pass
- [ ] manual verification sign-off in PR

---

## Risk Register (Mapped to Tickets)

1. Compatibility risk (schema change may break persisted settings).
Mitigation: explicit strategy in T1 + settings-load tests.
2. Replacement correctness risk (boundary/overlap ambiguity).
Mitigation: normative semantics block + T3 edge-case tests.
3. Accidental delete risk from no-confirm UX.
Mitigation: immediate delete + undo toast + T4 UI tests.
4. Provider-limit drift risk for hint payload shaping.
Mitigation: deterministic truncation policy in T2 + adapter tests.
5. Performance risk on large dictionary/transcript.
Mitigation: T6 sanity performance test.

## Proposed Implementation Order

1. T1
2. T2 and T3 (parallel after T1)
3. T4
4. T5
5. T6
6. T7
