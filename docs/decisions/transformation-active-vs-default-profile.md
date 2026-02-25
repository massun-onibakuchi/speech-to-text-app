<!--
Where: docs/decisions/transformation-active-vs-default-profile.md
What: Decision record for the meaning of active vs default transformation profiles.
Why: Clarifies user-facing semantics in Settings and documents existing behavior used by shortcuts/capture flows.
-->

# Decision Record: Active vs Default Transformation Profile

## Context

The Transformation settings UI exposes both an `active` profile and a `default` profile. Issue `#127` raised that the difference is unclear, especially because some flows use a one-shot picked profile and some flows use the default profile.

The codebase already implements distinct behaviors, but the settings UI did not explain them clearly.

## Decision

Keep both concepts and document them explicitly:

- `Active profile`: the currently selected profile for manual transformation actions in the app UI and the starting selection in the pick-and-run profile picker.
- `Default profile`: the profile used by default/automatic transformation flows (including capture/recording transformations and the Run Transform shortcut).

These values are allowed to differ.

## Behavioral Definition (Confirmed from Current Code)

- Manual Home transform action (`runCompositeFromClipboard`): uses `activePresetId`.
- Manual transform-on-selection action: uses `activePresetId`.
- Pick-and-run transformation: uses a one-time picked profile and does **not** persist `activePresetId` or `defaultPresetId`.
- Recording/capture transformation pipeline: uses `defaultPresetId`.
- Run Transform shortcut (default transform hotkey): uses `defaultPresetId`.
- App restart: both `activePresetId` and `defaultPresetId` persist via saved settings.

## Rationale

- Users may want to experiment with a profile manually (`active`) without changing the stable profile used by repeatable/default flows (`default`).
- Keeping `default` separate avoids accidental changes to capture/automation behavior when browsing or editing profiles in Settings.
- The existing code already follows this split; clarifying UI copy is lower risk than changing behavior.

## UI Guidance

The Settings UI should state:

- `Active profile` is for manual transforms and picker starting selection.
- `Default profile` is for capture/default shortcut flows and persists across restarts.
- Changing `active` does not change `default`.

## Consequences

- No behavior change is required for `#127`; this is a documentation + UI clarification update.
- This decision unblocks `#130` (default-profile change UX), which depends on consistent active/default semantics.
