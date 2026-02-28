<!--
Where: docs/decisions/settings-remove-deprecated-controls-copy.md
What: Decision record for removing deprecated Settings controls and obsolete helper copy.
Why: Keep Settings focused on active workflows and eliminate dead control paths.
-->

# Remove Deprecated Settings Controls and Copy — Decision Record

**Issue:** #194  
**Date:** 2026-02-28  
**Status:** Implemented

## Context

Settings still exposed legacy elements that no longer matched the current interaction model:

- `Restore Defaults` button in Output section
- dead batch API key save flow in renderer mutations
- outdated helper/link copy in Settings sections

These controls increased surface area without supporting active save/test behavior.

## Decision

- Remove `Restore Defaults` from Settings Output UI.
- Remove dead batch API-key save flow and related renderer state field.
- Keep per-provider `Test Connection` / `Save` controls as the only API-key write flow.
- Remove obsolete roadmap/helper copy from active Settings sections.

## Impact

- Output changes are now explicit user edits plus normal save/autosave paths.
- No dead submit path remains for removed batch API-key save behavior.
- Settings text focuses on actionable controls only.
