<!--
Where: docs/decisions/issue-392-prompt-template-safety-and-gemini-system-instruction.md
What: Decision record for issue #392 prompt-injection mitigations.
Why: Capture the chosen safety contract and provider request-shape changes with trade-offs.
-->

# Decision: Issue #392 Prompt Safety Baseline

Date: March 6, 2026
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/392

## Context

The transformation path previously mixed instruction text and transcript data with weak boundaries:
1. `userPrompt` accepted any `{{text}}` placement.
2. Gemini requests serialized system text as a plain `"System Prompt:\n..."` user part.
3. Unsafe persisted templates could flow into runtime transformation attempts.

## Decision

Adopt a strict baseline contract:
1. Require user prompt templates to include `{{text}}` exactly once.
2. Require that placeholder to be inside `<input_text>{{text}}</input_text>`.
3. Validate this contract in both renderer validation and shared schema validation.
4. Fail fast at runtime (preflight classification) if an unsafe template appears in an active profile.
5. Send Gemini system prompt via native `system_instruction` and keep task/input in `contents`.
6. Omit `system_instruction` when the trimmed system prompt is blank.

## Alternatives Considered

1. Keep placeholder-only validation (`{{text}}` required) without XML boundary enforcement.
   Rejected: does not provide a deterministic input-data boundary.
2. Keep system prompt inside user `contents` with textual labels.
   Rejected: weaker role semantics than Gemini-native `system_instruction`.
3. Auto-migrate unsafe prompts on load.
   Rejected: can silently mutate user intent; fail-fast behavior is safer and explicit.

## Consequences

Positive:
1. Stronger prompt-channel separation and less instruction ambiguity.
2. Unsafe templates are blocked consistently in UI, persistence, and runtime paths.
3. New profiles/defaults are safe by default.

Trade-offs:
1. Existing unsafe templates are now rejected and require user correction.
2. Prompt authoring becomes stricter (must use the XML boundary snippet).
