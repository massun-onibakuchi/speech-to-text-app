<!--
Where: docs/decisions/issue-75-settings-shortcuts-react-slice.md
What: Decision record for migrating the Settings shortcut contract card to React.
Why: Keep React migration incremental while reducing legacy template surface safely.
-->

# Issue #75 Decision Record: Settings Shortcut Card React Slice

## Context
- Home is already React-rendered.
- Settings remains mostly legacy string-rendered in `legacy-renderer.ts`.
- The shortcut contract card is static UI driven by existing settings shortcut values.

## Decision
- Render the Settings shortcut contract card via a dedicated React component and mount root.
- Keep existing shortcut data source (`buildShortcutContract`) and existing CSS selectors/classes.
- Keep Settings behavior/event side effects in legacy renderer for this slice.

## Rationale
- Removes low-risk UI from legacy templates first.
- Preserves behavior contract and e2e expectations while shrinking legacy rendering surface.
- Keeps one event owner per path (no duplicate click/IPC ownership introduced).

## Consequences
- New component: `src/renderer/settings-shortcuts-react.ts`.
- New component test: `src/renderer/settings-shortcuts-react.test.ts`.
- Legacy renderer now manages a second React root for the Settings shortcut card lifecycle.
