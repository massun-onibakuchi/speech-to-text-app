<!--
Where: specs/draft.md
What: Active v1 product direction plus forward-compatible scope for the macOS speech-to-text + transformation app.
Why: Keep one product-level reference while `specs/v1-spec.md` remains the implementation contract for the current v1 build.
-->

# Speech-to-Text + LLM Transformation App (v1 + Forward Compatibility)
## Project Overview

Status: Active v1 build + forward-compatible roadmap scope
Scope note: prioritize practical local usability; enterprise governance/compliance requirements are out of scope.

Implementation authority note:
- `specs/v1-spec.md` is the execution contract for the current v1 build.
- This file keeps broader product and compatibility direction for upcoming features.

### Goal

Build a macOS desktop utility that:

- Records spoken audio from the user
- Converts speech to text with cloud speech-to-text APIs
- Optionally runs configurable LLM transformations
- Outputs text to clipboard and/or pastes at the cursor
- Supports configurable global shortcuts
- Tracks low-latency goals (p95 target is TBD in active v1 plan)
- Runs as a standard app

### Product Direction (High-Level)

- Keep interaction fast: capture speech, produce text, return control to user quickly.
- Keep output behavior explicit: copy and paste are independent toggles per output type.
- Allow no automatic output action when both toggles are disabled.
- Keep output observable: processed text remains available in the app session view even when no auto output action is enabled.
- Keep transformations optional: raw transcription must remain a first-class output.
- Keep recording reliable: back-to-back recordings should both complete, with no dropped result.
- Keep mode behavior consistent within standard app mode.

### v1 Iteration Scope (Support vs Remove)

Supported in first iteration:
- Runtime stack: `Electron`
- Distribution: direct-only
- Minimum supported OS: `macOS 15+`
- Recording mode: manual
- STT providers:
  - `Groq` with model `whisper-large-v3-turbo`
  - `ElevenLabs` with model `scribe_v2`
- Transformation provider: `Google Gemini API` only.
- Transformation model: `gemini-1.5-flash-8b` only.
- Non-negotiable reliability behavior from existing flows (queue-safe back-to-back capture, output toggles, session visibility).

Removed or deferred after first iteration:
- Any additional STT providers beyond Groq and ElevenLabs (OpenAI, others).
- Any additional transformation providers (OpenAI, Anthropic, OpenRouter, others).
- Any STT model outside this v1 allowlist:
  - Groq: `whisper-large-v3-turbo`
  - ElevenLabs: `scribe_v2`
- Any transformation model outside this v1 allowlist: `gemini-1.5-flash-8b`.
- Provider-specific advanced options not required by the fixed v1 providers/models.
- Voice-activated recording mode (deferred post-v1).

---

## Definition

### What this app is

A macOS native tool that:

- Captures microphone input in batch mode
- Supports manual recording sessions in v1 (voice activation is deferred)
- Transcribes speech using cloud providers
- Applies optional transformation pipelines
- Inserts output into user workflows via clipboard/paste
- Lets users configure prompts, pipelines, shortcuts, and audio preprocessing
- Supports standard window mode

### What this app is not

- Not a mobile app
- Not a real-time streaming speech agent
- Does not require local LLM inference
- Not a web-only app

---

## Specification

## spec.yaml (Extractable File)

