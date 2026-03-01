<!--
Where: docs/decisions/api-key-redaction-after-save.md
What: Decision record for API key field redaction behavior after successful save.
Why: Issue #247 requires saved keys to remain hidden by default in Settings.
-->

# Decision: Redact API Keys After Save (#247)

**Date**: 2026-03-01  
**Status**: Accepted  
**Ticket**: #247

## Decision

Use always-redacted display when a provider key is saved and no new draft is being edited:
- show masked value indicator (`••••••••`);
- disable visibility toggle while in redacted mode so unknown persisted secrets cannot be revealed;
- switch to editable draft mode when the user focuses/types to replace;
- clear plaintext draft and return to redacted mode when save status becomes `Saved`.

## Consequences

- saved-key presence remains explicit (`Saved`/`Not set`) without exposing plaintext;
- users can still replace a key directly by typing a new draft;
- renderer tests lock both STT-provider and Google-key redaction flows;
- provider-switch regression coverage ensures unsaved plaintext drafts do not leak between providers.
