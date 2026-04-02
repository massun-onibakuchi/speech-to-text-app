---
title: Investigate silent local cleanup failure in capture flow
description: Trace the local cleanup path from Settings through capture execution, identify why enabling cleanup appears to do nothing, and document the confirmed product and debugging gaps.
date: 2026-04-02
status: concluded
links:
  decision: "0003"
tags:
  - research
  - local-llm
  - cleanup
  - ollama
  - debugging
---

# Summary

The reported behavior is real: users can enable local transcript cleanup even when Dicta already knows cleanup cannot run, and any runtime or model failure then falls back to the corrected transcript without any user-visible signal.

That combination creates the exact failure shape in the report:

- user enables local cleanup
- transcript output remains unchanged
- capture still ends as `succeeded`
- toast still says `Transcription complete.`
- Settings offers only weak diagnostics and no in-app recovery path

I did not find evidence that the `Refresh` button is literally disconnected. The stronger problem is that refresh provides so little feedback, and the cleanup pipeline hides so many failure states, that users can reasonably conclude the button does not work.

# Scope and method

I read the local cleanup rollout docs that exist in the repo:

- `docs/adr/0003-local-llm-cleanup-runtime-and-fallback.md`
- `docs/research/004-local-llm-cleanup-electron.md`

The requested `docs/plans/0004-local-llm-cleanup-rollout.md` file does not exist in this checkout.

I then traced the flow across:

- renderer Settings UI
- preload and IPC boundary
- main-process local cleanup diagnostics
- capture snapshot creation
- capture pipeline cleanup execution
- history and renderer terminal feedback

Files read in depth:

- `src/renderer/settings-output-react.tsx`
- `src/preload/index.ts`
- `src/shared/ipc.ts`
- `src/shared/local-llm.ts`
- `src/shared/domain.ts`
- `src/main/ipc/register-handlers.ts`
- `src/main/core/command-router.ts`
- `src/main/routing/capture-request-snapshot.ts`
- `src/main/orchestrators/capture-pipeline.ts`
- `src/main/services/local-llm/ollama-local-llm-runtime.ts`
- `src/renderer/native-recording.ts`
- related tests and E2E coverage

# Expected flow

Per `specs/spec.md` and `specs/user-flow.md`, cleanup is best-effort only:

- cleanup runs after dictionary replacement
- any failure falls back to the corrected transcript
- Settings should show actionable diagnostics rather than implying cleanup is ready

That fallback rule is correct on its own. The bug is not the fallback itself. The bug is that the current implementation combines fallback with weak gating and weak diagnostics, so failures are effectively invisible.

# Confirmed findings

## 1. High: cleanup can be enabled even when the app already knows it cannot run

Evidence:

- The cleanup toggle is always interactive in `src/renderer/settings-output-react.tsx:239`.
- The model selector is disabled when runtime health is bad or no supported model is installed in `src/renderer/settings-output-react.tsx:326-330`.
- The UI shows warnings, but it still allows `cleanup.enabled = true` in those failure states.

Why this is a bug:

- The product allows an impossible-to-succeed configuration.
- If Ollama is missing, unreachable, or has no supported installed model, every capture will deterministically fall back.
- From the user perspective, the feature looks enabled but never produces a visible effect.

User impact:

- Matches the report exactly: "I enable local transcription/local cleanup and nothing changes."

Spec alignment:

- This weakens the requirement in `specs/spec.md` that Settings show actionable diagnostics instead of implying cleanup is ready.

## 2. High: cleanup failure is silent because the pipeline downgrades it to success

Evidence:

- `applyOptionalCleanup` catches every runtime error and returns the corrected transcript in `src/main/orchestrators/capture-pipeline.ts:247-285`.
- Invalid cleanup output also falls back to the corrected transcript in `src/main/orchestrators/capture-pipeline.ts:258-269`.
- The only immediate signal is a main-process structured warning log.
- When history is later projected into the renderer, `terminalStatus === 'succeeded'` produces a success activity item and a `Transcription complete.` toast in `src/renderer/native-recording.ts:218-233`.

Why this is a bug:

- The best-effort fallback is intentional, but the failure is hidden from the user.
- The user cannot distinguish:
  - cleanup succeeded but made no edits
  - cleanup never ran because Ollama was unavailable
  - cleanup failed because the model was missing
  - cleanup ran but returned invalid JSON

User impact:

- Silent fallback is the main reason the feature appears broken.
- It is also the main reason the issue is hard to debug from the UI alone.

## 3. High: the common "model not installed" state has no in-app recovery path

Evidence:

- Runtime status only reports installed supported models through `getLocalCleanupStatus` in `src/main/ipc/register-handlers.ts:307-341`.
- The Settings UI only warns and links out when no supported model is installed in `src/renderer/settings-output-react.tsx:304-315`.
- If the persisted model is missing, the UI warns but offers no install action in `src/renderer/settings-output-react.tsx:317-343`.
- The runtime adapter has no model-pull capability; it only healthchecks, lists models, and runs cleanup in `src/main/services/local-llm/ollama-local-llm-runtime.ts:56-145`.

