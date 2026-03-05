<!--
Where: docs/decisions/ui-design-guidelines-canonical-doc.md
What: Decision record for canonical UI guideline document naming and authority.
Why: Prevent drift and ambiguity between design docs and implemented renderer UI.
-->

# Decision: Canonical UI Guideline Document

Date: 2026-03-05  
Status: Accepted

## Context

`docs/style-update.md` started as a migration spec and accumulated implementation addenda over time.
As the renderer architecture evolved (5-tab IA, split settings/audio/shortcuts tabs, API-key delete confirm, unsaved-draft destructive discard), parts of the file became stale and mixed "historical migration intent" with "current implementation contract".

## Decision

1. Rename `docs/style-update.md` to `docs/ui-design-guidelines.md`.
2. Reframe content from migration checklist to current-state implementation contract.
3. Treat `docs/ui-design-guidelines.md` as the canonical guide AI coding agents and developers must follow for new renderer UI components.
4. Update code/doc references that pointed to the old filename.

## Rationale

- "Style update" implies temporary transition; "UI design guidelines" clearly communicates long-lived authority.
- A canonical, current-state guide reduces regressions from agents implementing outdated patterns.
- Explicit source-of-truth paths and anti-patterns improve consistency and review quality.

## Consequences

- Future UI changes must update `docs/ui-design-guidelines.md` when contracts shift.
- If a redesign intentionally diverges, a new decision record should be created before implementation.
