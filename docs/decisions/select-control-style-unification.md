<!--
Where: docs/decisions/select-control-style-unification.md
What: Decision record for select-like control style unification across renderer tabs.
Why: Remove legacy style drift and keep one canonical select implementation path (#255).
-->

# Decision: Use one shared select-control class token across Audio Input, Profiles, and Settings

- Date: 2026-03-01
- Status: Accepted
- Related issue: #255

## Context
- Select controls in Audio Input, Profiles, and Settings used different class combinations (`h-7` vs `h-8`, `bg-background` vs `bg-input`, mixed focus-ring rules).
- The visual drift increased maintenance cost and produced inconsistent hover/focus/disabled states.

## Decision
- Introduce `src/renderer/select-control.ts` as the single source of select-like styling tokens.
- Use `SELECT_CONTROL_CLASS` for standard selects and `SELECT_CONTROL_MONO_CLASS` for mono text variants.
- Remove per-component ad-hoc select class branches in:
  - `SettingsRecordingReact`
  - `SettingsSttProviderFormReact`
  - `ProfilesPanelReact`

## Consequences
- Select controls now share a consistent token/state baseline across all in-scope tabs.
- Future select updates happen in one place, reducing divergence risk.
- Business logic and selection handlers remain unchanged (style-only refactor).
