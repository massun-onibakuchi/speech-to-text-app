<!--
Where: docs/decisions/2026-03-07-whispercpp-wrapper-protocol-decision.md
What: Decision note for the local whisper.cpp runtime boundary used by PR-6.
Why: The app already owns renderer PCM capture and ordered streaming output, so
     the provider process boundary needs one explicit contract instead of ad hoc
     assumptions about the upstream microphone example.
-->

# Decision: `whisper.cpp` Wrapper Protocol

Date: 2026-03-07

## Context

- The approved plan makes local `whisper.cpp` + Core ML the first true streaming provider.
- The renderer already captures PCM frames and sends them to the main process.
- The main process already owns session lifecycle, ordered output, and failure publication.
- Upstream `whisper.cpp` documentation proves realtime microphone streaming and Core ML support, but its public stream example is microphone-oriented rather than an external renderer-frame IPC protocol.

## Decision

PR-6 uses an app-owned child-process contract named `speech-to-text-jsonl-v1`.

- The packaged runtime binary remains `whisper-stream`.
- The main process spawns it as a child process.
- Audio is sent over stdin as JSONL `push_audio_batch` messages with base64 PCM16 payloads.
- Stop is sent over stdin as a JSONL `stop` message.
- Provider output is read from stdout as JSONL `ready`, `final_segment`, and `error` messages.
- Stdout is reserved for protocol messages only. Any wrapper logs or diagnostics must go to stderr.
- Unexpected child exit is treated as fatal for the active streaming session.
- There is no automatic retry for mid-session child-process failure in PR-6.

## Why This Approach

- It preserves the current architecture boundary:
  - renderer owns microphone capture
  - main owns streaming session state
  - provider runtime owns decode/inference
- It avoids pretending the upstream microphone example already matches the app's external-frame transport model.
- It gives PR-6 a testable provider seam before hardware/manual validation is complete.

## Trade-offs

- Positive: explicit protocol, deterministic failure handling, and controller/provider separation.
- Positive: later wrappers can change internal `whisper.cpp` invocation details without changing renderer or controller code.
- Negative: the packaged runtime must implement a thin wrapper protocol rather than being treated as a drop-in upstream example binary.
- Negative: JSONL + base64 is not the final efficiency ceiling, but it is acceptable for establishing the provider seam safely.

## Rejected

- Rejected: invoke the upstream microphone example directly from the app and let it own capture.
  - Why: that would bypass the renderer-frame transport and break the approved session architecture.
- Rejected: fake provider readiness by keeping PR-6 at model/binary checks only.
  - Why: the controller/provider seam would remain untested until a later PR, which would increase integration risk.
