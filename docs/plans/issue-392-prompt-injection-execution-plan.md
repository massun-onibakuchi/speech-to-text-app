<!--
Where: docs/plans/issue-392-prompt-injection-execution-plan.md
What: Execution plan for issue #392 prompt-injection mitigation and prompt-template hardening.
Why: Break implementation into small, reviewable, priority-sorted tickets with explicit quality gates.
-->

# Issue #392 Execution Plan: Prompt Injection Mitigation

Date: March 6, 2026
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/392
Primary research input: `docs/research/issue-392-prompt-injection-and-prompt-design-research.md`

## 1. Objectives

1. Prevent transcript/input text from being interpreted as executable model instruction.
2. Improve prompt-channel correctness (system vs user payload responsibilities).
3. Keep rollout incremental, test-backed, and reversible.

## 2. Scope boundaries

In scope:
1. Transformation prompt construction/validation.
2. Settings/profile prompt validation UX.
3. Gemini adapter request shape for safer role usage.
4. Test coverage for prompt-injection regression scenarios.

Out of scope (this issue):
1. Enabling production web-search tool calls.
2. Broad model-provider expansion beyond existing Google Gemini transform path.

## 3. Work chunks (priority order)

### P0-T1: Strict User Prompt Template Safety (first implementation PR)

Priority: P0
Why first: immediate risk reduction with smallest architecture change.

Goal:
- Enforce a safer template contract so `{{text}}` is inserted only in explicit data boundaries.

Checklist:
- [ ] Add shared validator utility for user prompt template safety.
- [ ] Require exactly one `{{text}}` occurrence.
- [ ] Require approved XML boundary tags around placeholder (initially `<input_text>{{text}}</input_text>`).
- [ ] Wire validator in renderer form validation (`settings-validation.ts`).
- [ ] Wire validator in domain schema path (`src/shared/domain.ts`) to avoid bypass via persisted settings edits.
- [ ] Update profiles/settings inline guidance text to show required safe pattern.
- [ ] Add unit tests for valid/invalid templates in renderer validation and domain schema.
- [ ] Add tests for migration/rejection of unsafe legacy prompt variants.
- [ ] Define explicit runtime behavior for legacy unsafe prompts across app load/profile select/transform attempt/save flow.

Quality gate:
- `pnpm test src/renderer/settings-validation.test.ts src/shared/domain.test.ts src/renderer/profiles-panel-react.test.tsx` passes.
- Unsafe prompt templates are rejected in both renderer validation and schema validation with deterministic error text.
- Runtime legacy behavior is explicit and tested:
  - app load with unsafe persisted prompt fails fast (no silent mutation),
  - profile selection surfaces validation state,
  - transform attempt is blocked when active prompt is unsafe,
  - save flow requires user correction before persistence.
- Docs/help text is updated and matches validator contract exactly.
- Rollback gate: reverting this ticket restores previous template acceptance behavior with no startup breakage.

Code sketch:
```ts
// shared/prompt-template-safety.ts
export const INPUT_PLACEHOLDER = '{{text}}'

const SAFE_INPUT_TAG_PATTERN = /<input_text>\s*\{\{text\}\}\s*<\/input_text>/

export const validateSafeUserPromptTemplate = (value: string): string | null => {
  const matches = value.match(/\{\{text\}\}/g) ?? []
  if (matches.length !== 1) return 'User prompt must include {{text}} exactly once.'
  if (!SAFE_INPUT_TAG_PATTERN.test(value)) {
    return 'User prompt must wrap {{text}} in <input_text>...</input_text>.'
  }
  return null
}
```

PR expectation:
- Open PR after this ticket with title similar to: `feat: enforce safe user prompt template boundaries`.

### P0-T2: Use Provider-Native System Instruction Channel

Priority: P0
Why now: reduces instruction ambiguity by mapping system prompt to provider-native system channel.

Goal:
- Stop serializing system prompt as plain text block and send it via Gemini `system_instruction` field.

Checklist:
- [ ] Update Gemini adapter request body to use `system_instruction`.
- [ ] Keep user task+input in `contents`.
- [ ] Canonicalize blank system prompt behavior: omit `system_instruction` field when trimmed prompt is empty.
- [ ] Update adapter tests for payload shape.

Quality gate:
- Adapter tests verify system prompt is not sent as `"System Prompt:\n..."` part.
- Adapter tests verify omitted `system_instruction` for blank system prompt and present `system_instruction.parts[0].text` for non-blank prompt.
- Transformation output path remains compatible with existing response parsing.
- Rollback gate: reverting this ticket restores previous request payload shape and keeps transformation success path stable.

### P1-T3: Prompt Injection Regression Test Corpus

Priority: P1
Goal:
- Lock anti-injection behavior with deterministic tests.

Checklist:
- [ ] Add fixtures for benign, instruction-like, and multilingual injection-like transcripts.
- [ ] Add prompt-format/adapter-level tests verifying data-boundary behavior.
- [ ] Add at least one end-to-end transform pipeline test that confirms template guard blocks unsafe profile.
- [ ] Add adversarial execution tests where valid template contains malicious instruction-like transcript text.

Quality gate:
- Corpus tests pass and fail meaningfully when guard logic is weakened.
- Adversarial tests assert:
  - malicious transcript text is treated as data,
  - system instruction precedence remains intact,
  - output remains constrained to requested task format.

### P1-T4: Safer Default Prompt Profiles

Priority: P1
Goal:
- Make newly created profiles safe by default without silently rewriting existing user prompts.

Checklist:
- [ ] Set default user prompt template to XML-bounded pattern.
- [ ] Add system prompt default sentence indicating `<input_text>` is untrusted data.
- [ ] Confirm create/edit UX still supports explicit user customization.

Quality gate:
- New profile defaults pass validator.
- Existing profile edits require explicit user save before enforcement changes are applied.
- Docs/help text update merged with examples that match validator and default template behavior.

### P2-T6: Open Integration PR and Rollout Checklist

Priority: P2
Goal:
- Land reviewed ticket sequence with explicit release controls.

Checklist:
- [ ] Open integration PR linking #392 and child tickets.
- [ ] Include before/after payload examples.
- [ ] Include test evidence summary and known limitations.
- [ ] Include rollback plan (toggle/revert path).

Quality gate:
- PR template sections complete.
- Reviewer sign-off from both code owners and security-minded reviewer.
- Rollback instructions validated in staging notes before merge.

## 4. Ticket prerequisites matrix

1. `T1` hard dependency: none.
2. `T2` hard dependency: none. `T2` can run in parallel with `T1`, but merge is blocked until `T1` is merged so payload examples reference final template contract.
3. `T3` hard dependency: merged `T1` and `T2` (needs final validator + payload shape).
4. `T4` hard dependency: merged `T1` (must align defaults with validator).
5. `T6` hard dependency: merged `T1`, `T2`, `T3`, and `T4`.

## 5. Execution notes

1. Keep each PR small and single-purpose; avoid combining T1+T2 in one diff.
2. Add tests in same PR as each behavior change.
3. Use fail-fast validation in both renderer and shared schema to prevent bypass paths.
4. Do not silently auto-mutate unsafe user templates; fail with actionable guidance.
5. Web-search/tool-enablement work is explicitly excluded because web-search is disabled for this app.
