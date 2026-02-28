<!--
Where: docs/settings-post-sunset-contract-test-matrix.md
What: Test ingress matrix for post-sunset settings schema behavior.
Why: Make #216 contract coverage explicit and auditable.
-->

# Post-Sunset Settings Contract Test Matrix (#216)

## In-Scope Ingress Paths

1. `SettingsService` startup load path (`constructor` + `v.parse(SettingsSchema, current)`)
2. `SettingsService#setSettings` save path (`validateSettings` + schema parse before persist)
3. Direct schema parse path (`v.parse(SettingsSchema, payload)` in shared contract tests)

## Covered Assertions

- Valid current payloads parse and persist successfully.
- Legacy-only incompatible payloads fail fast on startup.
- Deprecated/unknown extra keys are not persisted when payload is otherwise valid.
- Required map/object fields are enforced on load/save (including both transcription and transformation override maps).
- Provider/model constraints reject invalid combinations.

## Out of Scope

- Non-settings ingress surfaces that do not parse/persist `Settings` payloads.
- UI interaction/visual behavior tests.
