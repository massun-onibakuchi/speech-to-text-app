<!--
Where: docs/decisions/2026-03-10-streaming-utterance-ipc-validation-decision.md
What: Decision note for validating Groq utterance payloads at the main IPC boundary.
Why: T440-R3 adds runtime guards for malformed renderer->main utterance messages.
-->

# Decision: Validate Streaming Utterance Payloads at Main IPC Ingress

Date: 2026-03-10

## Context

Issue 440 still had a secondary crash shape where main could dereference
`chunk.sessionId` on a null or malformed Groq utterance payload. TypeScript
types were not enough because the MessagePort payload arrives at runtime as
`unknown`.

## Decision

Validate the minimum `StreamingAudioUtteranceChunk` shape in main before owner
lookup or session-state checks.

The ingress guard now checks:

- object/non-null payload
- `sessionId`
- `sampleRateHz`
- `channels`
- `utteranceIndex`
- `wavBytes`
- `wavFormat`
- `startedAtMs` / `endedAtMs`
- `hadCarryover`
- `reason`
- `source`

## Why

This keeps malformed payloads contained at the IPC boundary and turns them into
structured transport errors instead of opaque null dereferences.

## Trade-off

The guard intentionally stays local to main IPC ingress instead of introducing a
new shared runtime-schema dependency in this ticket.
