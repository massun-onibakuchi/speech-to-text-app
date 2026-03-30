---
title: VAD and transcription quality for Dicta
description: Separate what VAD improves from what transcript cleanup improves, then map both stages onto Dicta's current batch and planned streaming pipelines.
date: 2026-03-30
status: active
review_by: 2026-04-06
tags:
  - research
  - vad
  - transcription
  - quality
---

# VAD and transcription quality for Dicta

## Summary

Current Dicta batch recording does not run VAD in the raw-dictation or transformed-text path. The renderer records one `MediaRecorder` blob, the main process persists it, and the selected cloud STT adapter transcribes the full file.

That means the current product has no speech gating, no pause-based segmentation, and no local utterance-finalization step in the default mode.

The main conclusion from this research is:

- VAD can improve latency, silence handling, and speech-boundary quality.
- VAD does not remove filler words such as "um", "uh", "like", or false starts, because those are real speech.
- filler cleanup should be modeled as a separate transcript-normalization stage, not as VAD.

## Current product state

Files examined:

- `src/renderer/native-recording.ts`
- `src/main/core/command-router.ts`
- `src/main/services/transcription-service.ts`
- `src/main/services/transcription/groq-transcription-adapter.ts`
- `specs/spec.md`

Observed behavior:

- recording starts in the renderer with browser `MediaRecorder`
- on stop, the renderer sends a full audio blob through `submitRecordedAudio`
- the main process persists the audio file and enqueues the batch capture pipeline
- the selected STT adapter uploads the whole file to the provider transcription endpoint
- there is no local speech detection pass before upload
- there is no pause-bounded chunking in the default mode

This confirms the current batch path is still capture-then-upload, not VAD-driven endpointing.

## What VAD actually does

Voice activity detection classifies short audio windows as speech or non-speech. In practice, that makes it useful for:

- trimming leading and trailing silence
- ignoring obvious background-only regions
- deciding when a user has paused long enough to finalize an utterance
- splitting long captures into smaller speech-bounded segments
- reducing how much non-speech audio reaches the STT engine

For Dicta, the useful mental model is:

- VAD improves segmentation
- STT improves word recognition
- cleanup improves readability

## What VAD does not solve

VAD will not reliably remove:

- filler words
- repeated words
- self-corrections
- informal spoken phrasing

Those are spoken tokens, not silence. If the user says "um I think we should maybe ship it tomorrow", a good VAD system should still treat that as speech.

If the product goal is cleaner prose, the missing stage is transcript cleanup, not stronger VAD.

## Relevant external findings

### Groq transcription API

Groq's transcription endpoint accepts one uploaded file plus optional `language`, `prompt`, `response_format`, and `temperature` parameters. Their docs explicitly say:

- providing `language` improves accuracy and latency
- `prompt` can guide style or continue a previous segment
- `verbose_json` is available when richer transcript output is needed

Implication for Dicta:

- the current adapter is already using `language`, `temperature`, and a limited prompt path
- batch Groq transcription is still file-based; it does not by itself provide the local speech-boundary behavior the user is asking about

Source:

- https://console.groq.com/docs/api-reference

### whisper.cpp VAD support

`whisper.cpp` documents a VAD mode where audio first passes through a VAD model, then only detected speech segments are sent to Whisper. The project documents threshold, minimum speech duration, minimum silence duration, maximum speech duration, padding, and overlap controls.

Implication for Dicta:

- local VAD is a practical fit for the planned `local_whispercpp_coreml` path
- similar segmentation policy can also be used ahead of batch cloud uploads if we want silence-trimmed default-mode transcription, but that cloud path would need a separate VAD component rather than direct reuse of whisper.cpp's internal VAD pipeline

Source:

- https://github.com/ggml-org/whisper.cpp

### Silero VAD

Silero VAD is positioned as a lightweight, fast speech detector and is explicitly documented for edge, mobile, browser, and voice-interface use cases.

Implication for Dicta:

