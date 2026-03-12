<!--
Where: docs/qa/issue-440-r1-packaged-repro-checklist.md
What: Manual packaged-app verification checklist for the Issue 440 renderer crash containment fix.
Why: T440-R1 must prove the fix in the packaged runtime, not only in dev-mode tests.
-->

# Issue 440 R1 Packaged Repro Checklist

## Goal

Prove that the first sealed Groq browser-VAD utterance no longer crashes the
packaged renderer with `Illegal invocation`.

## Setup

- Build or install the packaged app from the `T440-R1` branch artifacts.
- Select the Groq streaming provider path that uses browser VAD.
- Open DevTools or collect renderer logs.

## Steps

1. Start recording.
2. Speak one short phrase.
3. Pause long enough for a natural `speech_pause` utterance to seal.
4. Watch the renderer log stream through the first utterance handoff.

## Expected

- `streaming.groq_vad.start_begin` appears.
- `streaming.groq_vad.start_complete` appears.
- `streaming.groq_vad.utterance_ready` appears for `reason: "speech_pause"`.
- No renderer `TypeError: Illegal invocation` is thrown.
- No immediate fatal cleanup is triggered from the first utterance push.
- No secondary uncaught renderer promise error appears during this exact step.

## Not Covered by This Ticket

- fatal-stop reason truthfulness
- malformed/null IPC payload handling
- WAV format contract correction
- timestamp semantics
