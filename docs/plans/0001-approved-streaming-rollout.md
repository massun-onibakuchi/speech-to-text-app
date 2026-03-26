---
title: Approved streaming rollout plan
description: Stage the first streaming-mode delivery without regressing the shipped default batch workflow.
date: 2026-03-26
status: active
review_by: 2026-04-02
tags:
  - streaming
  - execution-plan
  - delivery
---

<!--
Where: docs/plans/0001-approved-streaming-rollout.md
What: Execution plan for the next approved streaming workstream.
Why: Keep implementation sequencing aligned with the normative spec and make review gates explicit before coding starts.
-->

# Plan

## Problem

The repo has a normative specification for an approved streaming extension, but no controlled plan document that narrows the first delivery slice, sequencing, and verification gates.

Without that plan, implementation risk is high in three areas:
- streaming work could drift into broader redesign instead of the approved first slice
- batch-mode behavior could regress because preservation work is not called out explicitly
- tests and review checkpoints could be added too late to catch routing, ordering, and output-policy mistakes

## Goal

Deliver the first approved streaming capability exactly as defined in [spec.md](/workspace/.worktrees/feat/scratch-space/specs/spec.md):
- keep `processing.mode=default` behavior intact
- add mode-routed streaming as an additive lane
- ship `stream_raw_dictation` first
- defer `stream_transformed` until its stated prerequisites exist

## Non-Goals

- Do not redesign the existing batch capture pipeline beyond the minimum routing and shared-policy extraction needed for streaming.
- Do not ship voice-activation recording.
- Do not expose additional streaming providers beyond the approved enum set.
- Do not enable `stream_transformed` in the first delivery slice.
- Do not implement speculative UX beyond what is required to configure, run, observe, and verify the approved streaming lane.

## Constraints From The Spec

- `processing.mode` is the authoritative router between `default` and `streaming`.
- `processing.mode=streaming` must only ship with paste-oriented user-facing output semantics.
- `stream_raw_dictation` is the first required streaming output mode.
- streaming providers and transports must be closed validated enums.
- the first local provider path must be `local_whispercpp_coreml`.
- streaming output side effects must commit in finalized source segment order even when transform workers complete out of order.
- batch-mode recording, batch transformed output, and transform-only shortcuts must continue to work unchanged.

## Delivery Strategy

### Phase 1: Lock the boundaries

Purpose:
- prevent scope drift before code changes start

Work:
- map existing batch orchestration, output policy, and settings validation paths
- identify which pieces can remain shared and which need streaming-specific components
- define one ADR if implementation requires a non-trivial architectural decision beyond the current spec

Exit criteria:
- one agreed component map for `ModeRouter`, `StreamingSessionController`, `StreamingSttAdapter`, `SegmentAssembler`, `OrderedOutputCoordinator`, and activity publishing
- explicit confirmation that `stream_transformed` stays disabled in this rollout

### Phase 2: Settings and mode validation

Purpose:
- make runtime routing deterministic before session logic is introduced

Work:
- add or normalize persisted settings for `processing.mode` and `processing.streaming.*`
- enforce closed enums for streaming provider and transport
- reject conflicting `processing.mode` and `processing.streaming.enabled` combinations
- ensure default-mode settings remain backward compatible

Exit criteria:
- invalid mode/provider/transport combinations fail validation before runtime
- switching between `default` and `streaming` persists cleanly across restart

### Phase 3: Session and adapter lane

Purpose:
- establish a single active streaming session path without touching batch semantics

Work:
- route recording commands through `ModeRouter`
- add `StreamingSessionController` start/stop lifecycle
- wire the first approved provider path as `local_whispercpp_coreml` with `native_stream`
- enforce credential checks only when the selected provider requires them

Exit criteria:
- one streaming shortcut cycle creates exactly one session
- concurrent session starts are rejected
- default-mode recording still follows the existing batch job path

### Phase 4: Segment assembly and ordered output

Purpose:
- guarantee correct user-visible incremental output

Work:
- normalize provider events into canonical ordered segment events
- finalize segments through `SegmentAssembler`
- commit `stream_raw_dictation` output through `OrderedOutputCoordinator`
- enforce source-order side effects and explicit delimiter policy
- treat any clipboard write in streaming mode as internal paste transport, not a separate user-facing mode

Exit criteria:
- finalized source segment order is preserved at output commit
- paste-at-cursor is the effective streaming destination behavior
- no user-facing clipboard-only streaming mode exists

### Phase 5: Activity, errors, and guardrails

Purpose:
- keep the streaming lane debuggable and non-blocking

Work:
- publish session-level and segment-level activity states
- emit actionable feedback for startup, provider, and per-segment failures
- ensure failed segment handling does not stop later segment processing
- cap in-flight work and define backpressure behavior

Exit criteria:
- segment-local failures surface clearly without terminating unrelated later work
- recording command responsiveness remains intact while streaming work is active

### Phase 6: Verification and review

Purpose:
- prove conformance before broader rollout

Work:
- add automated tests for mode routing, settings validation, session exclusivity, ordered output, and default-mode regression coverage
- add at least one focused e2e or integration path for incremental streaming paste behavior
- run doc validation and targeted test suites
- perform the required two-pass review workflow before implementation is considered ready to merge

Exit criteria:
- automated coverage exists for the new routing and ordered-output guarantees
- the default batch lane has explicit regression protection
- docs and tests pass together

## Test Plan

Minimum automated coverage for this rollout:
- mode validation rejects invalid `processing.mode` and `processing.streaming.enabled` combinations
- provider and transport validation accept only approved enum values
- `ModeRouter` sends default-mode commands to the existing batch pipeline and streaming-mode commands to the session controller
- starting a second streaming session while one is active fails fast
- ordered output commits preserve finalized source segment order
- streaming mode keeps paste-oriented semantics and does not expose clipboard-only output behavior
- default-mode transcription and transform-only shortcuts still pass existing behavior checks

Minimum manual verification:
- switch from `default` to `streaming`, restart, and confirm the selected mode persists
- run one streaming session and confirm incremental raw dictation pastes in order
- confirm batch recording still produces the same result path as before
- confirm transform-only shortcuts still work while default mode remains selected

## Risks And Mitigations

- Risk: routing changes break the current batch path.
  Mitigation: keep `ModeRouter` additive and add regression tests before broad refactors.

- Risk: provider-specific event shapes leak into the rest of the app.
  Mitigation: normalize all streaming output through one canonical segment contract early.

- Risk: out-of-order async completion corrupts pasted text order.
  Mitigation: keep one explicit ordered commit stage and test it with intentionally shuffled readiness.

- Risk: streaming scope expands into `stream_transformed` prematurely.
  Mitigation: keep that mode disabled and treat prerequisite work as a separate follow-up plan or ADR.

## Open Questions

- Whether existing batch activity UI can safely host streaming session and segment states without introducing confusing mixed semantics.
- Whether the first provider integration needs an ADR for local runtime packaging and model distribution, depending on the current repo architecture.
- Whether current test infrastructure already has a suitable integration seam for ordered segment output, or needs a narrow harness first.

## Review Notes

This plan intentionally fixes the current planning gap by:
- narrowing delivery to the approved first slice instead of "streaming in general"
- making batch-preservation work a first-class requirement
- moving validation, routing, ordered output, and regression tests earlier in the sequence
