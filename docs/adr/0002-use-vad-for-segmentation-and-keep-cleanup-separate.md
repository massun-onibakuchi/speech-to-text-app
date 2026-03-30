---
title: Use VAD for segmentation and keep transcript cleanup as a separate stage
description: Propose local VAD as the pre-STT speech-boundary layer while keeping filler-word cleanup out of raw transcript behavior unless users opt in.
date: 2026-03-30
status: proposed
tags:
  - adr
  - vad
  - transcription
  - product
---

# Context

Dicta's current default recording path is batch oriented:

- the renderer records a full blob with `MediaRecorder`
- the main process persists the file
- the STT provider transcribes the whole file

That path does not currently use VAD for speech gating or utterance finalization.

The user problem is twofold:

- silence and pause handling can be improved
- transcript text often contains fillers and unnecessary spoken phrasing

These are related, but they are not the same problem.

VAD detects speech boundaries. It does not rewrite spoken content. Filler removal is a text-normalization policy decision that changes transcript fidelity.

# Decision

Dicta should use VAD as a pre-transcription segmentation layer and should keep transcript cleanup as a distinct post-transcription stage.

Specific decision points:

- VAD will be treated as an audio-stage component
- VAD may trim silence, reject no-speech captures, and drive utterance boundary detection
- VAD will not be treated as a transcript cleanup feature
- raw dictation must remain faithful by default
- any filler-word removal or prose cleanup must be explicit and opt-in
- transformed output may continue to clean disfluencies as part of transformation behavior

# Consequences

Positive:

- architecture stays clear about what each stage owns
- raw dictation remains trustworthy
- streaming endpointing and batch silence trimming can be designed to share the same VAD policy family where practical, while still allowing different thresholds for file-based and streaming execution
- future local `whisper.cpp` integration has a clean place to attach VAD

Negative:

- improving transcript readability now requires an additional cleanup stage instead of one overloaded VAD feature
- users who expect raw dictation to behave like polished prose will need a separate mode or toggle
- VAD parameter tuning becomes an operational responsibility

# Options considered

## Option 1: use VAD and assume transcript quality improves enough

Rejected.

This helps with silence and segmentation, but it does not reliably remove fillers because fillers are speech.

## Option 2: silently clean all raw transcripts after STT

Rejected.

This would make output look better in some cases, but it changes the meaning of "raw dictation" and creates product ambiguity about transcript fidelity.

## Option 3: separate VAD from cleanup

Proposed.

This keeps stage ownership clear and allows Dicta to offer both faithful and cleaned text paths without misleading users.

# Implementation notes

Recommended order:

1. add local VAD before STT in the default mode
2. calibrate thresholds against Dicta test fixtures
3. add an explicit clean-dictation option after dictionary correction
4. reuse VAD policy for streaming finalization in the planned streaming pipeline

# Status notes

This ADR is proposed, not accepted. It should be accepted only when implementation scope, UX wording, and configuration defaults are approved.
