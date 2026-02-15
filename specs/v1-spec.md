<!--
Where: specs/v1-spec.md
What: Finalized implementation spec for v1, synthesized from specs/spec.md and specs/user-flow.md.
Why: Keep one development-ready contract for behavior, settings, and acceptance tests.
-->

# Speech-to-Text App v1 Spec (Finalized)

## 1. Inputs and Precedence

Source documents:
- `specs/spec.md` (broader product direction and forward-compatibility scope)
- `specs/user-flow.md` (user-observable behavior reference; voice-activation flow is deferred for active v1)

Precedence rules:
- This file (`specs/v1-spec.md`) is the implementation authority for the active v1 build.
- `specs/spec.md` remains authoritative for forward-looking scope and future compatibility planning.
- If documents differ on current v1 behavior, this file takes precedence.

## 2. Product Goal and Scope

Goal:
- Build a macOS utility that records speech, transcribes via cloud STT, optionally transforms with Gemini, and returns text through configurable clipboard/paste behaviors with low perceived latency.

In scope (v1):
- macOS native app behavior in both interface modes:
  - `standard_app`
  - `menu_bar_utility`
- STT providers/models:
  - Groq + `whisper-large-v3-turbo`
  - ElevenLabs + `scribe_v2`
- Transformation provider/model:
  - Google Gemini API + `gemini-1.5-flash-8b`
- Transformation presets:
  - users can create multiple saved transformation settings
  - users can choose one preset as default
  - users can select a preset via shortcut and execute selected/default preset
- Simplified output behavior settings for final text:
  - copy to clipboard
  - paste at cursor
- Global shortcuts and open-at-login behavior.
- Normal recording path that does not require FFmpeg.

Out of scope (v1):
- Additional providers or models beyond the allowlist.
- FFmpeg-based/advanced recording integration (deferred to post-v1).
- Voice-activated recording mode.
- Real-time streaming speech agent behavior.
- Non-macOS platforms.
- Enterprise governance/compliance features.
- Processing history/session activity feature set.

Operational environment requirement (v1):
- VPN usage is required in normal operation environments for this project.
- App does not modify VPN routing; split-tunnel configuration is user-managed.
- For Groq in VPN-constrained environments, split-tunnel must allow `api.groq.com`.
- Runtime stack is fixed to `Electron`.
- Distribution for v1 is direct distribution only (no Mac App Store packaging target).
- Minimum supported OS is `macOS 15+`.

## 3. Non-Negotiable Behavioral Guarantees

These must hold in all flows:
- Every completed recording produces exactly one processed result.
- Back-to-back completed recordings are processed independently; results are not dropped.
- Recording remains available in v1 without requiring FFmpeg installation.
- Shortcut-triggered transform and button-triggered transform execute the same path.
- Automatic behaviors (auto-transform, auto-paste) only happen when enabled in settings.

## 4. Functional Requirements

### 4.1 Recording Lifecycle

- Commands supported:
  - `startRecording`
  - `stopRecording`
  - `toggleRecording`
  - `cancelRecording`
- In v1, normal recording must be available without FFmpeg dependency.
- If FFmpeg-specific options are shown for forward compatibility, they must be clearly marked optional/deferred and must not block normal recording.

### 4.2 Processing Pipeline

Pipeline:
1. Capture audio.
2. Run STT using selected v1 provider/model.
3. Optionally run configured transform (default transform or explicit selection flow).
4. Apply output rule from settings.

Rules:
- Transcription-only output is always supported.
- Transformation is optional.
- Flow 5 behavior is required:
  - user can trigger a combined transform-select-and-run shortcut on clipboard text
  - shortcut execution uses clipboard topmost/current text
  - selected transformation (or default transformation) is executed.
- Processing history/session persistence is not a v1 requirement.

### 4.3 Output Behavior (Simplified)

Output behavior uses one settings-defined policy for final text:
- `copy_to_clipboard=true`, `paste_at_cursor=false` -> copy only
- `copy_to_clipboard=false`, `paste_at_cursor=true` -> paste only
- `copy_to_clipboard=true`, `paste_at_cursor=true` -> copy then paste
- `copy_to_clipboard=false`, `paste_at_cursor=false` -> no automatic output action

Permission guard:
- Paste-at-cursor requires macOS Accessibility permission.
- If paste is enabled but permission is missing, show actionable error and keep app stable.
- If paste-at-cursor is enabled, paste applies to the currently focused target even if focus changed after recording started.

### 4.4 Interface and Startup Behavior

- Behavior parity requirement: core capture/process/output semantics are consistent across `standard_app` and `menu_bar_utility`.
- Open-at-login support is required.
- After login auto-launch, global shortcuts must be active even if the main window is closed.

## 5. Runtime Architecture (Implementation Contract)

Required logical modules:
- `HotkeyService`: registers global shortcuts and dispatches commands.
- `CaptureService`: provides normal recording capture path without FFmpeg dependency.
- `JobQueueService`: queues completed captures; guarantees no dropped completed result.
- `TranscriptionService`: provider adapter calls and transcription normalization.
- `TransformationService`: Gemini transform execution and prompt/template application.
- `OutputService`: clipboard/paste application from simplified output settings.
- `PermissionService`: microphone/accessibility checks and user-facing guidance.
- `SecretStore`: API key persistence in macOS Keychain.
- `NetworkCompatibilityService`: provider reachability diagnostics and VPN/split-tunnel guidance.

Concurrency and ordering:
- Queue ownership must be single-writer (actor/serialized worker) to avoid state races.
- Results can complete out of start order; terminal state ordering must remain deterministic and observable.

## 6. Settings Contract (v1)

