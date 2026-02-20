<!--
Where: docs/decisions/issue-75-home-react-architecture.md
What: Architecture decision for Home migration implementation in Issue #75.
Why: Record migration seam choices for maintainability and review.
-->

# Issue #75 Architecture Decision: Home React Seam

## Decision
- Render Home cards through a React component (`src/renderer/home-react.ts`) mounted inside legacy shell (`#home-react-root`).
- Keep Settings and existing IPC/listener ownership in legacy renderer during this ticket.
- Route Home actions through existing legacy command/state functions to preserve behavior semantics.

## Rationale
- Minimizes migration risk by limiting scope to Home surfaces only.
- Replaces Home DOM/event wiring with React handlers while preserving behavior contracts.
- Keeps one React bootstrap path to avoid split compatibility ownership.

## Trade-offs
- Legacy renderer still contains mixed concerns (Home state/action orchestration + Settings rendering).
- Temporary duplication of UI composition responsibility (React for Home, legacy for Settings) until later phases.

## Follow-up
- In subsequent phases, move shared command/state orchestration from legacy renderer into dedicated React hooks/services.
- Remove remaining legacy Settings rendering path after equivalent React migration.