```yaml
app:
  name: "macOS Speech-to-Text + LLM Transformation App"
  type: "Native macOS Desktop"
  runtime_stack: "electron"
  min_macos_version: "15.0"
  release_channel: "personal_use"
  interface_modes:
    - "standard_app"
  version: "1.0.0"

user_settings:
  transcription_output:
    copy_transcript_to_clipboard: true
    paste_transcript_at_cursor: false
  transformation_output:
    copy_transformed_text_to_clipboard: true
    paste_transformed_text_at_cursor: false

  recording:
    recording_mode: "manual"
    recording_method: "ffmpeg"
    ffmpeg_dependency_strategy: "optional_post_install"
    ffmpeg_install_prompt: "auto_detect_and_guide"
    recording_device: "system_default"
    recording_output_folder: "~/Library/Application Support/<app-id>/recordings"
    ffmpeg_settings:
      output_format: "wav"
      sample_rate_hz: 16000
      channel_layout: "mono"
      codec: "pcm_s16le"
      advanced_options_enabled: true
      advanced_ffmpeg_args: ""
      command_preview_enabled: true

  sounds:
    manual_recording:
      play_on_start: true
      play_on_stop: true
      play_on_cancel: true
    completion:
      play_after_transcription: true
      play_after_transformation: true

  transcription:
    transcription_service: "groq"
    model: "whisper-large-v3-turbo"
    api_key_ref: "GROQ_API_KEY"
    compress_audio_before_transcription: true
    compression_preset: "recommended"
    compression_presets_available:
      - "recommended"
      - "preserve_audio"
      - "smallest"
      - "mp3"
    custom_ffmpeg_options: ""
    output_language: "auto"
    temperature: 0.0

  api_keys:
    tabs:
      - "all"
      - "transcription"
      - "transformation"
    providers:
      groq:
        api_key_ref: "GROQ_API_KEY"
        base_url: "https://api.groq.com/openai/v1"
      openai:
        api_key_ref: "OPENAI_API_KEY"
        base_url: "https://api.openai.com/v1"
      elevenlabs:
        api_key_ref: "ELEVENLABS_API_KEY"
      google:
        api_key_ref: "GOOGLE_API_KEY"
      anthropic:
        api_key_ref: "ANTHROPIC_API_KEY"
      openrouter:
        api_key_ref: "OPENROUTER_API_KEY"

audio_capture:
  enabled: true
  mode: "batch"
  controls:
    - "startRecording"
    - "stopRecording"
    - "toggleRecording"
    - "cancelRecording"
  silence_threshold_db: -40 # reserved for deferred voice activation mode
  max_duration_sec: "TBD"

speech_to_text:
  providers:
    - "OpenAI Whisper"
    - "ElevenLabs"
    - "Groq Whisper-compatible"
  v1_model_allowlist:
    groq:
      - "whisper-large-v3-turbo"
    elevenlabs:
      - "scribe_v2"
  config:
    detect_language: true
    min_segment_sec: 10

transformation_pipeline:
  enabled: true
  chain_order: true
  default_transform: "none"
  transforms:
    - id: "uuid1"
      name: "Default Summarize"
      provider: "google"
      model: "gemini-1.5-flash-8b"
      system_prompt: "Summarize the input"
      user_prompt: "Summarize this: {{input}}"
      options:
        temperature: 0.7
        max_tokens: 2048

keyboard_shortcuts:
  startRecording: "Cmd+Opt+R"
  stopRecording: "Cmd+Opt+S"
  toggleRecording: "Cmd+Opt+T"
  cancelRecording: "Cmd+Opt+C"
  runTransform: "Cmd+Opt+L"
  pickTransformation: "Cmd+Opt+P"
  changeTransformation: "Cmd+Opt+M"

permissions:
  microphone_access: true
  accessibility_for_global_shortcuts: true
  accessibility_for_paste_at_cursor: true

deployment:
  code_signing: true
  notarization: true
  distribution: "Direct"

metrics:
  latency_p95_target_ms: "TBD"
  success_rate_target_percent: 99.9

history:
  max_items: 10

observability:
  crash_reporting: "local_only"
```

---

## Reorganized User Settings (UI-Aligned)

This section is organized to match the actual settings experience.

### 1. Output Behavior

#### Transcription output
- `copy_transcript_to_clipboard` (toggle)
- `paste_transcript_at_cursor` (toggle)

#### Transformation output
- `copy_transformed_text_to_clipboard` (toggle)
- `paste_transformed_text_at_cursor` (toggle)

Notes:
- Paste-at-cursor requires Accessibility permission.
- If paste-at-cursor is enabled, output is pasted into the current focused target even if focus changed after recording started.
- Transcription output applies immediately after transcription finishes.
- Transformation output applies after running a saved transformation.

### 2. Recording

- `recording_mode` (v1): manual
- `recording_method` (select): ffmpeg
- `ffmpeg_dependency_strategy`: optional post-install dependency with guided setup
- `recording_device` (select): system microphone device
- `recording_output_folder` (path picker)

#### FFmpeg settings
- Output profile: `output_format`, `sample_rate_hz`
- Advanced options: `advanced_ffmpeg_args`
- Live command preview: generated ffmpeg command from current selections

### 3. Sounds

#### Manual recording sounds
- `play_on_start`
- `play_on_stop`
- `play_on_cancel`

#### Completion sounds
- `play_after_transcription`
- `play_after_transformation`

### 4. Transcription

- `transcription_service` (v1 allowlist: `groq`, `elevenlabs`)
- `model` (v1 allowlist by provider):
  - `groq` -> `whisper-large-v3-turbo`
  - `elevenlabs` -> `scribe_v2`
- `api_key_ref`
- `compress_audio_before_transcription` (toggle)
- `compression_preset` (recommended/preserve_audio/smallest/mp3)
- `custom_ffmpeg_options`
- `output_language` (auto or explicit locale)
- `temperature`

### 5. API Keys

Tabs:
- `all`
- `transcription`
- `transformation`

Per-provider fields:
- Groq: API key + base URL override
- ElevenLabs: API key
- Google: API key

v1 scope note:
- Groq or ElevenLabs key is required for STT (depending on selected STT provider).
- Google key is required for Gemini transformation.

### 6. Global Shortcuts

- `startRecording`
- `stopRecording`
- `toggleRecording`
- `cancelRecording`
- `runTransform`
- `pickTransformation`
- `changeTransformation`

### 7. Interface Mode

- `standard_app`

---

## Summary

The settings model is now specific and UI-aligned:
- Output toggles are separated for transcription and transformation.
- Each output type uses two independent toggles: copy to clipboard and paste at cursor.
- If both toggles are disabled for an output type, no automatic output action is performed.
- Processed output remains visible in app session view even when both toggles are disabled.
- Recording and FFmpeg controls are explicit, with optional post-install FFmpeg dependency flow.
- Sound notifications are split into manual-recording and completion groups.
- Transcription controls include compression, language, and temperature.
- API key management is organized by tabs and provider-level fields.