```yaml
recording:
  mode: manual # v1 fixed mode
  method: native_default
  device: system_default
  auto_detect_audio_source: true
  detected_audio_source: system_default
  max_duration_sec: TBD
  ffmpeg_integration:
    status: deferred_optional
    blocks_recording: false

transcription:
  provider: groq # groq | elevenlabs
  model_allowlist:
    groq: [whisper-large-v3-turbo]
    elevenlabs: [scribe_v2]
  compress_audio_before_transcription: true
  compression_preset: recommended
  output_language: auto
  temperature: 0.0
  network_retries: 2

transformation:
  enabled: true
  active_preset_id: default
  default_preset_id: default
  presets:
    - id: default
      name: Default
      provider: google
      model: gemini-1.5-flash-8b
      system_prompt: ""
      user_prompt: "{{input}}"
      shortcut: Cmd+Opt+L
  shortcut_behavior:
    pick_and_run: Cmd+Opt+P
    change_default: Cmd+Opt+M

output:
  copy_to_clipboard: true
  paste_at_cursor: false
  target_text: transformed_or_transcript_fallback

shortcuts:
  runTransform: configurable_per_preset
  pickTransformation: configurable
  changeTransformationDefault: configurable

interface_mode:
  value: standard_app # standard_app | menu_bar_utility

runtime:
  min_macos_version: "15.0"
  distribution: direct_only
  crash_reporting: local_only
```

Validation rules:
- Reject unsupported providers/models at settings load.
- Require provider API keys before executing provider calls.
- Keep simplified output settings consistent and valid.
- Transformation preset list must allow multiple entries and exactly one default.
- Shortcut-triggered transformation must execute on current clipboard text.
- In v1, recording actions must work without FFmpeg.
- Settings UI must expose API key inputs for Groq, ElevenLabs, and Google Gemini.
- No processing history/session activity requirement in v1.

## 7. External Provider Contracts (Verified)

### 7.1 Groq STT

- Endpoint: `POST https://api.groq.com/openai/v1/audio/transcriptions`
- Required multipart fields:
  - `file`
  - `model=whisper-large-v3-turbo`
- Optional fields used in v1: `language`, `temperature`, `response_format`.

### 7.2 ElevenLabs STT

- Endpoint: `POST https://api.elevenlabs.io/v1/speech-to-text`
- Required multipart fields:
  - `file`
  - `model_id=scribe_v2`
- Role in v1: user-selectable STT provider, no automatic provider fallback.

### 7.3 Gemini Transformation

- Endpoint: `POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
- v1 model: `gemini-1.5-flash-8b`
- Auth: `x-goog-api-key` header.
- Request shape: `contents[].parts[].text` with optional `generationConfig`.

## 8. Error Handling and Reliability Policy

- Failed job outcomes must be explicit (`capture_failed`, `transcription_failed`, `transformation_failed`, `output_failed_partial`).
- A completed capture must always reach a terminal processing state (success or explicit failure); no silent drops.
- End-to-end processing success target is `99.9%`.
- No silent provider switching when selected provider fails.
- Output failure in one action (copy or paste) must not erase available text or final result visibility for the active flow.
- For Groq network failures in VPN contexts, surface actionable diagnostics including split-tunnel guidance for `api.groq.com`.
- Retry policy for transient provider/network errors is fixed to 2 retries.

## 9. Acceptance Tests (Required)

Automated tests:
1. Back-to-back reliability:
   - Simulate two recordings with <=100 ms gap.
   - Assert both jobs reach terminal states and neither result is dropped.
2. Output behavior correctness:
   - Verify all four copy/paste combinations for the simplified final output behavior.
3. Allowlist enforcement:
   - Reject non-v1 providers/models in settings load and runtime selection.
4. Accessibility gate:
   - With paste enabled and accessibility missing, assert actionable error and no crash.
5. Flow 5 composite transform shortcut:
   - Assert select-and-run behavior applies chosen transform to current clipboard text in one user action.
6. VPN Groq connection-failure diagnostics:
   - Simulate DNS/connect/TLS failure to `api.groq.com`.
   - Assert actionable split-tunnel guidance is emitted.
   - Assert no automatic provider switch occurs.
7. Transformation preset behavior:
   - Create multiple transformation presets and assert one default is enforced.
   - Change default preset and assert subsequent run-transform shortcut uses new default.
   - Trigger pick-and-run shortcut and assert selected preset executes on current clipboard text.
8. Shortcut behavior:
   - Verify shortcuts are configurable and active after change.
   - Verify fixed/non-functional shortcut regressions are prevented.
9. Recording availability behavior in v1:
   - Trigger recording actions and assert capture starts and can be stopped normally without FFmpeg.
10. API key settings visibility:
   - Assert Settings includes inputs for Groq, ElevenLabs, and Google Gemini API keys.

Manual validation (mapped to user flows):
1. Flow 1 manual browser search behavior.
2. Flow 2 Japanese speech -> auto-translation transform behavior.
3. Flow 3 rapid consecutive recordings behavior.
4. Flow 6 open-at-login shortcut readiness behavior.
5. VPN ON + split-tunnel OFF for Groq:
   - Confirm Groq reachability diagnostics appear.
6. VPN ON + split-tunnel ON for `api.groq.com`:
   - Confirm Groq transcription path succeeds.

## 10. Exit Criteria

- All required automated tests pass.
- Manual validation for flows 1, 2, 3, and 6 passes.
- Automated validation for Flow 5 composite behavior passes (selected/default preset on clipboard topmost text).
- VPN manual validation for Groq split-tunnel OFF/ON scenarios passes.
- Automated validation confirms no processing history/session activity dependency in active v1 behavior.
- Behavior matches applicable cross-flow guarantees from `specs/user-flow.md` for active v1 scope.
- Scope remains inside v1 allowlists from `specs/spec.md`.
