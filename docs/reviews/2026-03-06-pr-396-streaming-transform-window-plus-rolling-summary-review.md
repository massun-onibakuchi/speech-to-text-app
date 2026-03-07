<!--
Where: docs/reviews/2026-03-06-pr-396-streaming-transform-window-plus-rolling-summary-review.md
What: Review findings for PR 396 covering the streaming transform window + rolling summary research and decision docs.
Why: Preserve a concrete, source-backed assessment of correctness, feasibility, risk, and architecture gaps against the current codebase.
-->

# PR 396 Review Report

Date: March 6, 2026
PR focus: streaming transform research and decision docs, mainly `docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md`
Reviewer focus:
- decision on the approved approach against the current codebase
- feasibility and risk of the approved approach
- missed, under-estimated, or over-estimated factors
- proposed architecture, design, and spec fit

## Summary

The selected high-level approach, `window + rolling summary`, is directionally reasonable for transformed streaming output. The main issues are not with the context strategy itself, but with how ready the codebase is for it and how complete the supporting architecture is in the current docs.

The current research overstates implementation readiness and understates the size of the runtime changes needed below the segment-processing layer. The biggest gaps are:
- no frame-level streaming audio path exists yet
- streaming output semantics need to be simplified and fixed in the spec before implementation
- current routing and ordering primitives are only batch-capable
- the transformation payload contract is still too vague for deterministic implementation
- provider guidance across the streaming docs is not fully aligned with the spec

## Findings

### 1. Capture/runtime feasibility is materially understated

Severity: High

The research presents the work as mostly additive streaming lifecycle, segment events, and renderer activity surfaces, and rates technical feasibility as high.

