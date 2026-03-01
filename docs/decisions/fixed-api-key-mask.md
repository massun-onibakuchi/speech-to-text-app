<!--
Where: docs/decisions/fixed-api-key-mask.md
What: Decision record for fixed-length API key mask rendering.
Why: Issue #297 requires non-inferable key length in masked UI state.
-->

# Decision: Fixed-Length API Key Mask

## Status
Accepted - March 1, 2026

## Context
Masked API key fields previously used a short decorative token, which did not represent a strict redaction contract across all forms.

Issue #297 requires masked API keys to display as exactly 50 `*` characters so key length cannot be inferred from UI.

## Decision
- Introduce a shared renderer constant `FIXED_API_KEY_MASK`.
- Set `FIXED_API_KEY_MASK` to 50 asterisks.
- Reuse this constant in all masked API key fields (Google + STT provider forms).
- Add tests to enforce the 50-character mask contract.

## Consequences
- Mask rendering is consistent across all provider forms.
- UI no longer leaks key length via mask length.
- Future redaction changes have a single source of truth.
