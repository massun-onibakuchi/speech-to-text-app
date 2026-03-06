<!--
Where: docs/plans/stt-prompt-backend-only-execution-plan.md
What: Backend-only execution plan for STT hint prompting support (Whisper v3 + Scribe v2) with strict no-backward-compatibility policy.
Why: Deliver clean architecture by removing legacy code and obsolete config paths instead of preserving compatibility.
Revision: v3 (user-directed: remove backward compatibility completely).
-->

# Execution Plan: STT Prompting Support (Backend Only, No Backward Compatibility)

Date: 2026-03-06  
Source research: `docs/research/stt-prompt-best-practices-whisper-v3-and-scribe-v2.md`

## Hard Policy

- No UI changes.
- One ticket = one PR.
- No backward compatibility shims.
- Remove legacy fields/code paths completely.
- Fail fast on incompatible persisted settings; do not auto-migrate.

## Priority-Ordered Tickets

| Priority | Ticket | PR | Why now |
|---|---|---|---|
| P0 | T1 - Replace STT config contract with hint-first schema | PR-1 | establish clean canonical schema first |
| P1 | T2 - Groq prompt mapping | PR-2 | highest STT hint impact |
| P1 | T3 - ElevenLabs keyterms mapping | PR-3 | provider-native lexical biasing |
| P2 | T4 - Temperature policy hard decision + implementation | PR-4 | remove provider ambiguity |
| P2 | T5 - Remove inert STT settings + dead references | PR-5 | eliminate legacy/no-op config surface |
| P3 | T6 - Docs/spec/manifest strict sync | PR-6 | keep contracts truthful and current |

---

## T1 - Replace STT Config Contract With Hint-First Schema (P0)

### Goal
Redefine STT settings schema to current intended model and reject old payload shapes.

### Approach
- Add `transcription.hints`.
- Remove legacy compatibility handling from settings load path.
- Keep strict validation behavior (invalid persisted settings fail startup).

### Scope files
- `src/shared/domain.ts`
- `src/main/services/settings-service.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/core/command-router.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/services/transcription/types.ts`
- tests:
  - `src/shared/domain.test.ts`
  - `src/main/services/settings-service.test.ts`
  - `src/main/core/command-router.test.ts`
  - `src/main/orchestrators/capture-pipeline.test.ts`
  - `src/main/routing/snapshot-immutability.test.ts`

### Trade-offs
- Pros: cleaner contract, less maintenance, fewer hidden paths.
- Cons: existing local settings files with old shape can fail until manually reset.

### Planned snippets
```ts
transcription: v.strictObject({
  provider: SttProviderSchema,
  model: SttModelSchema,
  outputLanguage: v.string(),
  temperature: v.number(),
  hints: v.strictObject({
    contextText: v.string(),
    dictionaryTerms: v.array(v.string())
  })
})
```

### Tasks
1. Implement strict schema with `hints` as canonical STT hint input.
2. Remove compatibility branching for old STT payload variants.
3. Thread hints through snapshot and transcription input.
4. Update tests/fixtures to new schema only.

### Checklist
- [ ] Legacy settings shape is not accepted.
- [ ] No compatibility transform code remains.
- [ ] Snapshot and pipeline carry hints.
- [ ] No renderer/UI files touched.

### Gates
- [ ] `pnpm vitest run src/shared/domain.test.ts`
- [ ] `pnpm vitest run src/main/services/settings-service.test.ts`
- [ ] `pnpm vitest run src/main/core/command-router.test.ts`
- [ ] `pnpm vitest run src/main/orchestrators/capture-pipeline.test.ts`
- [ ] `pnpm vitest run src/main/routing/snapshot-immutability.test.ts`

---

## T2 - Groq Prompt Mapping (P1)

### Goal
Map STT hints to Groq Whisper `prompt` with strict normalization and no fallback behavior.

### Approach
- Build normalized prompt from `contextText` + `dictionaryTerms`.
- Enforce cap aligned to Groq limit.
- Append `prompt` only when non-empty.

### Scope files
- `src/main/services/transcription/groq-transcription-adapter.ts`
- `src/main/services/transcription/stt-hints-policy.ts` (new)
- `src/main/services/transcription/stt-hints-normalizer.ts` (new)
- tests:
  - `src/main/services/transcription/groq-transcription-adapter.test.ts`
  - `src/main/services/transcription/stt-hints-normalizer.test.ts`

### Trade-offs
- Shared normalizer adds module count but prevents duplicated provider logic.

### Planned snippets
```ts
const parts: string[] = []
if (normalized.contextText) parts.push(normalized.contextText)
if (normalized.dictionaryTerms.length > 0) {
  parts.push(`Vocabulary: ${normalized.dictionaryTerms.join(', ')}`)
}
const prompt = capGroqPrompt(parts.join('\n'))
if (prompt) formData.append('prompt', prompt)
```

### Tasks
1. Implement canonical limits/constants.
2. Implement normalizer + Groq prompt builder.
3. Add adapter tests for empty/context-only/terms-only/both/capped behavior.

### Checklist
- [ ] `prompt` appears only when expected.
- [ ] Terms-only format is correct.
- [ ] No raw hint values logged.

### Gates
- [ ] `pnpm vitest run src/main/services/transcription/stt-hints-normalizer.test.ts`
- [ ] `pnpm vitest run src/main/services/transcription/groq-transcription-adapter.test.ts`

---

## T3 - ElevenLabs Keyterms Mapping (P1)

### Goal
Map `dictionaryTerms` to ElevenLabs `keyterms` with strict provider-limit enforcement.

