<!--
Where: docs/decisions/2026-03-10-groq-pcm16-wav-contract-decision.md
What: Decision note for the Groq utterance WAV payload contract.
Why: T440-R4 makes the WAV bytes match the existing PCM16 contract label.
-->

# Decision: Enforce PCM16 WAV for Groq Utterance Payloads

Date: 2026-03-10

## Context

The Groq utterance contract already claimed `wav_pcm_s16le_mono_16000`, but the
upstream `@ricky0123/vad-web` default `encodeWAV(samples)` implementation emits
float32 WAV unless `format = 1` and `bitDepth = 16` are passed explicitly.

## Decision

Keep the existing public contract label and make it true:

- renderer encodes WAV with `format = 1`, `sampleRate = 16000`,
  `numChannels = 1`, `bitDepth = 16`
- main validates the WAV header so byte content cannot silently drift away from
  the declared label

## Why

This is smaller and safer than relabeling the payload format because the rest of
the Groq path already expects mono PCM16 at 16 kHz.

## Trade-off

Header validation is intentionally strict. If new WAV variants are introduced in
the future, this validator must be updated in lockstep with the shared payload
type.
