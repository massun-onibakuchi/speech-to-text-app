<!--
Where: docs/decisions/2026-03-08-whisper-startup-readiness-decision.md
What: Decision record for whisper.cpp startup readiness gating and child-process failure hardening.
Why: Capture why local streaming startup now waits for a real ready signal and why startup failures keep structured provider-specific detail.
-->

# Decision: Whisper Startup Must Reach Real Readiness Before Session Activation

Date: 2026-03-08
Ticket: `SSTP-07`
PR: `PR-7`

## Context

The local whisper adapter previously resolved `start()` immediately after spawning the child process. That let the controller publish `active` before the runtime had actually emitted its protocol `ready` signal. It also meant child-process startup failures could bypass the structured streaming failure path or get collapsed into a generic `provider_start_failed` code.

## Decision

Local whisper startup now waits for a real runtime ready signal and preserves structured startup failure details.

- `ChildProcessStreamClient` exposes process `error` events
- `WhisperCppStreamingAdapter.start()` waits for a protocol `ready` event before resolving
- startup waits are bounded by a dedicated ready timeout
- startup failures reject with structured provider codes that the controller preserves during `starting -> failed`

## Rationale

- A streaming session should not be `active` until the local runtime is actually ready to accept and process audio.
- Spawn errors, missing runtime assets, and ready timeouts need distinct failure details so local setup problems are diagnosable.
- Preserving structured startup codes keeps renderer feedback and future operational debugging anchored to the real cause instead of a generic wrapper code.

## Trade-offs

- Local provider startup is slightly slower because `active` now waits for the ready handshake instead of just process spawn.
- The adapter owns a small amount of startup-state bookkeeping and one timeout.
- This hardening remains provider-specific; cloud provider startup semantics are unchanged.
