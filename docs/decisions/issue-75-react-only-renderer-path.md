<!--
Where: docs/decisions/issue-75-react-only-renderer-path.md
What: Decision to remove renderer backward-compat toggles during Home React migration.
Why: Prevent dual-path drift and simplify ownership while continuing React migration.
-->

# Issue #75 Decision Record: React-only Renderer Path

## Context
- Issue #75 migrates Home behavior/UI to React while Settings remains legacy-rendered.
- Previous R0 bootstrap retained a compatibility switch (`VITE_RENDERER_MODE`) for vanilla fallback.
- The compatibility switch and legacy Home fallback logic created extra dead/duplicate code paths and increased ownership ambiguity.

## Decision
- Remove backward-compat renderer mode toggles and keep a single React bootstrap path.
- Remove legacy Home DOM compatibility update paths that are no longer used once Home is React-owned.
- Keep behavioral conformance aligned to `specs/spec.md` (commands, status feedback, toast/sound semantics, non-blocking behavior).

## Rationale
- A single mount path reduces regression surface and eliminates split runtime behavior.
- React-owned Home no longer needs legacy selector compatibility shims; behavior is validated via user-visible contracts.
- This keeps migration momentum while preserving strict spec behavior requirements.

## Consequences
- `VITE_RENDERER_MODE` rollback switch is removed.
- Home tests/e2e assertions move from legacy `id`/`data-*` selectors to visible role/text contracts.
- Settings remains in legacy renderer for now; further migration should continue screen-by-screen with one event owner per interaction.
