<!--
Where: specs/user-flow.md
What: Final v1 user-facing flow specification for recording/transcription/transformation interactions.
Why: Lock expected personal-use behavior in clear, user-observable flows.
-->

# User Flow Specification (Final v1)

## Scope

This document defines narrative user flows from the user's point of view.
These flows are direction-setting examples, not exhaustive acceptance tests.
Personal-use scope: prioritize practical local behavior and fast iteration.

## Direction Alignment

- Focus on fast capture-to-text turnaround.
- Preserve explicit output behavior using independent copy/paste toggles per output type.
- Allow no automatic output action when both toggles are disabled.
- Treat transformation as optional, with transcription-only flow always supported.
- Preserve reliability for rapid back-to-back recordings (no dropped completed result).

Global output rule used in all flows:
- If `copy_*_to_clipboard` is enabled, text is copied to clipboard.
- If `paste_*_at_cursor` is enabled, text is pasted at cursor when ready.
- If both are enabled, both actions occur.
- If both are disabled, no automatic output action occurs.

---

## Flow 1: Browser Search via Manual Recording

Context:
- User has a web browser open and the cursor in a search input.
- Manual recording mode is active.

Steps:
1. User presses the `startRecording` global shortcut.
2. Recording starts.
3. User speaks the intended search query.
4. User presses the `stopRecording` global shortcut.
5. After a short wait, transcript text becomes available.
6. App applies transcription output rule:
   - Applies `copy_transcript_to_clipboard` if enabled.
   - Applies `paste_transcript_at_cursor` if enabled.
7. Flow ends with output behavior matching selected toggles (copy, paste, both, or neither).

---

## Flow 2: Terminal + Japanese Speech + Auto Translation Transform

Context:
- User is interacting with a terminal-based LLM coding agent.
- A transformation profile for Japanese-to-English translation exists.
- `transformationProfiles.defaultProfileId` is set to the Japanese-to-English profile, so transformation runs automatically after transcription.

Steps:
1. User presses recording shortcut (`startRecording` or `toggleRecording`).
2. Recording starts.
3. User speaks instructions in Japanese.
4. User ends recording with the toggle/stop shortcut.
5. Transcription completes; because `defaultProfileId` is set, the bound profile's transformation executes automatically.
6. After a short wait, transformed English text becomes available.
7. App applies transformation output rule:
   - Applies `copy_transformed_text_to_clipboard` if enabled.
   - Applies `paste_transformed_text_at_cursor` if enabled.
8. Flow ends with English instruction text ready for immediate use.

---

## Flow 3: Rapid Consecutive Recordings (Back-to-Back)

Context:
- User performs two recordings in quick succession (~0.1s gap).
- Auto-paste behavior is enabled for transcription output.
- Queue behavior is required (no cancellation of earlier recording result).

Steps:
1. User starts recording A.
2. User speaks a short sentence.
3. User stops recording A.
4. Within ~0.1 seconds, user starts recording B.
5. User speaks another sentence.
6. User stops recording B.
7. Both recordings complete independently.
8. When result A is ready, app applies transcription output rule for A.
9. When result B is ready, app applies transcription output rule for B.
10. Both outputs are delivered; neither output is dropped.

Behavior note:
- Visible output order follows completion order.

---

## Flow 4: Voice Activation Mode (Deferred beyond v1)

> **Note:** Voice-activated recording is out of scope for v1 per spec section 1. This flow is retained for future reference only.

Context:
- Voice activation mode is enabled.
- Auto-stop-on-silence is enabled.
- Preconfigured transformation is enabled to run automatically after speech processing.

Steps:
1. App waits for speech.
2. User begins speaking.
3. Recording starts automatically.
4. User continues speaking.
5. User stops speaking; silence timeout is reached.
6. Recording stops automatically.
7. After a short wait, transformed text becomes available.
8. App applies transformation output rule:
   - Applies `copy_transformed_text_to_clipboard` if enabled.
   - Applies `paste_transformed_text_at_cursor` if enabled.
9. App returns to waiting state for the next voice-triggered session.

---

## Flow 5: Select Transformation + Apply to Clipboard Text

Context:
- Clipboard already contains source text.
- User wants to apply a specific saved transformation immediately.
- A composite shortcut is configured to combine transformation selection and execution.

Steps:
1. User presses the composite shortcut that performs selection and execution in one action.
2. App opens the transformation selector.
3. User chooses the desired transformation.
4. App immediately applies the chosen transformation to current clipboard text.
5. After a short wait, transformed text becomes available.
6. App applies transformation output rule:
   - Applies `copy_transformed_text_to_clipboard` if enabled.
   - Applies `paste_transformed_text_at_cursor` if enabled.
7. Flow ends with transformed output behavior matching selected toggles.

---

## Flow 6: Open at Login

Context:
- User already set up the app to be ready immediately after system startup without manual intervention.

Steps:
1. User starts their Mac.
2. Upon login, the app launches automatically.
3. Global shortcuts become active and ready for use in background even if window is closed.

---

## Flow 7: Run Transformation on Selected Text

Context:
- User has selected text in a frontmost macOS app (editor/browser/etc).
- User wants to run the active transformation profile directly against the current selection.

Steps:
1. User presses the `runTransformationOnSelection` shortcut.
2. App reads selected text via macOS Cmd+C selection flow.
3. If no text is selected, app shows actionable feedback: "No text selected. Highlight text in the target app and try again."
4. If selected text exists, app enqueues transformation with `textSource = selection` using current active profile.
5. After processing, app applies transformed output behavior based on current output toggles.

---

## Cross-Flow User Guarantees

- Each completed recording produces one processed text result.
- Automatic behaviors (auto-transform, auto-paste) occur only when enabled in settings.
- Output behavior follows independent copy/paste toggles per output type.
- When both output toggles are disabled, no automatic copy/paste action occurs.
- Back-to-back completed recordings are processed independently; results are not dropped.
- Paste-at-cursor requires macOS Accessibility permission.
