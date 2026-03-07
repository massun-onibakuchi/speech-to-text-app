<!--
Where: docs/decisions/2026-03-07-streaming-provider-posture-decision.md
What: Decision note for the first approved streaming provider posture and transport classification.
Why: Keep implementation, plan, and spec aligned while the streaming contract lands in code.
-->

# Decision: First Streaming Provider Posture

## Status
Accepted — March 7, 2026

## Context

The approved streaming plan separates the first shipping lane from longer-term transformed streaming work:
- the first streaming delivery is `stream_raw_dictation`
- current batch raw dictation and batch transformed text must remain intact
- the local baseline is `whisper.cpp` with Core ML acceleration
- the cloud baseline is Groq `whisper-large-v3-turbo`

The implementation contract needs one explicit provider posture now so PR-1 can lock the schema and validation rules without drifting later.

## Decision

The first streaming providers are:
- `local_whispercpp_coreml`
- `groq_whisper_large_v3_turbo`

The first transport classifications are:
- `local_whispercpp_coreml` => `native_stream`
- `groq_whisper_large_v3_turbo` => `rolling_upload`

The first streaming output mode allowed by the contract is:
- `stream_raw_dictation`

The contract must reject:
- `stream_transformed`
- provider and transport combinations outside the approved mapping
- `apiKeyRef` on `local_whispercpp_coreml`
- missing `apiKeyRef` on `groq_whisper_large_v3_turbo`

## Consequences

- PR-1 can add `processing.streaming.*` as a stable schema without committing to transformed streaming yet.
- Provider-manifest metadata must expose streaming transport separately from current batch capability.
- Groq streaming behavior is documented honestly as rolling upload, not native realtime.
- Local streaming is represented as a first-class provider even before the runtime adapter lands.

## Out of Scope

- Main-process streaming routing
- Streaming session lifecycle
- `stream_transformed` execution
- UI exposure for streaming settings
