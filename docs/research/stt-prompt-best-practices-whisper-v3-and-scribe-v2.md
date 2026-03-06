# Research: STT Prompt Best Practices for Whisper v3 and ElevenLabs Scribe v2

Date: March 6, 2026

## 1) Scope and key clarification

This document covers:
- Prompting best practices for STT with:
  - Groq-hosted `whisper-large-v3-turbo` (Whisper v3 family)
  - ElevenLabs `scribe_v2`
- How this codebase currently handles STT prompting-related inputs
- Bugs and unexpected usage found in current implementation

Important clarification:
- STT models here do **not** use chat-style `system` and `user` prompts as first-class API fields.
- They use provider-specific guidance fields:
  - Groq Whisper STT: `prompt` (style/context/spelling hint)
  - ElevenLabs Scribe v2: `keyterms` (bias terms) and optional decoding controls

Sources:
- Groq Speech-to-Text docs: https://console.groq.com/docs/speech-to-text
- Groq OpenAI compatibility notes: https://console.groq.com/docs/openai
- Groq Whisper Large v3 Turbo model page: https://console.groq.com/docs/model/whisper-large-v3-turbo
- ElevenLabs STT capability docs: https://elevenlabs.io/docs/overview/capabilities/speech-to-text
- ElevenLabs STT quickstart: https://elevenlabs.io/docs/eleven-api/guides/cookbooks/speech-to-text/quickstart
- ElevenLabs Python SDK reference (`speech_to_text.convert` params): https://raw.githubusercontent.com/elevenlabs/elevenlabs-python/main/reference.md

## 2) Provider behavior and what “prompting” means

## 2.1 Groq Whisper v3 (`whisper-large-v3-turbo`)

Per Groq STT docs, transcription supports `file/url`, `model`, `language`, `prompt`, `response_format`, `temperature`, and `timestamp_granularities`.

High-signal points:
- `prompt` is for style/context/spelling guidance and continuation context, not instruction-following like an LLM chat system prompt.
- `prompt` max is documented as 224 tokens.
- `language` hint improves latency/accuracy when known.
- Recommended transcription `temperature` baseline is `0`.
- `timestamp_granularities` requires `response_format=verbose_json`.
- Groq OpenAI-compat docs note STT does not support `vtt`/`srt` response values.

## 2.2 ElevenLabs `scribe_v2`

Per ElevenLabs docs/reference:
- Scribe v2 supports “textual cues,” “keyterm prompting,” diarization, audio-event tagging, entity detection, and smart language detection.
- API params in reference include `language_code`, `diarize`, `num_speakers`, `timestamps_granularity`, `temperature`, `seed`, and `keyterms`.
- `keyterms` constraints in SDK reference:
  - up to 100 terms,
  - each term < 50 chars,
  - each term at most 5 words (normalized).

Interpretation:
- For Scribe v2, “prompting” is primarily **lexical biasing** (`keyterms`) and decoder controls (`temperature`, `seed`) rather than free-form instruction prompting.

## 3) Best-practice prompting strategy (portable mental model)

Use three layers:
1. Audio-quality and segmentation discipline (highest impact).
2. Deterministic decoder settings (`language`, low/zero `temperature`) for consistency.
3. Minimal, targeted lexical context (`prompt` or `keyterms`) only where needed.

## 3.1 Whisper v3 best practices (Groq)

1. Keep `temperature=0` unless you have a concrete reason to increase diversity.
2. Set `language` explicitly for single-language audio to reduce confusion and latency.
3. Use `prompt` only for:
   - Proper nouns, product names, acronyms, domain spellings.
   - Continuation context across chunk boundaries.
   - Light style continuity (e.g., punctuation style).
4. Keep prompt concise; prioritize rare terms over prose.
5. Match prompt language to input language.
6. Do not treat prompt as policy/instruction engine (it is weak for behavioral constraints).
7. If you need timestamps, explicitly request `verbose_json` and granularities.

Practical Whisper prompt template:
- "Vocabulary/context: <term1>, <term2>, <abbr expansion>, <speaker names>."

## 3.2 Scribe v2 best practices (ElevenLabs)

1. Prefer `keyterms` over long free-form context text.
2. Curate keyterms to highly confusable domain items only (medications, SKUs, names, jargon).
3. Set `language_code` when language is known/stable; leave auto-detect for multilingual/unknown audio.
4. Enable `diarize` only when speaker attribution is needed (extra complexity/cost surface).
5. Use `tag_audio_events` only when event labels are product-relevant.
6. Keep `temperature` low for deterministic pipelines; optionally add `seed` for reproducibility attempts.
7. For multichannel audio, explicitly choose `use_multi_channel` behavior.

Practical Scribe keyterm template:
- `["AcmeCloud", "QPX-17", "J. Nakamura", "SLO", "MCP"]`

## 4) Mapping “system/user prompt” concept to STT safely

If your product UX currently thinks in `systemPrompt`/`userPrompt` terms, map as:
- STT `systemPrompt` equivalent: static domain context dictionary (project/team vocabulary).
- STT `userPrompt` equivalent: request-specific terms/session hints.

Then transform to provider-native fields:
- Groq Whisper: join both into one compact `prompt` string.
- Scribe v2: normalize/deduplicate into bounded `keyterms` array.

