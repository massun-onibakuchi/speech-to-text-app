<!--
Where: docs/decisions/issue-406-user-dictionary-stt-hints.md
What: Decision record for issue #406 user dictionary STT-hint mapping and apply-stage behavior.
Why: Capture non-trivial architecture and product decisions so implementation and tests stay consistent.
-->

# Decision: Issue #406 User Dictionary as STT Recognition Hints

Date: 2026-03-06  
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/406

## Context

Issue #406 introduces a user dictionary (`key=value`) for speech correction.
There are two possible integration paths:
- treat dictionary as generic LLM/chat prompts, or
- map dictionary to provider-native STT recognition hint fields.

## Decision

Use provider-native STT hint fields for dictionary input:
- Groq Whisper-compatible path uses Whisper-native prompt semantics.
- ElevenLabs Scribe path uses Scribe-native keyterm semantics.

Do not route dictionary entries through generic LLM/chat `systemPrompt` or `userPrompt`.

Apply dictionary replacement only on transcript output, not transformed output.

## Rationale

- Provider-native fields preserve STT-specific recognition behavior and reduce ambiguity.
- Keeping dictionary out of LLM prompt channels avoids cross-layer coupling and unintended transformation behavior.
- Transcript-only replacement keeps correction deterministic and prevents double-mutation in transformed flows.

## Consequences

- STT adapter contracts/tests must include recognition-hint mapping assertions by provider.
- Dictionary UI/validation remains renderer-level, but mapping logic lives at STT adapter boundary in main/runtime paths.
- The same dictionary data can influence recognition quality and deterministic post-transcript correction.