Why this is a bug:

- The most predictable first-run failure mode is "Ollama exists but the curated model is not installed."
- The app detects that state but cannot resolve it.
- The user feedback requesting "pull model if model is not installed yet" points directly at this missing product path.

User impact:

- Users are stranded in a warning state and must leave the app to fix it.
- Combined with finding 2, the app then keeps presenting fallback output as if nothing went wrong.

External feasibility note:

- Ollama documents a model-pull API, so this is not blocked by the runtime platform itself.

## 4. Medium: refresh is implemented, but it provides almost no proof that anything happened

Evidence:

- The `Refresh` button calls `refreshCleanupStatus()` in `src/renderer/settings-output-react.tsx:279-285`.
- `refreshCleanupStatus()` does re-fetch diagnostics and updates component state in `src/renderer/settings-output-react.tsx:33-40`.
- There is no loading state, no disabled state during the request, no success toast, no failure toast, and no timestamp or delta indicator.

Why this is a bug:

- The control technically performs work, but it does not give the user enough feedback to confirm that work.
- If status text remains unchanged, the button appears dead.

Conclusion on the report:

- I could not prove a literal wiring bug for `Refresh`.
- I could prove a UX/debugging bug severe enough that users can reasonably report it as broken.

## 5. Medium: runtime diagnostics are collapsed too aggressively to support debugging

Evidence:

- The main handler first healthchecks, then lists models in `src/main/ipc/register-handlers.ts:307-341`.
- If `listModels()` fails after a healthy check, the handler returns `health.ok = false`, an empty model list, and a mapped generic code in `src/main/ipc/register-handlers.ts:330-340`.
- `mapLocalCleanupStatusCode` only preserves `runtime_unavailable` and `server_unreachable` in `src/main/ipc/register-handlers.ts:390-398`.
- The renderer guidance then reduces failures to broad strings such as `Start Ollama, then refresh.` or `Install Ollama, then refresh.` in `src/renderer/settings-output-react.tsx:376-394`.

Why this is a bug:

- Distinct remediation states collapse together:
  - Ollama not installed
  - Ollama installed but daemon not running
  - supported model absent
  - selected model missing at inference time
  - cleanup response invalid
- The app knows more than it tells the user.

User impact:

- Debugging requires log inspection or source reading instead of the product UI.

# End-to-end failure trace

This is the current failure path for the reported issue:

1. User opens Settings and enables local cleanup.
2. The toggle saves even if Ollama is unavailable or no supported model is installed.
3. Capture snapshot copies `settings.cleanup` as-is in `src/main/core/command-router.ts:269-282`.
4. Capture pipeline calls the local runtime when `cleanup.enabled === true` in `src/main/orchestrators/capture-pipeline.ts:243-256`.
5. If runtime access fails or output is invalid, the pipeline logs a warning and returns the corrected transcript.
6. History still records the job as `succeeded`.
7. Renderer shows the transcript text and a success toast.
8. User concludes cleanup either did nothing or is broken.

# Non-findings

## I did not confirm a dead refresh handler

The code path for `Refresh` is wired end to end:

- preload exposes `getLocalCleanupStatus`
- IPC registers `local-cleanup:get-status`
- Settings calls the IPC API on mount and on button press

The stronger problem is lack of observable feedback, not lack of invocation.

## I did not find a persistence bug in cleanup settings

Cleanup settings are present in:

- shared schema
- defaults
- settings service normalization
- autosave path

The issue is not that the setting fails to save. The issue is that saved settings can represent a knowingly broken runtime state.

# Root cause

The implementation optimized for "never block transcript delivery" but stopped there.

The missing pieces are:

- readiness gating before enablement
- in-app recovery for missing models
- user-visible cleanup failure reporting
- richer diagnostic states
- refresh feedback strong enough to prove that a re-check actually happened

Without those pieces, best-effort fallback becomes silent feature failure.

# Recommended follow-up order

## 1. Prevent impossible enablement

- Disable the cleanup toggle when Ollama is unavailable or when no supported model is installed.
- Alternatively, allow the toggle only after the user explicitly acknowledges degraded behavior, but plain disablement matches the feedback better.

## 2. Surface cleanup fallback as degraded success, not pure success

- Keep transcript delivery best-effort.
- Add a user-visible signal when cleanup was skipped or failed.
- Record cleanup outcome in history so the renderer can tell "completed with cleanup fallback" from "completed with cleanup applied."

## 3. Add an in-app model installation path

- Support pulling curated models from the Settings surface.
- At minimum, provide a one-click action for the selected supported model.

## 4. Upgrade diagnostics and refresh feedback

- Add loading state and completion feedback for refresh.
- Preserve richer failure codes across IPC.
- Show the precise actionable state in Settings.

# Review note

An independent explorer review reached the same core findings:

- impossible enablement
- silent fallback presented as success
- no in-app model recovery
- refresh feels broken because it lacks feedback
- diagnostics are too weak for debugging
