<!--
Where: specs/ui-components-requirements.md
What: UI component requirements derived from latest manual testing feedback.
Why: Define implementation-ready UI requirements before coding.
-->

# UI Component Requirements (v1 Feedback Pass)

## 1. Purpose

This document translates latest testing feedback into concrete UI requirements for the next implementation pass.

Goals:
- Make recording/transform flows discoverable and operable.
- Add missing configuration surfaces (API keys, transformation setup, audio source).
- Reduce noise (remove Session Activity panel from default Home).
- Improve error visibility with toast notifications.

## 2. Information Architecture

Required page structure:
1. `Home` page (operational controls only)
2. `Settings` page (all configuration)

Navigation requirements:
- Top-level nav must expose `Home` and `Settings`.
- Default route on launch: `Home`.
- Settings access must be available even when recording is disabled.

## 3. Home Page Components

### H-01 Recording Control Card

Purpose:
- Start/stop/toggle/cancel recording.

Requirements:
- If `recording.ffmpeg_enabled=false`, `Start` and `Toggle` are disabled.
- Disabled state must show clear inline reason: "Recording is disabled. Enable it in Settings > Recording."
- Include CTA button/link: `Open Settings`.
- Show current recording state badge (`Idle`, `Recording`, `Busy`, `Error`).

User inputs:
- Click: `Start`, `Stop`, `Toggle`, `Cancel`
- Click: `Open Settings`

### H-02 Transform Action Card

Purpose:
- Run transformation from clipboard and display status.

Requirements:
- Button must be disabled when transformation prerequisites are missing (no API key / disabled transform).
- Disabled state must explain why and link to Settings.
- Show last transform status summary.
- Button action must execute transform on the current clipboard topmost text.
- Shortcut trigger and button trigger must execute the same behavior.

User inputs:
- Click: `Run Composite Transform`
- Click: `Open Settings`

### H-03 Recent Results Panel (Replace Session Activity)

Purpose:
- Show recent processing outputs, not internal activity logs.

Requirements:
- Remove current Session Activity panel from default Home.
- Display recent persisted jobs (status + transcript/transformed preview).
- Include filters for status and search.

User inputs:
- Change: status filter
- Input: text search
- Click: refresh

## 4. Settings Page Components

### S-01 Provider API Keys Section

Purpose:
- Configure credentials required for STT and transformation.

Requirements:
- Inputs for:
  - Groq API key
  - ElevenLabs API key
  - Google Gemini API key
- Secret-style input masking with show/hide control.
- Save/test status per key.
- Clear error messages for invalid/missing key.

User inputs:
- Input: API keys
- Click: show/hide
- Click: save
- Click: test connection

### S-02 Transformation Configuration Section

Purpose:
- Make transformation behavior configurable and visible.

Requirements:
- Controls for:
  - `enabled` toggle
  - transformation preset list (multiple saved entries)
  - create/edit/delete transformation preset
  - select default transformation preset
  - run selected transformation preset
  - transform model selection (allowlist, per preset)
  - `system prompt` multiline input
  - `user prompt` multiline input
- Shortcut binding editor for:
  - run default transformation
  - pick-and-run transformation
  - change default transformation
- Prompt inputs must support normal text editing, copy/paste, and newline preservation.
- Prompt inputs must persist across app restart once saved.
- Show effective transformation status on save.

User inputs:
- Toggle: transformation enabled
- Click: add/remove transformation preset
- Select: transformation preset
- Select: default transformation preset
- Click: run selected transformation
- Select: transformation model
- Input: system prompt
- Input: user prompt
- Input: shortcut bindings
- Click: save

### S-03 Recording & FFmpeg Section

Purpose:
- Preserve forward-compatible recording section while clarifying FFmpeg is not implemented in v1.

Requirements:
- FFmpeg controls must not be presented as functional in v1.
- Show explicit status: "Recording via FFmpeg is not implemented in v1."
- Recording controls in Home must show consistent disabled/unsupported behavior while this limitation exists.
- Include pointer to roadmap/post-v1 support note.

User inputs:
- Click: view roadmap/info link

### S-04 Output and Shortcut Section

Purpose:
- Keep output behavior and shortcuts configurable in one place.

Requirements:
- Existing output matrix controls for transcript/transformed copy/paste.
- Shortcut reference and editable bindings where supported.

User inputs:
- Toggle: output matrix options
- Input: shortcut bindings
- Click: restore defaults

## 5. Cross-Cutting UI Requirements

### X-01 Toast Notifications

Requirements:
- Global toast system for `error`, `success`, `info`.
- Error toast is mandatory for:
  - recording blocked (FFmpeg disabled/missing)
  - missing API key on transform/transcription
  - transformation failure
  - provider network failure
- Toasts must be non-blocking and dismissible.

### X-02 Error UX

Requirements:
- Every blocked action must include:
  - user-readable reason
  - next step
  - settings deep-link when relevant

### X-03 Empty and Disabled States

Requirements:
- No blank panels.
- Disabled controls always include explanation text.

## 6. Implementation Ticket Chunks

1. `UI-F1` Home/Settings page split + navigation.
2. `UI-F2` Settings API key components + secure save/test flow.
3. `UI-F3` Transformation configuration UI and state (enabled/model/auto-run/system prompt/user prompt).
4. `UI-F4` Recording/FFmpeg section updated for v1 unsupported-state UX.
5. `UI-F5` Replace Session Activity with Recent Results panel.
6. `UI-F6` Global toast/error system and deep-link actions.

## 7. Acceptance Checklist

- Home and Settings are separate pages.
- API key settings are discoverable and usable.
- Transformation configuration exists and is editable, including `system prompt` and `user prompt`.
- Multiple transformation presets can be created and one default preset can be selected.
- Shortcut-triggered transformation executes current clipboard topmost text.
- Session Activity is removed from Home default view.
- FFmpeg section clearly communicates unsupported status in v1.
- Error toasts appear on all blocked/failing actions.
- Recording cannot start silently; failures always explain why.
