<!--
Where: docs/decisions/issue-376-remove-transformation-orchestrator.md
What: Decision record for removing the dead TransformationOrchestrator path.
Why: Runtime transform orchestration is queue-based via CommandRouter and TransformQueue; the old class is orphaned.
-->

# Decision: Issue #376 Remove TransformationOrchestrator

Date: 2026-03-05
Issue: https://github.com/massun-onibakuchi/speech-to-text-app/issues/376

## Decision

- Delete `src/main/orchestrators/transformation-orchestrator.ts`.
- Delete `src/main/orchestrators/transformation-orchestrator.test.ts`.

## Rationale

- No runtime path imports or instantiates `TransformationOrchestrator`.
- Production transform flow already routes through:
  - `register-handlers` -> `CommandRouter` -> `TransformQueue`/pipeline.
- Keeping both concepts (legacy orchestrator + queue router) creates dead maintenance surface.

## Behavior Impact

- No intended behavior change.
- Queue-based transform path remains the only supported runtime orchestration path.

## Verification

- `rg "TransformationOrchestrator" src` has no remaining runtime references.
- Command router / transform pipeline test coverage remains the source of truth.
