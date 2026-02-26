<!--
Where: docs/decisions/output-selected-text-source-precedence.md
What: Decision record for fixing capture double-output by adding an explicit selected output text source.
Why: #148 needs a single output text source in capture flows without breaking standalone transform shortcut output behavior.
-->

# Decision Record: Explicit Output Text Source Selection for Capture Output

## Context

Issue `#148` reports duplicate output when capture auto-transform is enabled and both transcript and transformed outputs are configured to paste/copy.

The existing settings model stores two separate output rules:

- `output.transcript`
- `output.transformed`

Capture pipelines applied both rules in the same run, which could paste raw STT text and transformed text back-to-back.

## Decision

Add an explicit `output.selectedTextSource` field (`transcript` | `transformed`) and use it to choose exactly one capture output source.

- Capture pipelines now apply only one output text source per run.
- Settings Output UI is simplified to:
  - `Output text` (single select)
  - `Output destinations` (shared copy/paste checkboxes)
- UI edits synchronize transcript/transformed destination rules so transform shortcuts keep using the same destination settings.

## Rationale

- Fixes the P0 duplicate-output bug at the runtime decision point.
- Matches the requested UX model (single source + shared destinations).
- Preserves standalone transform shortcut behavior by keeping the existing `output.transformed` rule in the schema and syncing it from the UI.
- Keeps the change small and reversible versus a full output-settings schema redesign.

## Migration

Existing settings missing `output.selectedTextSource` are backfilled on load.

- Derivation rule: prefer `transformed` when the transformed output rule has any enabled destination; otherwise use `transcript`.

This prevents legacy overlapping configs from continuing the double-output behavior after upgrade.

## Consequences

- Capture jobs no longer emit both transcript and transformed output in the same successful run.
- Hidden divergence in legacy transcript/transformed destination rules can persist until the user edits the Output settings (the UI re-synchronizes them on change).
- Transformation-failure capture behavior still falls back to transcript output (existing behavior preserved).
