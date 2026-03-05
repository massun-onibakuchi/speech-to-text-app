<!--
Where: docs/research/all-possible-user-flow-path-research.md
What: Comprehensive implementation-grounded research for all user-visible and shortcut-driven flows/paths.
Why: Establish a current source of truth before any implementation changes.
-->

# Research: All Possible User Flow/Path (Current Implementation)

Date: March 5, 2026

## 1. Scope and method

This document maps all practical user flows in the current app implementation, including:

1. Renderer UI navigation paths.
2. Global shortcut and tray-triggered paths.
3. Main-process command routing and pipeline paths.
4. Success, fallback, and failure branches.
5. Edge-case gates (permissions, API keys, missing data, concurrency, and stale-state protections).

Ground truth used:
- `src/renderer/*` (surface behavior, guards, toasts, autosave, local recording state).
- `src/main/*` (IPC, hotkeys, queues, orchestration, output side effects, tray/window lifecycle).
- `src/shared/*` (contracts, settings schema, failure categories).

This is implementation research, not a product proposal.

## 2. Runtime topology at flow level

## 2.1 Trigger origins

Every user-observable flow begins from one of these origins:

1. Renderer UI action.
2. Global shortcut callback in main.
3. Tray menu action (`Settings`, `Quit`, tray click to show window).
4. App lifecycle event (boot, activate, second-instance).

## 2.2 Flow buses

1. Renderer-to-main request bus: `window.speechToTextApi.*` IPC invoke/send.
2. Main-to-renderer event bus: `onRecordingCommand`, `onCompositeTransformStatus`, `onHotkeyError`, `onSettingsUpdated`, `onOpenSettings`.
3. Deferred processing buses:
- Capture jobs: FIFO `CaptureQueue`.
- Transform jobs: concurrent `TransformQueue`.

## 2.3 Critical invariants

1. Recording command surface is strictly `toggleRecording | cancelRecording`.
2. Capture snapshot is immutable at enqueue time.
3. Standalone transform snapshot is immutable at enqueue time.
4. Capture output commits are sequence-ordered (via `SerialOutputCoordinator`).
5. Transform queue jobs are parallel and may complete out-of-order.
6. Main window close hides app (non-quit) so shortcuts keep working.

## 3. App lifecycle and window/tray paths

## 3.1 Boot path

Trigger: app launch.

Path:
1. `AppLifecycle.initialize()` acquires single-instance lock.
2. On `whenReady`:
- `app.setLoginItemSettings({ openAtLogin: true })`.
- IPC handlers register.
- main window created.
- tray created.
- hotkeys registered from settings.

Success outcome:
- App is visible and fully interactive.
- Tray exists.
- Shortcuts active.

Failure outcomes:
1. Single-instance lock fails -> app quits.
2. Settings schema invalid at startup -> error dialog and app quits.

## 3.2 Close/minimize/activate paths

1. User closes window (red close): window hides unless app is quitting.
2. User clicks dock icon or app activates: hidden window is shown/focused.
3. Tray click: show/focus window.
4. Tray `Settings`: show/focus window and emit `onOpenSettings` to renderer.
5. Tray `Quit`: normal quit path; global hotkeys unregistered on `will-quit`.

## 4. Renderer navigation and local UI paths

## 4.1 Tabs and route guard

Tabs: `activity`, `profiles`, `shortcuts`, `audio-input`, `settings`.

Path:
1. Tab click/value change requests navigation.
2. If leaving `profiles` with dirty draft, guard dialog blocks transition.
3. User chooses `Stay`, `Discard`, or `Save and continue`.
4. On successful save/discard, pending tab transition proceeds.

Side behavior:
- Navigating to `activity` triggers API-key status refresh retries (3 attempts, 250ms delay).

## 4.2 Startup hydration path

Trigger: renderer start.

Path:
1. IPC listeners are wired before async boot fetches.
2. Parallel requests: `ping`, `getSettings`, `getApiKeyStatus`.
3. Settings normalization repairs invalid preset pointers if needed.
4. Audio-source refresh runs.
5. Shell renders.

Failure:
- Initialization error renders a dedicated failure card.

## 4.3 Toast and activity paths

1. Toast queue max visible: 4.
2. Auto-dismiss: 6s.
3. Transform non-terminal ack (`Transformation enqueued.`) shows toast only, not activity item.
4. Terminal transform success/failure adds activity + toast.

## 5. Recording command flows

All recording starts/stops are renderer-native `MediaRecorder` actions driven by `onRecordingCommand` dispatch events from main.

## 5.1 Toggle start (idle -> recording)

Trigger:
- Home button (toggle) or global shortcut `toggleRecording`.

