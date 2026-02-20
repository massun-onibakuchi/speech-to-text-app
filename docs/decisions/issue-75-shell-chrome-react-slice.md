<!--
Where: docs/decisions/issue-75-shell-chrome-react-slice.md
What: Decision record for migrating shell hero/top-nav to React.
Why: Continue removing legacy template rendering while preserving spec behavior.
-->

# Issue #75 Decision Record: Shell Chrome React Slice

## Context
- Home card content is React-owned.
- Settings shortcut card is React-owned.
- Hero and top navigation were still rendered as legacy string templates.

## Decision
- Migrate hero and top navigation to a dedicated React component (`ShellChromeReact`).
- Keep existing navigation contract selectors (`data-route-tab`) and page toggling contract (`data-page`).
- Move top-nav click ownership to React handlers and remove legacy route-tab listeners.

## Rationale
- Reduces legacy string-template surface without changing command/event side effects.
- Removes duplicate ownership risk for top-nav route clicks.
- Preserves strict spec behavior for navigation and status visibility.

## Consequences
- New component: `src/renderer/shell-chrome-react.ts`.
- New component test: `src/renderer/shell-chrome-react.test.ts`.
- Legacy renderer now manages one additional React root lifecycle for shell chrome.
