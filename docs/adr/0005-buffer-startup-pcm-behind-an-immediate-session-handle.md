---
title: Buffer startup PCM behind an immediate local session handle
description: Return a local streaming session handle before runtime startup completes and buffer coarse PCM in main so cancel works across install, service-start, and websocket-prepare phases.
date: 2026-03-19
status: accepted
tags:
  - architecture
  - streaming
  - runtime
---

<!--
Where: docs/adr/0005-buffer-startup-pcm-behind-an-immediate-session-handle.md
What: Durable decision for how local streaming startup and cancel semantics interact with the renderer PCM seam.
Why: Ticket 6 needs one session-control shape that supports startup cancel without pushing lifecycle ownership back into the renderer.
-->

# Context

Ticket 5 established the renderer-to-main PCM transport seam:

- `startLocalStreamingSession`
- `appendLocalStreamingAudio`
- `stopLocalStreamingSession`
- `cancelLocalStreamingSession`

Ticket 6 then has to add the real main-process session controller behind that seam.

The controller must satisfy two constraints at the same time:

- cancel has to work during runtime install, service startup, and websocket prepare
- renderer capture should not regain ownership of session lifecycle or terminal status

That creates one practical startup question:

- should `startLocalStreamingSession` wait until the runtime is fully ready, or should it hand back a session id immediately while startup continues in main?

# Discussion

## Option A

Block `startLocalStreamingSession` until install, service start, and websocket prepare all finish.

Why this is attractive:

- no startup buffering
- simpler controller state

Why this fails:

- the renderer cannot cancel a session that does not have a handle yet
- startup latency would move back into the renderer path
- main would no longer own the full pending-session lifecycle

## Option B

Return a handle immediately, but buffer startup PCM in the renderer until main reports readiness.

Why this is attractive:

- cancel could still reference a session id
- main would receive less audio before activation

Why this fails:

- renderer would have to infer more of the session lifecycle again
- buffering policy would be split across renderer capture and main orchestration
- later output/activity tickets would inherit two partial owners for one session

## Option C

Return a handle immediately and buffer coarse PCM batches in the main-process session controller until the runtime session becomes active.

How it works:

- `startLocalStreamingSession` returns a session id as soon as local selection/preconditions pass
- main continues install wait, service start, and websocket prepare asynchronously
- `appendLocalStreamingAudio` queues coarse PCM batches in main while startup is still pending
- once the runtime client is active, main flushes queued batches in order
- `cancelLocalStreamingSession` aborts startup work and discards any buffered batches before output side effects begin

Why this is attractive:

- cancel works in every startup phase with one stable session id
- main stays the single owner of local session state and terminal outcomes
- the renderer capture seam from Ticket 5 stays narrow and durable

Trade-off:

- main now owns transient startup buffering and has to avoid double-stop or stale-buffer races

# Decision

Use Option C.

The local streaming session controller will return a session handle immediately and buffer coarse PCM in main until the runtime session becomes active.

The controller will:

- reject concurrent starts before creating a second session
- keep startup-phase state in main
- flush queued PCM only after activation
- discard queued PCM on startup cancel
- keep terminal status ownership in main rather than the renderer seam

# Consequences

Good:

- startup cancel is possible during install, service start, prepare, and active phases with one consistent handle
- renderer capture stays focused on audio capture and IPC transport
- future output/activity tickets can subscribe to one main-owned session state machine

Bad:

- main needs explicit guards for startup buffering, stop deduplication, and stale async completions
- buffered startup audio is transient process memory that must remain coarse and bounded by controller behavior

Follow-up implications:

- output/activity tickets can assume session ids already exist before the runtime is active
- if a future runtime exposes a better pre-activation contract, revisit this ADR and simplify buffering only if cancel semantics stay intact
