---
title: Publish structured local streaming activity over IPC
description: Keep local session and chunk state ownership in main by broadcasting structured session and segment snapshots to the renderer instead of preformatted strings.
date: 2026-03-19
status: accepted
tags:
  - architecture
  - streaming
  - ipc
---

<!--
Where: docs/adr/0006-publish-structured-local-streaming-activity-over-ipc.md
What: Durable decision for how Ticket 7 exposes raw local streaming chunk/session state to the renderer.
Why: The raw dictation lane needs visible chunk/session progress without moving state ownership back out of main.
-->

# Context

Ticket 7 enables the first working local streaming output lane:

- raw finalized chunks paste immediately in source order
- active cancel drops future uncommitted chunks
- the Activity tab must show raw chunk text and terminal session outcomes for debugging

That leaves one architectural choice:

- should main push already-formatted activity strings to renderer, or should it publish structured local streaming state and let renderer map that state into cards?

# Discussion

## Option A

Broadcast preformatted strings only.

Why this is attractive:

- minimal IPC shape
- renderer only appends text cards

Why this falls short:

- main would own renderer wording and card-granularity decisions
- updating a chunk card from `finalized` to `output_committed` becomes awkward and string-driven
- Ticket 8 would have to bolt transformed/raw traceability onto an unstructured channel

## Option B

Keep activity state entirely in renderer and infer it from recording/session callbacks.

Why this is attractive:

- no new shared IPC contract
- renderer can shape its own UI state

Why this fails:

- main already owns ordered output, cancel semantics, and terminal session truth
- renderer would need to reconstruct chunk/session transitions indirectly
- the same lifecycle would gain two partial owners again

## Option C

Publish structured `session` and `segment` snapshots over explicit local-streaming IPC and let renderer map them into Activity cards.

How it works:

- main broadcasts session-state snapshots as the controller changes
- main broadcasts segment snapshots as raw chunks move through `finalized`, `output_committed`, or `failed`
- renderer upserts cards by `sessionId + sequence` for chunks and appends terminal session cards when the session ends

Why this is attractive:

- main remains the single owner of local streaming lifecycle truth
- renderer gets enough structured state to render useful cards without reverse-engineering
- Ticket 8 can extend the same segment snapshot with transformed text while keeping raw text visible

Trade-off:

- shared IPC/domain types grow, and main must keep the event stream disciplined

# Decision

Use Option C.

Local streaming activity will be published over explicit IPC as structured `session` and `segment` snapshots.

Main owns the state transitions. Renderer maps those snapshots into Activity cards and may upsert the same chunk card as its state advances.

# Consequences

Good:

- raw chunk text stays visible in the Activity tab without weakening main ownership
- chunk errors and terminal session reasons remain actionable and structured
- Ticket 8 can reuse the same IPC seam for transformed-chunk publication

Bad:

- main, preload, shared IPC types, and renderer listener wiring all change together
- renderer now has to translate structured local streaming state into display text consistently
