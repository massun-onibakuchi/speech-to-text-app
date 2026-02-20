<!--
Where: docs/decisions/issue-76-settings-output-react-slice.md
What: Decision record for the Settings output matrix React migration slice.
Why: Keep scope, ownership, and parity guarantees explicit for issue #76.
-->

# Decision: Issue #76 Output Settings React Slice

## Context
- Recording section was migrated to React in the previous #76 slice.
- Output matrix toggles and restore-defaults action were still legacy-listener owned.
- Backward-compat ownership overlap is being removed incrementally.

## Decision
- Move the Settings Output section to a dedicated React root (`settings-output-react-root`).
- Preserve existing selector IDs used by tests and submit logic:
  - `#settings-transcript-copy`
  - `#settings-transcript-paste`
  - `#settings-transformed-copy`
  - `#settings-transformed-paste`
  - `#settings-restore-defaults`
- Remove equivalent legacy listeners from `wireActions()` for output toggles and restore-defaults.

## Rationale
- This slice removes duplicate event ownership with minimal blast radius.
- Existing autosave behavior is preserved by reusing `applyNonSecretAutosavePatch`.
- Restore-defaults save flow and toast/message semantics are preserved by keeping the same persistence helper logic.

## Consequences
- Output section interactions are now React-owned.
- Legacy renderer remains owner of transformation/shortcut submit flow for now.
- Next slice can focus on transformation section migration without re-touching output listeners.
