<!--
Where: docs/decisions/shortcut-contract-doc-table-removal.md
What: Decision record for removing shortcut-contract table formatting from docs/spec artifacts.
Why: Ticket #223 requests removal of Shortcut Contract tables while preserving clear shortcut guidance.
-->

# Decision: Remove Shortcut Contract Tables from Docs/Spec

## Status
Accepted - February 28, 2026

## Context
Shortcut guidance in docs included a table-oriented presentation for dedicated-tab rationale and wording that referred to shortcut contract table UI. The change request for #223 is to remove Shortcut Contract tables from docs/spec while keeping guidance clear.

## Decision
- Replace shortcut-contract table formatting with concise narrative guidance.
- Keep shortcut behavior descriptions and selectors/callback notes intact.
- Keep unrelated tables (for non-shortcut topics) unchanged.

## Audit Evidence
Run from repo root:
- `rg -n "formatted keybind table|\|\s*Criterion\s*\|\s*Before\s*\|\s*After\s*\|" docs specs -S -g '!docs/github-issues-220-229-work-plan.md' -g '!docs/decisions/shortcut-contract-doc-table-removal.md'`

Expected result after this change: no hits for that pattern in docs/spec.
