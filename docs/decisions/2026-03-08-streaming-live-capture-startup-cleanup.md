<!--
Where: docs/decisions/2026-03-08-streaming-live-capture-startup-cleanup.md
What: Decision note for cleaning up partially initialized renderer audio resources during streaming live-capture startup failure.
Why: Prevent microphone and AudioContext leaks when startup fails after getUserMedia or AudioContext creation succeeds.
-->

# Decision: Clean Up Partially Initialized Streaming Capture Resources

## Status
Accepted - March 8, 2026

## Context

The streaming runtime can fail after `startStreamingLiveCapture()` acquires microphone and audio-context resources. Without a shared cleanup guard, those failures can leak:

- active microphone tracks
- an open `AudioContext`

Those failures are realistic because startup still performs several fallible steps after resource acquisition:

- audio node creation
- graph connection
- `audioContext.resume()`

## Decision

`startStreamingLiveCapture()` now wraps renderer resource acquisition and startup wiring in one cleanup-on-failure guard.

If any startup step throws after the media stream or audio context has been created:

- all acquired media tracks are stopped
- the audio context is closed best-effort
- the original error is rethrown

## Consequences

- Failed starts do not leave the microphone active.
- Failed starts do not wedge later capture attempts with a leaked audio context.
- The successful capture path is unchanged.

## Out Of Scope

- `AudioWorkletNode` migration
- streaming stop/drain contract changes
- chunk-boundary policy
