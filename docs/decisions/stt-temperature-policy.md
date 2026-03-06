<!--
Where: docs/decisions/stt-temperature-policy.md
What: Decision record for STT temperature behavior across Groq and ElevenLabs adapters.
Why: Remove ambiguity and lock one consistent runtime contract.
-->

# Decision: STT Temperature Policy

Date: 2026-03-06
Status: Accepted

## Context

The STT pipeline already carries `transcription.temperature` from settings into adapter input.
Historically, Groq adapter applied this value while ElevenLabs adapter ignored it.
That created a provider-dependent hidden behavior difference.

## Decision

Apply `transcription.temperature` to both STT providers when a numeric value is present:

- Groq adapter sends multipart field `temperature`.
- ElevenLabs adapter sends multipart field `temperature`.

If `temperature` is `undefined`, adapters omit the field.

## Consequences

- Positive: one predictable cross-provider contract for temperature.
- Positive: no silent no-op for ElevenLabs.
- Risk: output characteristics can shift for ElevenLabs compared to prior behavior.

## Rejected Alternatives

1. Keep Groq-only temperature behavior.
   - Rejected because it preserves hidden asymmetry and operator confusion.

2. Remove temperature from shared settings entirely.
   - Rejected because both providers can accept decoder temperature control.

