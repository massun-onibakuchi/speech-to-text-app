<!--
Where: docs/decisions/transformation-active-vs-default-profile.md
What: Decision record for the meaning of active vs default transformation profiles.
Why: Clarifies user-facing semantics in Settings and documents existing behavior used by shortcuts/capture flows.
-->

# Decision Record: Active vs Default Transformation Profile

## Superseded
- This record is superseded by `docs/decisions/transformation-remove-active-preset-last-picked-focus.md` (2026-02-27, issue #167).
- Current architecture no longer keeps `activePresetId`.
- `defaultPresetId` is the only persistent execution selector; `lastPickedPresetId` is picker-focus memory only.

## Update (2026-02-26, final `#127` cleanup)

This decision record was updated after the initial clarification pass. The original split semantics ("manual transforms use active, default flows use default") were an interim clarification. Final `#127` behavior removes `active` from user-facing Settings and standardizes user-triggered/manual transform actions on the default profile.

## Context

The Transformation settings UI exposes both an `active` profile and a `default` profile. Issue `#127` raised that the difference is unclear, especially because some flows use a one-shot picked profile and some flows use the default profile.

The codebase already implements distinct behaviors, but the settings UI did not explain them clearly.

## Decision

Keep `activePresetId` as an internal implementation detail, but remove `Active profile` from user-facing Settings and use `defaultPresetId` for user-facing/manual transform flows.

- `Default profile` is the only user-facing profile selector in Settings.
- Manual Home transform action and manual transform-on-selection use `defaultPresetId`.
- Recording/capture automatic transforms and the Run Transform shortcut continue to use `defaultPresetId`.
- Pick-and-run transformation remains one-shot and does not persist `defaultPresetId` or `activePresetId`.
- The Settings UI keeps `activePresetId` synchronized to the selected `defaultPresetId` so the profile editor fields target the selected default profile.

## Behavioral Definition (Confirmed from Current Code)

- Manual Home transform action (`runCompositeFromClipboard`): uses `defaultPresetId`.
- Manual transform-on-selection action: uses `defaultPresetId`.
- Pick-and-run transformation: uses a one-time picked profile and does **not** persist `activePresetId` or `defaultPresetId`.
- Recording/capture transformation pipeline: uses `defaultPresetId`.
- Run Transform shortcut (default transform hotkey): uses `defaultPresetId`.
- App restart: `defaultPresetId` persists via saved settings; `activePresetId` may persist but is not user-facing and is synchronized from Settings when the default profile is selected there.

## Rationale

- The UI no longer exposes a separate `active` concept, so keeping manual transforms bound to a hidden `activePresetId` would be confusing and non-discoverable.
- Using one user-facing selector (`default`) makes Settings copy, manual transforms, and default shortcut behavior consistent.
- Pick-and-run still preserves the one-shot override workflow without mutating user defaults.

## UI Guidance

The Settings UI should state:

- `Default profile` is used for recording/capture transforms, the Run Transform shortcut, and manual Transform actions.
- Pick-and-run remains a one-shot choice and does not change the saved default profile.

## Consequences

- `#127` includes a behavior change: manual transforms now use the default profile.
- `activePresetId` remains internal for compatibility/editor plumbing but is no longer part of the user-facing settings contract.
- `#130` remains valid because default-profile change behavior still targets `defaultPresetId`; the user-facing model is now simpler.
