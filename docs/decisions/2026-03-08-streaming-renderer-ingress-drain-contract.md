<!--
Where: docs/decisions/2026-03-08-streaming-renderer-ingress-drain-contract.md
What: Decision note for the renderer-side streaming ingress drain contract under stop and transport failure.
Why: Record why renderer stop now waits on one shared drain promise and why automatic batch failures must enter the fatal capture path.
-->

# Decision: Renderer Ingress Uses One Shared Drain Promise

## Status
Accepted — March 8, 2026

## Context

The latest-dev streaming audit found two renderer-side transport bugs:

- `StreamingAudioIngress.stop()` could resolve while an earlier batch push was still in flight, which allowed main to stop the session before the renderer had finished draining queued audio.
- Automatic max-batch drains were started in the background without an observed rejection path, so transport failures could bypass the live-capture fatal cleanup flow.

Those bugs lived in the same seam:
- `StreamingAudioIngress` owns queueing and batching.
- `BrowserStreamingLiveCapture` owns fatal capture shutdown.

## Decision

The renderer ingress contract is now:

- `StreamingAudioIngress` owns one shared drain promise for all queued-batch transport work.
- `flush()` and `stop()` await that same drain promise instead of returning early when a push is already in flight.
- `pushFrame()` may return that drain promise when pushing a full batch starts or joins active transport work.
- `BrowserStreamingLiveCapture` observes that returned promise and routes any rejection into its existing fatal cleanup path.
- once explicit `stop()` / `cancel()` teardown begins, late drain failures must not reclassify the session as a fatal capture failure

## Consequences

- Renderer stop acknowledgement stays aligned with real local drain completion.
- Automatic batch transport failures are no longer silent background rejections.
- Explicit stop/cancel always finishes local teardown even if a drain fails while shutdown is already underway.
- The fix stays renderer-local and does not widen the main-process stop contract.
- `pushFrame()` is no longer purely fire-and-forget; callers that trigger transport work may observe an async rejection.

## Rejected Alternatives

- Replace ingress with a larger async worker/channel abstraction in this fix batch.
  - Rejected because it is a broader refactor than needed for the current bugs.
- Move drain responsibility into the main stop contract.
  - Rejected because the bug originates in renderer-local queue serialization and should be fixed there first.

## Out Of Scope

- Groq stop timeout budgeting
- Multi-window stop acknowledgement ownership
- AudioWorklet migration
- Speech chunker reset semantics