- a local VAD stage is realistic on-device
- it is suitable as a speech gate or utterance-boundary detector, but should not be treated as transcript rewriting logic

Source:

- https://github.com/snakers4/silero-vad

## Product implications

### 1. Use VAD to improve the audio that reaches STT

VAD should sit before transcription, not after it.

Recommended uses in Dicta:

- trim leading silence before upload
- trim trailing silence after stop
- suppress clearly non-speech-only spans
- in streaming mode, finalize segments after stable silence windows

### 2. Do not use VAD as the answer to filler-heavy transcripts

If the complaint is "the transcript contains too many fillers and unnecessary words", the needed solution is a cleanup stage with a product policy:

- `faithful transcript`: preserve spoken words
- `clean dictation`: remove disfluencies and normalize spoken prose lightly

That distinction matters because removing fillers changes meaning and should not silently happen in a mode labeled "raw dictation".

### 3. Treat raw and transformed output differently

Recommended behavior:

- raw dictation should stay faithful by default
- transformed text can continue to use the transformation step to remove filler words and improve phrasing
- if users want cleaner non-LLM transcript output, add a separate opt-in cleanup mode rather than mutating raw transcript behavior

## Recommended application to Dicta

### Phase 1: low-risk improvement in default mode

Add a local pre-STT VAD pass after recording stops and before the file is sent to the provider.

Recommended behavior for the first pass:

- keep the current push-to-start, push-to-stop UX
- keep the single capture lifecycle and history model
- run local VAD on the recorded file
- trim leading and trailing silence
- preserve short pauses inside speech
- optionally reject captures with no detected speech

Why this first:

- minimal user-facing behavior change
- immediate reduction in silence-heavy uploads
- lower risk than introducing pause-bounded chunking into the default path

### Phase 2: optional clean-dictation text stage

Add an explicit transcript-normalization stage after dictionary correction and before output selection.

Recommended scope:

- remove common disfluencies
- collapse repeated words
- normalize punctuation and casing
- keep named entities and domain terms intact

Recommended product rule:

- disabled for `raw dictation` by default
- opt-in as a separate output mode or transcript refinement toggle

### Phase 3: streaming mode endpointing

For `processing.mode=streaming`, use local VAD as the utterance-boundary detector that drives finalization.

Recommended behavior:

- partial text remains incremental
- final text emits only after a configurable silence window
- segment padding and overlap are applied to avoid clipped word boundaries
- transformed streaming remains gated behind its existing prerequisites

This matches the current spec direction that separates true streaming architecture from simple pause-bounded chunk uploads.

## Proposed defaults

If Dicta implements local VAD, start with conservative defaults:

- speech threshold: start from the VAD implementation's default threshold, then tune for recall over aggressiveness
- minimum speech duration: initial evaluation range around 150-300 ms to filter very short accidental bursts
- minimum silence duration: initial evaluation range around 400-800 ms to avoid chopping natural pauses
- speech padding: initial evaluation range around 100-250 ms before and after detected speech
- overlap: modest overlap only when segment splitting is enabled, with an initial evaluation range around 50-150 ms

The exact values should be calibrated with recorded Dicta fixtures, not copied blindly from another project.

## Risks

- aggressive VAD can cut off word edges and make transcripts worse
- silence-splitting in default mode can change user expectations if one recording yields multiple transcript segments
- cleanup that removes fillers in "raw" mode can violate user trust
- browser-side VAD alone is not enough if the canonical pipeline still uploads the untrimmed file

## Recommendation

Adopt VAD as an audio-quality and segmentation component, not as a text cleanup component.

For the product:

1. add local VAD before STT in the default mode
2. keep raw dictation faithful by default
3. add optional clean-dictation normalization as a separate text stage
4. use VAD-driven endpointing for the planned streaming path

This gives Dicta a cleaner architecture:

- audio cleanup before STT
- transcript cleanup after STT
- transformation after transcript selection when requested