Do not pass generic instruction prose expecting strict compliance.

## 5) Codebase deep-dive: how STT prompt-related inputs are currently handled

## 5.1 Effective STT request payload today

Groq adapter currently sends:
- `model`, `file`, optional `language`, optional `temperature`.
- No `prompt`, no `response_format`, no `timestamp_granularities`.
- File: `src/main/services/transcription/groq-transcription-adapter.ts`

ElevenLabs adapter currently sends:
- `model_id`, `file`, optional `language_code`.
- No `keyterms`, no `temperature`, no diarization/timestamps/audio-event/entity flags.
- File: `src/main/services/transcription/elevenlabs-transcription-adapter.ts`

Pipeline path:
- Settings -> immutable capture snapshot -> transcription service -> provider adapter.
- Snapshot includes `outputLanguage` and `temperature` only for STT-related decoding.
- Files:
  - `src/main/core/command-router.ts`
  - `src/main/routing/capture-request-snapshot.ts`
  - `src/main/orchestrators/capture-pipeline.ts`

## 5.2 Where prompts exist in this app

Current `systemPrompt`/`userPrompt` fields are **LLM transformation-only**, not STT:
- Defined in transformation preset schema (`shared/domain.ts`).
- Used by transform pipeline / Gemini adapter path.
- Not wired to transcription adapters.

So, presently, STT has no prompt abstraction in settings or runtime inputs.

## 6) Bugs and unexpected usage findings

Severity levels:
- High: functionally blocks expected provider capability or causes misleading behavior.
- Medium: config drift / misleading contract / hidden no-op.
- Low: clarity or maintainability issue.

### Finding A (High): No STT prompt support despite provider capability

What:
- Groq supports `prompt` for STT; ElevenLabs supports `keyterms` for Scribe v2.
- App has no STT prompt/keyterm fields in settings, snapshot, adapter input, or UI.

Evidence:
- `TranscriptionInput` lacks `prompt`/`keyterms` fields: `src/main/services/transcription/types.ts`
- Groq adapter never appends `prompt`: `src/main/services/transcription/groq-transcription-adapter.ts`
- ElevenLabs adapter never appends `keyterms`: `src/main/services/transcription/elevenlabs-transcription-adapter.ts`

Impact:
- Domain-specific term accuracy is left on the table, especially names/jargon/SKU-heavy speech.

### Finding B (Medium): Persisted STT settings include fields that are currently no-op

What:
- `compressAudioBeforeTranscription`, `compressionPreset`, and `networkRetries` are present in schema/defaults.
- No runtime usage found in transcription pipeline/adapters.

Evidence:
- Declared in schema/defaults: `src/shared/domain.ts`.
- Runtime path only uses provider/model/language/temperature; no read-path for those three fields.

Impact:
- Silent configuration illusion; operators may think they are tuning behavior when they are not.

### Finding C (Medium): ElevenLabs temperature exists in provider API but is not wired

What:
- Capture snapshot carries `temperature` and pipeline forwards it to transcription service.
- ElevenLabs adapter ignores `input.temperature` entirely.

Evidence:
- Snapshot + pipeline forwarding in `command-router.ts` and `capture-pipeline.ts`.
- Adapter implementation omits any `temperature` form field: `src/main/services/transcription/elevenlabs-transcription-adapter.ts`.

Impact:
- Cross-provider inconsistency: same setting changes behavior on Groq but not ElevenLabs.

### Finding D (Low): STT form file header comments still mention removed base URL controls

What:
- Component header says STT provider form includes base URL.
- UI/tests confirm base URL controls are intentionally removed.

Evidence:
- Comment in `src/renderer/settings-stt-provider-form-react.tsx`.
- Test asserts no base URL controls rendered: `src/renderer/settings-stt-provider-form-react.test.tsx`.

Impact:
- Documentation drift for developers.

## 7) Practical prompt policy recommendation (for later implementation)

For Whisper (Groq):
- Add optional per-profile/per-provider `sttPrompt` text (short, capped).
- Auto-attach in adapter as `prompt`.
- Guardrails: token/length budget, strip empty/whitespace, locale alignment note.

For Scribe v2 (ElevenLabs):
- Add optional `sttKeyterms: string[]` with validator:
  - <=100 terms,
  - term length and word-count caps,
  - dedupe/case-normalization.
- Pass as `keyterms`.

Shared:
- Keep provider-agnostic UI language as "STT Context Hints" with provider-specific mapping.
- Preserve default behavior when hints are empty.

## 8) Risk notes

- Prompting/hints can bias toward wrong named entities if over-specified.
- Mixed-language audio can regress if `language`/`language_code` is forced incorrectly.
- Determinism expectations should be explicit: `seed` is best effort, not strict guarantee.

## 9) Codebase audit summary

Current repo state is robust for baseline STT, but it is intentionally minimal:
- Good: provider/model allowlists, preflight checks, immutable snapshots, clear adapter boundaries.
- Gaps: no STT lexical guidance path (`prompt`/`keyterms`), several persisted STT knobs are currently inert or provider-asymmetric.

This is the main reason users may ask for “system/user prompt best practices” and still be unable to apply them in-app today.
