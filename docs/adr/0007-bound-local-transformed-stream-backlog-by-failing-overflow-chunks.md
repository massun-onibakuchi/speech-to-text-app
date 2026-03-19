---
title: Bound local transformed-stream backlog by failing overflow chunks
description: Keep transformed local streaming responsive by limiting concurrent and queued chunk transforms and failing overflow chunks with actionable feedback instead of buffering indefinitely.
date: 2026-03-19
status: accepted
tags:
  - architecture
  - streaming
  - transformation
  - backpressure
---

<!--
Where: docs/adr/0007-bound-local-transformed-stream-backlog-by-failing-overflow-chunks.md
What: Durable decision for how Ticket 8 handles transformed local streaming backpressure.
Why: The transformed lane needs bounded memory and predictable cancel/output behavior once finalized chunks arrive faster than the LLM path can drain.
-->

# Context

Ticket 8 adds the transformed local streaming lane:

- each finalized local chunk binds the current default transformation preset
- chunk transforms may complete out of order
- ordered output still has to commit in source sequence order

That creates one durable implementation choice:

- what should happen when finalized chunks arrive faster than the transformed chunk worker path can drain them?

# Discussion

## Option A

Allow an unbounded transformed backlog.

Why this is attractive:

- simplest enqueue logic
- no chunk-level backpressure failures to explain

Why this fails:

- one long dictation session could accumulate arbitrary memory and pending work
- cancel/terminal behavior becomes less predictable as the queue grows
- the app would hide throughput problems until they become operational failures

## Option B

Block the local session controller until transform capacity is available.

Why this is attractive:

- no chunk is dropped purely because of backlog pressure
- the transform worker pool stays bounded

Why this fails:

- transformation for chunk `N` would start delaying handling for chunk `N+1`
- the controller would stop matching the spec requirement that transformation must not block continued transcription
- runtime event handling becomes coupled to external LLM latency

## Option C

Use a bounded transformed worker pool and fail new overflow chunks explicitly once both active and queued capacity are exhausted.

How it works:

- allow only a small fixed number of in-flight transformed chunks
- keep only a small fixed queued backlog behind that worker pool
- when both limits are full, reject the newest chunk, mark it failed, release its ordered-output sequence, and surface actionable activity feedback

Why this is attractive:

- transformed local streaming stays memory-bounded
- transcription and runtime event handling remain responsive
- later chunks can still continue once capacity becomes available again
- ordered output can keep advancing because failed chunks release their sequence slots explicitly

Trade-off:

- overload now becomes visible as chunk-level failure instead of hidden queue growth

# Decision

Use Option C.

Local transformed streaming will run through a bounded worker pool and bounded queued backlog. Once both limits are exhausted, the newest transformed chunk will fail immediately with explicit backpressure feedback, and its ordered-output slot will be released so later chunks can continue.

# Consequences

Good:

- transformed local streaming has explicit memory and work bounds
- cancel and terminal session behavior stay predictable because backlog growth is limited
- chunk-local failures stay visible in the same structured activity stream as other local streaming failures

Bad:

- under sustained overload, some transformed chunks will be skipped
- users may need to switch output mode to `Transcript` if overflow becomes frequent