Path:
1. Main routes command via `CommandRouter.runRecordingCommand`.
2. Main broadcasts `recording:on-command` with optional preferred device id.
3. Renderer `handleRecordingCommandDispatch` receives toggle.
4. `startNativeRecording` validates gates:
- settings loaded,
- recording method supported (`cpal`),
- STT provider key present,
- Google key present when output source is `transformed`,
- browser media APIs available.
5. Device id resolved (configured + fallback logic).
6. `getUserMedia` + `MediaRecorder.start()`.
7. Recording-start cue sound and success toast.

Blocked/failure branches:
1. Missing STT key -> actionable error toast.
2. Missing Google key for transformed output -> actionable error toast.
3. Unsupported media environment/method -> error toast.
4. Any runtime failure -> `hasCommandError=true`, error toast.

## 5.2 Toggle stop (recording -> queued processing)

Trigger:
- Home button while recording or global shortcut toggle.

Path:
1. MediaRecorder stop event fires.
2. If `shouldPersistOnStop=true` and chunks exist, renderer submits captured audio via IPC.
3. Main persists capture file and enqueues capture snapshot.
4. Renderer plays stop cue, shows queued toast.
5. Renderer polls `history:get` for matching `capturedAt` terminal entry:
- initial poll: 8 attempts x 600ms,
- follow-up: 24 attempts x 1000ms after interim info toast.
6. Terminal record mapped to user-facing message and activity entry.

## 5.3 Cancel recording (recording -> no enqueue)

Trigger:
- Home `Cancel` or global shortcut `cancelRecording`.

Path:
1. Set `shouldPersistOnStop=false`.
2. Stop recorder.
3. No `submitRecordedAudio` call.
4. Play cancel cue.
5. Info toast `Recording cancelled.`

Idle cancel branch:
- If not recording, show info toast `Recording is not in progress.`

## 6. Capture pipeline paths (queued job)

Trigger: `submitRecordedAudio` from renderer stop flow.

Path stages:
1. Snapshot enqueue (FIFO).
2. STT preflight: key/model/provider checks.
3. STT transcription network call.
4. Optional LLM transformation stage if snapshot binds a transformation profile.
5. Ordered output commit.
6. History append with terminal status + failure metadata.
7. Completion sound policy.

## 6.1 Terminal statuses and branches

Possible terminal statuses:
1. `succeeded`.
2. `transcription_failed`.
3. `transformation_failed`.
4. `output_failed_partial`.

Failure categories where applicable:
- `preflight`, `api_auth`, `network`, `unknown`.

Important branch:
- If transformation fails but transcript exists, transcript still becomes output candidate (fallback path), while terminal status remains `transformation_failed`.

## 6.2 Output-source selection branch

Capture output source is selected by `settings.output.selectedTextSource`:
1. `transcript` -> transcript output rule.
2. `transformed` -> transformed output rule if transformed text exists.
3. `transformed` selected but no transformed text -> fallback to transcript using shared selection utility.

## 7. Standalone transformation flows

Standalone transforms are shortcut-driven in main and run through concurrent `TransformQueue`.

## 7.1 Run default transform from clipboard (`runTransform`)

Path:
1. Hotkey callback runs `commandRouter.runDefaultCompositeFromClipboard()`.
2. Router resolves default preset and reads clipboard text.
3. Validation branches:
- no preset -> immediate error result,
- empty clipboard -> immediate error result.
4. Valid request -> immutable transform snapshot enqueued.
5. Immediate non-terminal ack result broadcast to renderer.
6. Async final result broadcast when job completes.

## 7.2 Run transform on selected text (`runTransformOnSelection`)

Path:
1. In-flight gate prevents concurrent selection reads.
2. `SelectionClient` reads selected text by probe clipboard + Cmd+C automation.
3. Branches:
- selection read throws -> read-failed guidance message,
- empty selection -> no-text-selected message,
- valid text -> enqueue transformation.
4. Async final result broadcast.

Notes:
- Clipboard is restored after selection read (best effort).
- This path is macOS-specific (`darwin` check in selection client).

## 7.3 Pick-and-run transform (`pickTransformation`)

Path:
1. In-flight gate prevents concurrent picker sessions.
2. Focused preset id resolves by priority:
- `lastPickedPresetId` if valid,
- otherwise `defaultPresetId` if valid,
- otherwise first preset.
3. Picker window opens.
4. User selects profile or cancels/times out.
5. If selected:
- persist `lastPickedPresetId` only,
- broadcast settings-updated,
- run one-off transform using selected preset,
- do not change default preset.

## 7.4 Change default transform (`changeTransformationDefault`)

Branches:
1. No preset -> error result.
2. Exactly 2 presets -> toggle to the other preset.
3. 3+ presets -> open picker to choose.
4. If chosen preset equals current default -> success message `already`.
5. Else persist `defaultPresetId` and broadcast settings-updated.

## 8. Output side-effect paths (copy/paste)

`OutputService.applyOutputWithDetail` behavior:

