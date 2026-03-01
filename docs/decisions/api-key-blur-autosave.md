<!--
Where: docs/decisions/api-key-blur-autosave.md
What: Decision record for API key autosave on input blur across STT + LLM settings.
Why: Issue #296 removes explicit Save buttons and requires clear feedback with race-safe persistence.
-->

# Decision: API Key Autosave on Blur

## Status
Accepted - March 1, 2026

## Context
API key settings previously required explicit Save button clicks while non-secret settings used autosave. This interaction mismatch added extra steps and increased the chance of leaving a key draft unsaved when users navigated quickly between fields/providers.

Issue #296 requires:
- Save on input `blur`
- No explicit Save buttons
- Clear success/failure feedback
- No data loss during rapid focus changes

## Decision
- API key fields for all providers (Groq, ElevenLabs, Google) trigger validation + save on `blur` when a non-empty draft exists.
- Explicit API key Save buttons are removed from settings forms.
- Existing status text + toast feedback remain the source of success/failure messaging.
- Renderer mutation logic serializes save operations per provider so overlapping blur events cannot interleave writes for the same provider.
- Secure storage backend remains unchanged: main process `SecretStore` continues to persist keys via Electron `safeStorage` with existing volatile fallback when encryption is unavailable.

## Consequences
- API key UX aligns with autosave-style interactions while preserving validation-before-persist behavior.
- Rapid consecutive blur events for the same provider do not persist stale key values.
- Security posture is unchanged; no plaintext API key persistence path is introduced by this decision.
