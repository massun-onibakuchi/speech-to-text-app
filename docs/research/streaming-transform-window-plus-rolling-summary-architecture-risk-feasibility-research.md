<!--
Where: docs/research/streaming-transform-window-plus-rolling-summary-architecture-risk-feasibility-research.md
What: Deep technical research for implementing streaming transformed output using a sliding window plus rolling summary context strategy.
Why: Provide a complete, shareable, implementation-ready analysis without writing code yet.
-->

# Research: Streaming Transform with Window + Rolling Summary

## 1. Scope
This research focuses on approach #3 (`window + rolling summary`) for real-time transformed output.

In scope:
- Architecture
- Required codebase changes
- Technical risks and mitigations
- Feasibility and delivery scope

Out of scope:
- Implementation
- Final UX copy and visual design details
- Final default numeric tuning values

Research date: **March 6, 2026**.

---

## 2. Context and Problem Statement
When streaming STT is transformed segment-by-segment by an LLM, sending only the newest segment often causes:
- context loss
- style inconsistency
- unstable punctuation and sentence continuity
- lower quality for long, connected thoughts

Sending the entire transcript each time improves quality but causes cost/latency growth that becomes non-viable in long sessions.

Therefore, the target is a bounded-context strategy that preserves local and long-range coherence.

---

## 3. Definition of Approach #3
For each finalized segment `S_k`, construct transform input with:
- `segmentText`: current finalized segment text
- `windowSegments`: recent finalized segments (last `N`)
- `rollingSummary`: compressed summary of earlier session content
- `metadata`: language hint, segment sequence, session id, delimiter policy, output mode

This gives:
- strong short-range continuity from `windowSegments`
- long-range continuity from `rollingSummary`
- bounded token usage

---

## 4. Current Codebase Reality (Why New Path Is Required)
Current runtime is batch-only and cannot host this behavior without additive streaming architecture.

Key evidence:
- Mode routing only supports default/transform-only, no streaming mode.
- Settings schema has no `processing.streaming`.
- Transcription and transform contracts are single-shot.
- Transformation input only includes one `text` field.
- Renderer progress model relies on history polling, not segment events.

Relevant files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/domain.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/types.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/ipc.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/renderer/native-recording.ts`

Conclusion: **Approach #3 requires a new streaming code path, not incremental patching of current batch flow.**

---

## 5. Architecture Proposal for #3

### 5.1 High-Level Components
1. `StreamingSessionController`
- Owns session lifecycle (start/stop/fail)
- Enforces single active session

2. `StreamingSttAdapter`
- Provider-specific real-time STT client
- Emits ordered partial/final/error/end events

3. `SegmentAssembler`
- Normalizes provider events into stable finalized segments
- Assigns monotonic sequence IDs

4. `ContextManager` (new, central for #3)
- Stores finalized segment log for session
- Maintains sliding window and rolling summary
- Produces bounded `TransformationContextPayload`

5. `SegmentTransformWorkerPool`
- Concurrent transform workers (`maxInFlight`)
- Accepts per-segment context payload from `ContextManager`

6. `StreamingOrderedOutputCoordinator`
- Commits output side effects in source sequence order
- Handles idempotency/replay tolerance

7. `StreamingActivityPublisher`
- Emits session/segment status to renderer

### 5.2 Data Flow
1. STT emits finalized segment `k`.
2. `SegmentAssembler` creates canonical finalized segment event.
3. `ContextManager` builds transform payload for `k`:
- `segmentText`
- window `[k-N, ..., k-1]`
- rolling summary of `[1, ..., k-N-1]`
4. Transform worker runs LLM call.
5. Result goes to ordered output commit.
6. Output committed in source order.
7. `ContextManager` updates summary periodically.

---

## 6. Required Changes (File-Level Impact)

### 6.1 Shared schema/types
- Extend settings with `processing.mode` and `processing.streaming.*`
- Add streaming output mode enum
- Add validation rules for mode/streaming combinations

Likely files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/domain.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/domain.test.ts`

### 6.2 Mode routing and command entry
- Add `'streaming'` to processing mode
- Resolve mode from settings (not fixed `'default'`)
- Route recording command path to streaming session controller when mode=streaming