### Approach
- Reuse normalizer.
- Enforce max items/chars/words limits.
- Keep `contextText` unsupported for ElevenLabs request payload.
- Implement exact wire format verified from current provider docs.

### Scope files
- `src/main/services/transcription/elevenlabs-transcription-adapter.ts`
- `src/main/services/transcription/stt-hints-policy.ts`
- `src/main/services/transcription/stt-hints-normalizer.ts`
- tests:
  - `src/main/services/transcription/elevenlabs-transcription-adapter.test.ts`
  - `src/main/services/transcription/stt-hints-normalizer.test.ts`

### Trade-offs
- Provider asymmetry remains explicit (`contextText` used by Groq, ignored by ElevenLabs).

### Planned snippets
```ts
const keyterms = buildElevenLabsKeyterms(input.sttHints)
for (const term of keyterms) {
  formData.append('keyterms', term)
}
```

### Tasks
1. Implement keyterms builder and caps.
2. Verify and lock multipart serialization from docs.
3. Add tests for caps and payload construction.
4. Add explicit test: `contextText` is ignored for ElevenLabs.

### Checklist
- [ ] Keyterms obey provider limits.
- [ ] Serialization matches official docs.
- [ ] No raw hint values logged.

### Gates
- [ ] `pnpm vitest run src/main/services/transcription/elevenlabs-transcription-adapter.test.ts`
- [ ] `pnpm vitest run src/main/services/transcription/stt-hints-normalizer.test.ts`

---

## T4 - Temperature Policy Hard Decision + Implementation (P2)

### Goal
Choose one permanent temperature behavior across providers and implement it with no compatibility toggles.

### Approach
- Document policy in ADR.
- Implement policy exactly; remove ambiguous behavior.

### Scope files
- `docs/decisions/stt-temperature-policy.md`
- `src/main/services/transcription/elevenlabs-transcription-adapter.ts`
- `src/main/services/transcription/elevenlabs-transcription-adapter.test.ts`

### Trade-offs
- Applying temperature to ElevenLabs may change outputs; ignoring it keeps asymmetry.
- Either choice must be explicit and test-locked.

### Planned snippets
```ts
if (typeof input.temperature === 'number') {
  formData.append('temperature', String(input.temperature))
}
```

### Tasks
1. Create ADR and pick final policy.
2. Implement chosen policy.
3. Add tests to prevent regression.

### Checklist
- [ ] Policy is explicit and final.
- [ ] Adapter behavior matches ADR.

### Gates
- [ ] `pnpm vitest run src/main/services/transcription/elevenlabs-transcription-adapter.test.ts`

---

## T5 - Remove Inert STT Settings + Dead References (P2)

### Goal
Delete no-op STT settings and all residual references.

### Approach
- Remove fields outright from schema/defaults/tests:
  - `compressAudioBeforeTranscription`
  - `compressionPreset`
  - `networkRetries`
- Remove dead code/tests/docs tied to those fields.

### Scope files
- `src/shared/domain.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/orchestrators/processing-orchestrator.ts`
- relevant tests and fixtures
- docs/spec references

### Trade-offs
- Cleaner contract with lower future confusion.
- Users with stale local settings may need manual reset (accepted by policy).

### Planned snippets
```ts
transcription: v.strictObject({
  provider: SttProviderSchema,
  model: SttModelSchema,
  outputLanguage: v.string(),
  temperature: v.number(),
  hints: SttHintsSchema
})
```

### Tasks
1. Remove inert fields from schema and defaults.
2. Remove all runtime references.
3. Update tests and fixtures.
4. Update docs/specs to remove mentions.

### Checklist
- [ ] Inert fields are fully removed.
- [ ] No dead references remain.
- [ ] Tests pass with strict new schema.

### Gates
- [ ] `rg -n "compressAudioBeforeTranscription|compressionPreset|networkRetries" src` returns no active references.
- [ ] `pnpm vitest run src/shared/domain.test.ts`
- [ ] impacted orchestrator tests pass.

---

## T6 - Docs/Spec/Manifest Strict Sync (P3)

### Goal
Align docs/contracts exactly with implemented backend behavior.

### Approach
- Sync research/spec/readme terminology to STT hints.
- Sync provider contract manifest and tests.
- Remove legacy wording about deprecated STT settings.

### Scope files
- `docs/research/stt-prompt-best-practices-whisper-v3-and-scribe-v2.md`
- `specs/spec.md`
- `readme.md`
- `contracts/provider-contract-manifest.json`
- `src/main/services/provider-contract-manifest.ts`
- `src/main/services/provider-contract-manifest.test.ts`

### Trade-offs
- Documentation becomes strict and less forgiving of outdated local assumptions.

### Planned snippets
```md
STT prompting uses provider-native hint fields (`prompt`, `keyterms`).
LLM `systemPrompt/userPrompt` remains transformation-only.
```

### Tasks
1. Update docs and spec language.
2. Sync manifest and verification timestamps.
3. Verify tests and remove contradictory wording.

### Checklist
- [ ] Docs match runtime behavior.
- [ ] Manifest matches code behavior.
- [ ] No legacy contradictory statements remain.

### Gates
- [ ] `pnpm vitest run src/main/services/provider-contract-manifest.test.ts`
- [ ] grep checks show no stale terminology where removed.

---

## Rollout

1. T1 contract replacement.
2. T2 Groq prompt.
3. T3 ElevenLabs keyterms.
4. T4 temperature finalization.
5. T5 inert-field deletion.
6. T6 docs/manifest final sync.

## Non-goals

- UI for STT hints.
- Any legacy payload compatibility layer.
- Additional STT providers.

