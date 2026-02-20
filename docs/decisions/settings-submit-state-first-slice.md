<!--
Where: docs/decisions/settings-submit-state-first-slice.md
What: Decision record for making Settings submit derive values from renderer state for migrated controls.
Why: Reduce legacy DOM coupling and complete another incremental React migration step.
-->

# Decision: State-First Settings Submit for Migrated Controls

## Context
- Most Settings controls are now React-owned and update renderer draft state through callbacks.
- The submit handler still queried many DOM fields directly.
- DOM-read submit logic creates friction and duplicates state ownership concerns.

## Decision
- Keep the existing `settings-form` submit contract and save button behavior.
- Make submit validation and save payload derive migrated values from `state.settings` drafts:
  - Shortcut fields
  - Endpoint overrides
  - Transformation preset name
  - Recording method/device/sample rate (now patched via React callbacks)
- Keep persistence boundary unchanged (`window.speechToTextApi.setSettings` on submit).

## Rationale
- Preserves existing selectors and e2e contracts while reducing DOM dependency.
- Aligns submit behavior with React-owned field state.
- Keeps migration incremental and reversible with a small, reviewable diff.

## Consequences
- Recording method/device/sample-rate controls are now controlled in React and patch drafts immediately.
- Submit path no longer depends on DOM snapshots for migrated fields.
- Validation errors still flow through existing error-state rendering contract.