Likely files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/processing-mode-source.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/routing/mode-router.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/core/command-router.ts`

### 6.3 Streaming contracts and adapters
- Introduce streaming STT adapter contract + implementations
- Add provider capability registry for realtime support and language hints

Likely new files under:
- `src/main/services/streaming/*`
- `src/main/orchestrators/streaming/*`

### 6.4 Transformation contract extension for #3
- Extend transformation input model to support contextual metadata
- Add prompt builder path that composes segment + window + summary deterministically

Likely files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/types.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/prompt-format.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/transformation/gemini-transformation-adapter.ts`

### 6.5 Context manager
- New `ContextManager` module with:
- sliding window extraction
- summary refresh scheduler
- token budget enforcement/truncation policy

Likely new files:
- `src/main/streaming/context-manager.ts`
- `src/main/streaming/context-budget.ts`
- `src/main/streaming/summary-refresh-policy.ts`

### 6.6 Output and clipboard semantics
- Implement streaming clipboard append/new-entry policy
- Add segment idempotency in output commit stage

Likely files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/clipboard-state-policy.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/coordination/ordered-output-coordinator.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/services/output-service.ts`

### 6.7 IPC/preload/renderer
- Add streaming lifecycle commands and events
- Add live stream UI status and segment activity surfaces

Likely files:
- `/workspace/.worktrees/docs/streaming-stt-research/src/shared/ipc.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/preload/index.ts`
- `/workspace/.worktrees/docs/streaming-stt-research/src/main/ipc/register-handlers.ts`
- renderer stream state/UI files

### 6.8 Tests
Required new coverage:
- out-of-order transform completion with in-order output commit
- context payload correctness (`segment`, `window`, `summary`)
- summary refresh and truncation behavior
- retry/replay idempotency
- segment-level failure isolation
- long-session performance stability

---

## 7. Intricacies of Window + Rolling Summary

### 7.1 Token Budget Management
Without strict budget control, context payload can still drift toward slow responses.

Need explicit budget tiers:
- hard max token budget per request
- preferred allocation: `segment` > `window` > `summary`
- truncation policy when over budget

Concrete PR-9 contract:
- use deterministic UTF-8 byte budgeting for the first implementation-grade contract
- cap `recentWindow` length before total-budget trimming
- trim `rollingSummary` before dropping older window segments
- never drop `currentSegment`, even if it alone exceeds the preferred total budget

### 7.2 Summary Drift
Rolling summaries can slowly distort details.

Mitigations:
- refresh summary from canonical raw segments, not prior summary only
- periodic checksum/anchor fields (entities, decisions, numbers)
- optionally keep short immutable “facts memory” block

### 7.3 Segment Boundary Quality
STT finalized segments are not always sentence-final.

Mitigations:
- punctuation-aware merge heuristics before transform
- optional boundary delay (small debounce)
- configurable delimiter policy

### 7.4 Ordering and Idempotency
Concurrent transform workers can finish out-of-order.

Requirements:
- source sequence is authoritative
- ordered output commit must hold later segments
- idempotency key (`sessionId + sequence + variant`) prevents duplicate side effects on retries/reconnect

### 7.5 Failure Behavior
Per spec direction, one segment failure cannot terminate whole stream.

Policy:
- transform failure for segment `k`: fallback to raw segment (configurable)
- continue processing segment `k+1`
- emit localized actionable diagnostics

### 7.6 EN/JA Language Behavior
Mixed language sessions are sensitive to context and punctuation.

Recommendations:
- explicit session language hint (`auto/en/ja`)
- deterministic normalization policy before commit
- language-specific summary prompt constraints

---

## 8. Risks and Mitigations

### 8.1 Technical Risks
1. Latency spikes in long sessions
- Mitigation: strict token budget + bounded window + adaptive summary length

2. Summary quality decay
- Mitigation: periodic summary rebuild from raw segment slices

---

## 9. Concrete PR-9 Payload Contract

The abstract `segment + window + summary` strategy is now grounded as:

```ts
interface TransformationContextPayloadV1 {
  version: 'v1'
  metadata: {
    sessionId: string
    language: 'auto' | 'en' | 'ja'
    currentSequence: number
  }
  currentSegment: {
    sequence: number
    text: string
    startedAt: string
    endedAt: string
  }
  recentWindow: Array<{
    sequence: number
    text: string
    startedAt: string
    endedAt: string
  }>
  rollingSummary: {
    text: string
    refreshedAt: string | null
    sourceThroughSequence: number | null
  }
}
```

Prompt serialization rules:
- block 1: serialized `transformation_context` XML-style payload
- block 2: user prompt with `{{text}}` replaced by the current segment text only
- batch transforms remain on the existing single-block path because `contextPayload` is optional

Supporting helpers now have explicit responsibilities:
- `ContextManager`: append finalized segments in source order and build `TransformationContextPayloadV1`
- `ContextBudget`: cap window length and enforce deterministic truncation ordering
- `SummaryRefreshPolicy`: decide when the rolling summary should be regenerated

3. Replay/duplicate output side effects
- Mitigation: idempotency tokens + commit ledger

4. Memory growth
- Mitigation: compact session state + persisted checkpoints + hard retention cap

5. Clipboard/paste race conditions
- Mitigation: concrete clipboard state policy and ownership fingerprint tracking

### 8.2 Product Risks
1. Users perceive inconsistent output over time
- Mitigation: expose quality mode knobs and sensible defaults

2. Overly delayed text appearance
- Mitigation: small window + tuned summary refresh cadence

3. Confusion between raw and transformed stream modes
- Mitigation: explicit output mode labels and session status indicators

### 8.3 Operational Risks
1. Provider contract drift for realtime APIs
- Mitigation: capability probing at startup + fallback paths

2. Rate limits on frequent segment calls
- Mitigation: merge tiny segments and cap in-flight transform calls

---

## 9. Feasibility

### 9.1 Technical Feasibility
**High**, because current architecture already has useful building blocks:
- queue discipline
- ordered output coordinator pattern
- snapshot-driven routing

But streaming-specific modules are still missing, so this is a substantial additive project.

### 9.2 Regression Feasibility
**Medium risk**, manageable with isolation:
- keep existing default batch pipeline untouched
- gate all streaming behavior behind explicit mode branch

### 9.3 Delivery Feasibility (Phased)
1. Phase A: contracts/schema/mode wiring
2. Phase B: streaming STT session runtime + segment events
3. Phase C: #3 context manager + segment transform pool
4. Phase D: ordered output/clipboard policy/idempotency
5. Phase E: hardening and quality tuning

---

## 10. Recommended Defaults for First Iteration (Research Proposal)
These are starting points for implementation spikes, not final product commitments.

- `windowSizeSegments`: 4 to 8
- `summaryRefreshEverySegments`: 5
- `maxInFlightTransforms`: 2
- `maxContextTokenBudget`: provider/model dependent; enforce hard cap
- `onTransformFailure`: fallback to raw segment and continue

---

## 11. Acceptance Criteria for #3 (Pre-Implementation Contract)
1. Transform payload always contains `segment + window + summary` (within budget).
2. Output commit order matches STT final sequence order under out-of-order transform completion.
3. Segment failure does not stop session.
4. Long-session latency remains bounded and does not grow linearly with elapsed transcript length.
5. Clipboard policy behavior matches streaming append/new-entry contract.

---

## 12. Final Recommendation
Proceed with approach #3 as the default transformed-stream strategy.

Reason:
- It is the best quality/latency/cost balance.
- It directly addresses context loss.
- It aligns with the existing spec direction and additive architecture pattern.
- It minimizes risk compared to full-context-per-segment while preserving long-range coherence better than window-only.

No implementation was performed in this research step.

---

## 13. Related Internal References
- `/workspace/.worktrees/docs/streaming-stt-research/docs/research/streaming-stt-whisper-api-usage-risk-integrations-research.md`
- `/workspace/.worktrees/docs/streaming-stt-research/specs/spec.md`
- `/workspace/.worktrees/docs/streaming-stt-research/docs/decisions/2026-03-06-streaming-transform-window-plus-rolling-summary-decision.md`
