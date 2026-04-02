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
- Preserve explicit output behavior using shared copy/paste destination controls for the selected output source.
- Allow no automatic output action when both toggles are disabled.
- Treat transformation as optional, with transcription-only flow always supported.
- Preserve reliability for rapid back-to-back recordings (no dropped completed result).

## Home Surface Controls (v1)

- Home always shows `Toggle` for recording start/stop.
- Home shows `Cancel` only while recording is active.
- Home does not show separate Start/Stop buttons.
- Home does not show a Run Transformation button.

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
1. User presses the `toggleRecording` global shortcut.
2. Recording starts.
3. User speaks the intended search query.
4. User presses the `toggleRecording` global shortcut again.
5. After a short wait, transcript text becomes available.
6. If local cleanup is enabled, app attempts cleanup after dictionary replacement and before any capture-time transformation attempt.
7. If cleanup succeeds, the cleaned transcript becomes the capture transcript text.
8. If cleanup fails, times out, returns invalid output, or drops protected dictionary terms, app keeps the corrected transcript unchanged.
9. App applies transcription output rule:
   - Applies `copy_transcript_to_clipboard` if enabled.
   - Applies `paste_transcript_at_cursor` if enabled.
10. App plays recording lifecycle notification sounds:
   - recording started tone when step 2 begins.
   - recording stopped tone when step 4 completes.
11. Flow ends with output behavior matching selected toggles (copy, paste, both, or neither).

---

## Flow 2: Terminal + Japanese Speech + Auto Translation Transform

Context:
- User is interacting with a terminal-based LLM coding agent.
- A transformation profile for Japanese-to-English translation exists.
- `settings.output.selectedTextSource` is `transformed`.
- `settings.transformation.defaultPresetId` is set to the Japanese-to-English profile.

Steps:
1. User presses recording shortcut (`toggleRecording`).
2. Recording starts.
3. User speaks instructions in Japanese.
4. User ends recording with `toggleRecording`.
5. Transcription completes; because selected capture output source is `transformed`, the capture pipeline continues toward transformation using `settings.transformation.defaultPresetId`.
6. If local cleanup is enabled, app first attempts cleanup after dictionary replacement.
7. If cleanup fails, app falls back to the corrected transcript before transformation continues.
8. After a short wait, transformed English text becomes available.
9. App applies transformation output rule:
   - Applies `copy_transformed_text_to_clipboard` if enabled.
   - Applies `paste_transformed_text_at_cursor` if enabled.
10. App plays transformation completion sound (success or failure tone).
11. Flow ends with English instruction text ready for immediate use.

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

## Flow 5: Pick Transformation + Apply to Clipboard Text

Context:
- Clipboard already contains source text.
- User wants to apply a specific saved transformation immediately.
- `pickTransformation` shortcut is configured (spec semantics: pick-and-run transformation).

Steps:
1. User presses the `pickTransformation` shortcut.
2. App opens the transformation selector.
3. On macOS, opening this picker popup does not register Dicta as the frontmost app by itself.
4. User chooses the desired transformation.
5. App immediately applies the chosen profile to current clipboard text.
6. App does not persist that pick as the new default profile; picker focus memory may persist via `lastPickedPresetId`.
7. After a short wait, transformed text becomes available.
8. App applies transformation output rule:
   - Applies `copy_transformed_text_to_clipboard` if enabled.
   - Applies `paste_transformed_text_at_cursor` if enabled.
9. App plays transformation completion sound (success or failure tone).
10. Flow ends with transformed output behavior matching selected toggles.

---

## Flow 6: Open at Login

Context:
- User already set up the app to be ready immediately after system startup without manual intervention.

Steps:
1. User starts their Mac.
2. Upon login, the app launches automatically.
3. Global shortcuts become active and ready for use in background even if window is closed.

Notes:
- Expected behavior is the same for installed builds and manual runs launched from `dist/`: closing the main window should hide it (background/tray mode) rather than destroying the renderer, so global shortcuts continue to work while the app process is still running.
- Clicking the macOS menu bar icon should keep the app in tray/background mode; it must not re-open the main window by itself.
- The main window opens from the menu bar only when the user chooses `Settings...`.
- The menu bar menu also exposes quick output controls:
  - `Output Mode`: `Raw dictation` or `Transformed text`
  - `Output Destinations`: `Copy to clipboard` and `Paste at cursor`
- Changing those tray controls updates persisted settings without opening the main window.
- Global shortcuts stop only after the app is explicitly quit (for example via the tray menu) or the process exits/crashes.

---

## Flow 7: Run Transformation on Selected Text

Context:
- User has selected text in a frontmost macOS app (editor/browser/etc).
- User wants to run the default transformation preset directly against the current selection.

Steps:
1. User presses the `runTransformOnSelection` shortcut (spec semantics: run-transformation-on-selection).
2. App reads selected text via macOS Cmd+C selection flow.
3. If no text is selected, app shows actionable feedback: "No text selected. Highlight text in the target app and try again."
4. If selection read fails for runtime reasons (for example permissions/focus failure), app shows a distinct actionable read-failure message instead of the no-selection message.
5. If selected text exists, app enqueues transformation with `textSource = selection` using `settings.transformation.defaultPresetId`.
6. After processing, app applies transformed output behavior based on current output toggles.
7. App plays transformation completion sound (success or failure tone).

