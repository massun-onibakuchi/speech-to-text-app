# Where: docs/qa/streaming-raw-dictation-manual-checklist.md
# What: Manual QA checklist for PR-8 raw streaming UX and release hardening.
# Why: Raw streaming has renderer/runtime/browser/system integration points that need explicit
#      operator validation beyond the focused automated test matrix.

## Setup

- Build from the PR-8 branch with the current streaming tickets merged.
- Verify both `processing.mode=default` and `processing.mode=streaming` are available in Settings.
- Test at least one local provider session and one Groq rolling-upload session when credentials are available.

## Default-Mode Regression

- Confirm batch raw dictation still records, stops, submits one blob, and lands in history.
- Confirm batch transformed output still works when `output.selectedTextSource=transformed`.
- Confirm transform-only shortcuts still run without starting a streaming session.
- Confirm switching from Streaming back to Default restores the existing batch output preferences.

## Streaming Start And Stop

- Enable Streaming mode with `local_whispercpp_coreml`.
- Press `toggleRecording` once and confirm:
  - renderer capture starts immediately
  - status bar shows `stream:starting` then `stream:active`
  - activity feed shows session start/active entries
- Press `toggleRecording` again and confirm:
  - session stops cleanly
  - no duplicate-start error appears
  - batch history does not receive a blob submission
- Start again and press `cancelRecording` instead. Confirm the session abort path is distinct from normal stop in activity text.

## Pause Chunking Without Auto-Stop

- Start streaming and speak several phrases separated by short pauses.
- Confirm raw dictation segments continue committing after pauses.
- Confirm the microphone session stays active until explicit stop/cancel.
- Confirm a pause causes chunk finalization but does not stop capture.

## Accessibility And Focus

- Deny Accessibility permission, then stream into a focused text field.
- Confirm the renderer surfaces an actionable streaming error that references Accessibility guidance.
- Restore Accessibility permission and repeat.
- Stream with focus on a supported text field and confirm finalized segments paste in order.
- Move focus away from a supported text target and confirm failures are actionable rather than silent.

## Long Session And Duplicate Suppression

- Run one streaming session for at least 10 minutes.
- Confirm the renderer stays responsive and new finalized segments keep appearing in order.
- Confirm duplicate segment activity entries do not appear for the same `sessionId + sequence`.
- Confirm stopping after a long session still tears down capture, status, and activity cleanly.

## Provider-Specific Checks

- Local `whisper.cpp + Core ML`:
  - verify the session reaches `active`
  - verify at least three finalized segments paste successfully
  - verify provider crash paths show actionable errors
- Groq rolling-upload:
  - verify each natural pause emits one finalized chunk and the session stays active afterward
  - verify repeated phrase-pause-phrase sequences continue emitting later chunks in the same session
  - verify uninterrupted Groq speech does not invent an artificial mid-speech chunk before a real pause or explicit stop
  - verify a Groq auth/network failure appears as a streaming error toast and activity entry
  - verify the UX never claims Groq is a native realtime session API
  - verify stopping during active speech commits at most one final utterance before the session ends
  - verify cancel during active speech ends the session without committing a final utterance
  - simulate a slow network and verify backlog pause/resume activity appears instead of silent stalling
  - verify backlog recovery resumes live dictation without dropping later utterances
  - verify a quiet/short utterance near a misfire boundary does not leak a ghost stop chunk
  - verify a false-start misfire does not poison the next valid utterance