Evidence:
- Research identifies renderer/main streaming lifecycle additions in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L179) and technical feasibility in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L291).
- Current recording starts a browser `MediaRecorder` on a `MediaStream` in [src/renderer/native-recording.ts](/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts#L305).
- Audio is accumulated as `dataavailable` chunks in [src/renderer/native-recording.ts](/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts#L354).
- The app waits for `stop`, converts the buffered blob to bytes, and only then calls `submitRecordedAudio` in [src/renderer/native-recording.ts](/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts#L363).
- Main-process routing then treats that as one capture submission into the batch queue in [src/main/core/command-router.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/core/command-router.ts#L71).

Why this matters:
- There is no existing frame-level audio transport to a streaming STT adapter.
- There is no session-oriented recording contract between renderer and main.
- A streaming implementation needs more than segment events layered on top of the current flow; it needs a new capture-to-transcription path.

Conclusion:
The approved context strategy may still be correct, but delivery feasibility is lower than documented until the audio ingestion/runtime architecture is explicitly accounted for.

### 2. Streaming output semantics were underspecified before the paste-only assumption was made explicit

Severity: High

The original research treated output concerns mainly as append/new-entry behavior plus segment idempotency. Under the previous spec wording, that was not enough. Under the revised assumption for streaming mode, the correct fix is to simplify the streaming contract itself: streaming should be paste-driven output, not a user-facing clipboard mode.

Evidence:
- Research output/clipboard section is narrow in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L170).
- Acceptance criteria also compress this area to clipboard append/new-entry behavior in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L324).
- The spec requires a richer streaming matrix and clipboard-state model in [specs/spec.md](/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md#L723) and [specs/spec.md](/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md#L729).
- The current clipboard policy is only a permissive read/write stub in [src/main/coordination/clipboard-state-policy.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/clipboard-state-policy.ts#L7).
- `OutputService` always writes to the clipboard when paste is enabled in [src/main/services/output-service.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/services/output-service.ts#L50).

Why this matters:
- The old streaming matrix distinguished paste-only, copy-only, and copy-plus-paste semantics, which expanded the architecture into clipboard-history state management.
- If streaming mode instead forces `pasteAtCursor=true` and disables `copyToClipboard` as a user option, that complexity largely stops being product behavior and becomes an internal paste-automation detail.
- The current code still needs clipboard writes internally because paste automation depends on the system clipboard, but it no longer needs a user-facing “streaming clipboard entry” model unless that behavior is deliberately retained.

Conclusion:
The report should treat this primarily as a spec/decision issue: simplify streaming output semantics first, then implement around that narrower contract.

### 3. Provider strategy is not fully reconciled across the docs and spec

Severity: Medium

The new research says the recommendation aligns with the spec direction, but the provider guidance across related docs is still inconsistent.

Evidence:
- The reviewed research says the recommendation aligns with the existing spec direction in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L339).
- The earlier streaming provider research recommends `local_whispercpp | openai_realtime | groq_realtime?` in [docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md#L235).
- That same research treats `whisper.cpp` as the local feasible path in [docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md#L276).
- The spec requires local support through macOS Tahoe `SpeechAnalyzer` or `SpeechTranscriber` and makes `processing.streaming.apiKeyRef` canonical in [specs/spec.md](/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md#L683) and [specs/spec.md](/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md#L698).

Why this matters:
- Provider strategy influences settings shape, capability registry design, credential handling, and platform risk.
- Without reconciliation, later implementation work can diverge from the documented architecture and accepted decision.

Conclusion:
The approved approach is not invalidated by this, but the surrounding streaming plan is not yet fully spec-aligned.

### 4. Existing routing and ordering primitives are weaker than the feasibility section suggests

Severity: Medium

The research points to current queueing, ordering, and snapshot patterns as strong evidence of high feasibility. That overstates what those primitives can currently do.

Evidence:
- Feasibility cites queue discipline, ordered output coordination, and snapshot-driven routing in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L291).
- `ProcessingMode` only includes `default` and `transform_only` in [src/main/routing/processing-mode.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode.ts#L1).
- `DefaultProcessingModeSource` is hardcoded to `default` in [src/main/routing/processing-mode-source.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode-source.ts#L12).
- `ModeRouter.routeCapture` throws on any non-default capture mode in [src/main/routing/mode-router.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/mode-router.ts#L23).
- The ordered coordinator is an in-memory sequence gate with no session scope or duplicate suppression in [src/main/coordination/ordered-output-coordinator.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/ordered-output-coordinator.ts#L31).

Why this matters:
- These primitives are useful starting points, but they are not streaming-ready abstractions yet.
- Segment streams need session scoping, replay tolerance, and stronger idempotency semantics than the current batch ordering helper provides.

Conclusion:
Feasibility should be described as “promising but still foundationally incomplete,” not simply high.

### 5. The transformation contract is still too vague for an implementation-ready claim

Severity: Medium

The research requires deterministic `segment + window + summary` payload construction, but the implementation-facing contract is still essentially flat text plus prompts.

Evidence:
- The research requires payload components and deterministic composition in [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L109), [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L150), and [docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md](/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md#L324).
- The current transformation contract only defines a single `text` field in [src/main/services/transformation/types.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/types.ts#L8).
- Prompt formatting today is simple string concatenation and `{{text}}` substitution in [src/main/services/transformation/prompt-format.ts](/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/prompt-format.ts#L1).

Why this matters:
- The doc does not yet define how `windowSegments` and `rollingSummary` are serialized, delimited, or versioned.
- Token budgeting and truncation become hard to test without a structured payload contract.
- Deterministic prompt composition is one of the main safeguards against quality regressions, so it should be specified concretely.

Conclusion:
The report is useful as architecture direction, but it is not yet implementation-ready at the transformation contract layer.

## Overall Assessment

### Approved approach against the current codebase

The approved context strategy itself is reasonable. The current codebase does not contradict `window + rolling summary` as the preferred transformed-stream context model.

The main issue is that the codebase is much farther from a viable streaming runtime than the research implies. The approach should be treated as an architectural target inside a larger streaming rebuild, not as the next small additive step.

### Feasibility and risk

Current assessment:
- context strategy feasibility: good
- end-to-end streaming implementation feasibility on current branch: moderate at best, not high
- regression risk: medium
- architecture/spec alignment risk: medium

Underestimated factors:
- new frame/session audio ingestion path
- explicit streaming output-mode rules and validation
- stronger session-start validation and provider credential plumbing
- structured transformation payload design
- reconciliation of provider direction across research and spec

### Architecture/design/spec fit

The proposed components are broadly sensible:
- `StreamingSessionController`
- `StreamingSttAdapter`
- `SegmentAssembler`
- `ContextManager`
- `SegmentTransformWorkerPool`
- ordered output coordination
- renderer activity publishing

The gaps are in the interfaces between those components:
- audio capture transport into streaming STT is not specified
- streaming output-mode contract was not previously concrete enough
- transformation payload contract is not yet concrete
- provider and credential model remains partially inconsistent across docs

## Recommended Follow-Up

Before implementation starts, the docs should add or clarify:
- the renderer-to-main streaming audio/session contract
- the streaming output-mode contract, including forced paste behavior and disabled user-facing copy semantics
- the structured transformation payload schema for `segment`, `window`, `summary`, and metadata
- the provider strategy reconciliation between spec and streaming provider research
- a revised feasibility section that reflects foundational runtime work, not only additive component work

## Review Process Note

This report was based on direct review of the PR docs against the current codebase and spec.

A second-pass local Claude CLI review was attempted per repo workflow, but the CLI did not return usable output in this environment. No unverified Claude findings were included here.