1. Both destinations false -> no side effects, success.
2. Copy true and/or paste true -> clipboard write occurs.
3. Paste true path:
- accessibility permission check,
- if missing permission -> `output_failed_partial` with guidance,
- else run paste automation with 2 attempts and 150ms retry delay,
- repeated failure -> `output_failed_partial` with detailed guidance.

Implementation nuance:
- Paste requires clipboard write even when `copyToClipboard=false`.

## 9. Settings and profile-management paths

## 9.1 Non-secret autosave path

Trigger: shortcut/output/audio/provider/model changes from renderer.

Path:
1. Apply local patch.
2. Validate settings-form inputs.
3. If invalid:
- cancel pending autosave,
- show one-time validation toast,
- keep local invalid state for correction.
4. If valid:
- debounce 450ms,
- call `setSettings`,
- on success update persisted snapshot + success toast,
- on failure rollback to last persisted snapshot + error toast.

## 9.2 Secret API key path

Trigger: save/delete key in settings panels.

Path:
1. Per-provider operation queue serializes concurrent save/delete requests.
2. Save:
- validate connectivity first,
- then persist key,
- refresh key status.
3. Delete:
- delete key,
- refresh key status.

Failures surface as provider-specific status text + error toasts.

## 9.3 Profile CRUD path

1. Save existing profile draft:
- validates name/system/user prompt (`{{text}}` required),
- on success persists via `setSettings`.
2. Create profile:
- builds new id,
- validates fields,
- appends preset and persists.
3. Delete profile:
- last-profile delete blocked,
- if deleting default, fallback default is assigned and surfaced via info toast,
- `lastPickedPresetId` normalized.
4. Set default profile from profiles tab:
- persists default id directly.

## 10. Audio-source paths

1. Renderer refresh combines main-discovered and browser-discovered audio inputs.
2. Dedupe + always include system default source.
3. Hint text reflects detected source count.
4. Main discovery caches for 30s and falls back to system default only on errors.

## 11. Main-to-renderer synchronization paths

Renderer listens for:

1. `onCompositeTransformStatus`:
- transform ack/final statuses.
2. `onRecordingCommand`:
- trigger local recorder actions.
3. `onHotkeyError`:
- user-visible shortcut error toasts.
4. `onSettingsUpdated`:
- invalidate pending autosave,
- fetch latest settings,
- replace local persisted snapshot.
5. `onOpenSettings`:
- route to settings tab.

Key guarantee:
- External main-side settings mutations (e.g., hotkey-driven preset changes) are reconciled back into renderer state.

## 12. Concurrency and race-management map

1. CaptureQueue serial drain prevents capture-job overlap.
2. TransformQueue parallelism keeps shortcut transforms non-blocking.
3. Ordered output coordinator ensures capture output commit order by sequence.
4. Selection transform in-flight gate avoids overlapping Cmd+C selection probes.
5. Pick-and-run in-flight gate avoids concurrent picker sessions.
6. Autosave generation invalidation prevents stale debounced writes from clobbering fresher settings.
7. Profile unsaved-draft guard prevents accidental tab-leave data loss.

## 13. Exhaustive user-facing trigger matrix

1. Home recording button:
- toggle start/stop path.
2. Home cancel link:
- cancel path.
3. Home blocked-state `Open Settings` action:
- route to settings tab without starting recording.
4. Tab rail:
- navigation + profile-draft guard branch.
5. Settings forms:
- autosave or API-key save/delete paths.
6. Profiles panel:
- create/edit/delete/default paths.
7. Activity list copy action:
- clipboard copy path.
8. Global shortcut `toggleRecording`:
- dispatch to renderer recording toggle.
9. Global shortcut `cancelRecording`:
- dispatch to renderer cancel.
10. Global shortcut `runTransform`:
- clipboard transform.
11. Global shortcut `runTransformOnSelection`:
- selection transform.
12. Global shortcut `pickTransformation`:
- picker + one-off transform.
13. Global shortcut `changeTransformationDefault`:
- default-selection update path.
14. Tray click:
- show main window.
15. Tray settings:
- show window + settings route event.
16. Tray quit:
- quit lifecycle path.

## 14. Known non-goals and explicitly absent paths

1. No voice-activated recording flow in runtime.
2. No streaming mode runtime flow (capture mode is default/manual path).
3. No renderer-exposed manual transform button/path.
4. No start/stop recording command variants beyond toggle/cancel.

## 15. Documentation drift findings addressed in this update

1. `specs/user-flow.md` referenced a non-existent picker UX spec file.
2. Some docs/plans still described legacy removed command/channel flows (`startRecording`/manual transform IPC), and are now removed from active docs set.

## 16. Practical conclusion

The implementation provides one recording pipeline (renderer-native capture -> main capture queue) and three standalone transform shortcut families (default clipboard, selection, pick-and-run), with resilient queueing, explicit failure typing, and settings synchronization hooks to keep renderer/main state coherent.
