<!--
Where: docs/decisions/remove-endpoint-overrides-contract.md
What: Decision record for removing STT/LLM endpoint override settings and runtime usage.
Why: Issue #248 removes endpoint override support without backward compatibility.
-->

# Decision: Remove Endpoint Override Contract (#248)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #248

## Context

Endpoint override settings introduced cross-layer complexity and are no longer part of the supported product contract.

## Decision

Remove endpoint override support end-to-end:
- delete STT/LLM override fields from `Settings` schema/defaults;
- remove renderer inputs/validation/state wiring for override drafts;
- remove runtime resolver usage and bind `baseUrlOverride: null` in orchestration snapshots/calls.

## Consequences

- provider defaults are now the only endpoint source;
- legacy override keys in persisted payloads are stripped by schema parsing;
- no compatibility path is maintained for old override payloads.