---

## Flow 8: Cancel Recording (No Enqueue, No Output)

Context:
- User starts recording, then decides to discard the capture.

Steps:
1. User presses `toggleRecording`.
2. Recording starts.
3. User presses `cancelRecording`.
4. Capture stops immediately and no processing job is enqueued.
5. No transcript/transformation output is produced.
6. App plays recording cancelled notification sound.

---

## Flow 9: Run Default Transformation from Clipboard

Context:
- Clipboard already contains source text.
- User triggers `runTransform` (spec semantics: run-default-transformation target).

Steps:
1. User presses `runTransform`.
2. App resolves profile from `settings.transformation.defaultPresetId`.
3. If no valid default profile can be resolved, app returns an error outcome with actionable feedback and does not call transformation.
4. If a valid default profile exists, app enqueues transformation against clipboard text using that profile snapshot.
5. After processing, app applies transformed output behavior based on current output toggles.
6. App plays transformation completion sound (success or failure tone).

---

## Flow 10: Change Default Transformation (No Execution)

Context:
- User wants to change which preset is used by future `runTransform` shortcut runs.

Steps:
1. User presses `changeDefaultTransformation` (settings key: `changeTransformationDefault`).
2. If exactly two presets exist, app toggles default to the other preset directly (no picker window).
3. If three or more presets exist, app opens preset selection UI (dedicated picker window in main process) and waits for a selection.
4. On macOS, opening this picker popup does not register Dicta as the frontmost app by itself.
5. App sets `settings.transformation.defaultPresetId` to the resolved next preset id.
6. If the default preset actually changed, app plays `skyscraper_seven-click-buttons-ui-menu-sounds-effects-button-7-203601.mp3`.
7. If picker selection is canceled or does not change the default preset, no sound plays.
8. No transformation request is enqueued during this action.
9. Later `runTransform` requests use the updated default preset.

Renderer settings note: saving a new default profile from the Settings window follows the same sound rule. The menu-click sound plays only after the save succeeds and the default preset actually changed.

---

## Flow 11: Draft in Scratch Space, Then Transform and Paste

Context:
- User is working in another macOS app and wants a temporary drafting surface before pasting transformed output back there.
- `openScratchSpace` is configured.
- A default transformation profile already exists.

Steps:
1. User presses `openScratchSpace`.
2. App opens a floating scratch-space window above the current app.
3. On macOS, opening the scratch-space popup does not register Dicta as the frontmost app by itself.
4. App restores any unfinished draft from the previous scratch-space session.
5. User types into the multi-line text area and/or uses the scratch-space speech control to insert transcript text into the draft.
6. User optionally changes the selected transformation profile using the keyboard-only profile list.
7. If the user presses `Escape`, the scratch-space window closes and the current draft remains available for next time.
8. If the user presses `Cmd+Enter`, app transforms the current draft using the selected profile.
9. Before paste, app activates the app that was frontmost before scratch space opened.
10. App pastes the transformed text into that target app.
11. App clears the scratch-space draft only after the paste succeeds.

Behavior notes:
- Scratch space always opens with the default transformation profile selected.
- Scratch-space execution forces copy-and-paste behavior even if the normal transformation output toggles are disabled.
- If transformation or paste fails, the draft remains in scratch space so the user can revise and retry.

---

## Flow 12: Enable Local Cleanup and Resolve Runtime Diagnostics

Context:
- User opens Settings to enable local transcript cleanup.
- Local cleanup uses Ollama in the first shipped phase.

Steps:
1. User opens the `Settings` tab.
2. User opens the `LLM Transformation` section and enables `Local Cleanup`.
3. App shows the cleanup provider as `Ollama`, marks API key as not required, and loads current runtime plus model diagnostics.
4. If Ollama is not installed, app shows install guidance.
5. If Ollama is installed but not running or otherwise unreachable, app shows start-or-refresh guidance.
6. If Ollama rejects diagnostics with an auth-style error, app shows auth-or-proxy guidance instead of a generic runtime failure.
7. If Ollama is reachable but no curated supported model is installed, app shows a supported-model warning instead of implying cleanup is ready.
8. If the persisted cleanup model is not currently installed, app warns the user and offers the currently installed supported models instead.
9. User may press `Refresh` after starting Ollama or installing a supported model.
10. User selects an installed supported model.
11. App autosaves the cleanup setting changes.

Flow result:
- Future capture flows attempt cleanup only after dictionary replacement.
- Any cleanup failure still falls back to the corrected transcript instead of blocking output.

---

## Cross-Flow User Guarantees

- Each completed recording produces one processed text result.
- Automatic behaviors (auto-transform, auto-paste) occur only when enabled in settings.
- Output behavior follows shared copy/paste destination controls for the selected output source.
- When both output toggles are disabled, no automatic copy/paste action occurs.
- Scratch space is the exception to the normal output toggles: its `Cmd+Enter` flow always pastes transformed text back into the pre-popup target app.
- Back-to-back completed recordings are processed independently; results are not dropped.
- Paste-at-cursor requires macOS Accessibility permission.
- Shortcut profile/text binding is immutable at enqueue time:
  - in-flight shortcut requests keep their original profile/text snapshot.
  - profile changes from `pickTransformation` only affect subsequent requests.
