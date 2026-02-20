<!--
Where: docs/decisions/issue-75-settings-api-keys-react-slice.md
What: Decision record for migrating Settings API keys section to React.
Why: Keep migration incremental and remove legacy DOM listener ownership for API key controls.
-->

# Issue #75 Decision Record: Settings API Keys React Slice

## Context
- Settings form is still primarily legacy-rendered.
- API key controls had legacy DOM listeners for visibility toggle, test connection, and save.

## Decision
- Render Provider API Keys section via a dedicated React component.
- Move API key interaction ownership (toggle/test/save) to React callbacks.
- Keep side-effect orchestration in legacy renderer helper functions for now.

## Rationale
- Removes a compatibility-heavy listener block from legacy renderer.
- Preserves existing selector contracts and user-visible behavior while reducing legacy surface.
- Keeps one click owner for API key controls and prevents future double-binding drift.

## Consequences
- New component: `src/renderer/settings-api-keys-react.ts`.
- New component test: `src/renderer/settings-api-keys-react.test.ts`.
- Legacy renderer now mounts/unmounts another React root for Settings API keys.
