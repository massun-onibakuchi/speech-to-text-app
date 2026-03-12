<!--
Where: docs/research/2026-03-12-vad-mic-harness-and-library-options.md
What: Pipeline summary, manual harness instructions, and replacement-library research for browser VAD.
Why: Preserve the reasoning behind the live-mic repro tool and document stable options before changing VAD vendors.
-->

# VAD Mic Harness And Library Options

Date: 2026-03-12

## Current app pipeline

The live Groq/browser VAD path in this repo is:

1. [native-recording.ts](/workspace/.worktrees/vad-mic-test-harness/src/renderer/native-recording.ts) starts the streaming session and creates a renderer sink for utterance IPC.
2. `src/renderer/groq-browser-vad-capture.ts` acquires the `MediaStream`, starts `MicVAD`, encodes MicVAD-sealed audio to WAV, and pushes sealed utterances.
3. `src/main/ipc/register-handlers.ts` validates and forwards browser-VAD utterances into the active streaming session.
4. `streaming-session-controller` hands utterances to the provider adapter.
5. `groq-rolling-upload-adapter` uploads each utterance independently and emits ordered transcript segments downstream.

The bug class reported so far is mostly above step 3. Missing utterances often never reach the main-process upload path, which is why the new harness stops at the renderer capture layer and records exactly what the capture layer believed happened.

## `epicenter-main.zip` reference flow

The bundled reference app uses a thinner VAD ownership split in `apps/whispering/src/lib/state/vad-recorder.svelte.ts`:

1. Acquire the `MediaStream` outside `MicVAD`.
2. Pass that stream into `MicVAD.new(...)`.
3. Let `onSpeechEnd(audio)` own speech-pause sealing.
4. Encode the sealed audio immediately to WAV.
5. Destroy the VAD instance and stop the stream directly on shutdown.

That reference does not build a second utterance-boundary state machine around `MicVAD`. This repo now follows that same destroy-only stop contract.

The reference archive also pins `@ricky0123/vad-web` to `^0.0.24`. This repo
now uses `0.0.24` as well so the app and harness run against the same
frame-based MicVAD API shape as the reference implementation.

One practical difference from newer `vad-web` releases is asset loading:
`0.0.24` forwards a wasm directory prefix into `onnxruntime-web@1.14.0`, so the
renderer build must emit the original `ort-wasm*.wasm` filenames without Vite
hashing. This repo now does that explicitly in `electron.vite.config.ts`.

## Harness design

The new harness lives in `src/renderer/vad-mic-debug-harness.tsx` and is launched by:

```bash
pnpm run dev:vad:mic
```

It intentionally runs the real `startGroqBrowserVadCapture(...)` path, not a direct `MicVAD.new(...)` demo, because the integration seam is the thing we need to debug. The page gives you:

- browser microphone selection
- live config overrides for the key MicVAD thresholds
- `Start listening`, `Stop listening`, and `Cancel without flush`
- a capped event log from the capture layer
- a local list of emitted utterance chunks
- a bounded post-seal frame summary so the second-utterance bug can distinguish
  “no frames after utterance 0” from “frames continued but never re-armed”

The harness defaults intentionally follow this app's current production tuning
so manual repros match the real Groq path:

- `positiveSpeechThreshold: 0.5`
- `negativeSpeechThreshold: 0.35`
- `redemptionMs: 768`
- `preSpeechPadMs: 96`
- `minSpeechMs: 288`

The debug event stream is optional production code. It only activates when the caller supplies `onDebugEvent`, so normal app behavior remains unchanged.

## Recommended manual checks

1. Start listening, speak one short sentence, and confirm:
   - `speech_start`
   - frame events
   - `speech_real_start`
   - `speech_end`
   - `utterance_chunk`
   - `utterance_sent`
2. Speak two separate sentences with a pause and confirm two utterances appear with incrementing indices.
3. Start speaking and hit `Stop listening` mid-utterance to confirm the session tears down without synthesizing a trailing utterance.
4. Start speaking and hit `Cancel without flush` to ensure no terminal utterance is emitted.
5. Leave the page idle, then restart listening several times to look for lifecycle regressions after repeated `destroy()`/restart cycles.

## Alternative VAD library options

### Best replacement candidate: Picovoice Cobra

Why it fits:

- Actively maintained browser/Electron JavaScript SDK.
- Purpose-built VAD rather than a generic speech-event heuristic.
- Stable API surface for frame-by-frame probability scoring.
- Better fit if we want tighter ownership over frames and stop semantics than `MicVAD` provides.

Tradeoffs:

- Commercial licensing/runtime key management.
- Replacement would require us to own chunking and pause-boundary logic ourselves.
- Different model/runtime than the current Silero-based path, so expect retuning work.

### Strong fallback if we move VAD out of the renderer: native `webrtcvad`

Why it fits:

- Mature WebRTC algorithm.
- Good option if we decide browser audio lifecycle is the unstable part and want VAD in a Node/native lane.

Tradeoffs:

- Not a drop-in browser replacement.
- Requires PCM framing, native module packaging, and Electron rebuild discipline.
- Larger operational cost than the current all-renderer path.

### Lightweight but less accurate: `hark`

Why it fits:

- Very simple browser integration.
- Emits speech start/stop events with minimal setup.

Tradeoffs:

- Energy/volume driven rather than modern neural VAD.
- Good for rough speaking indicators, not ideal for transcript-grade utterance sealing.
- I would not choose it as the primary path for Groq dictation quality.

## Recommendation

Stay on `@ricky0123/vad-web` for the immediate bug hunt and use the new harness to determine whether the remaining failures are:

- browser audio lifecycle issues around repeated start/stop
- asset/runtime initialization issues
- callback ordering or missing callbacks after the first utterance

If we need a replacement after that evidence pass:

1. Pick Picovoice Cobra if we want another browser/Electron VAD and can accept commercial constraints.
2. Pick native `webrtcvad` only if we are willing to move VAD to a lower-level PCM pipeline outside the renderer.
3. Do not switch to `hark` unless the requirement drops from transcript-quality utterance sealing to simple speaking-state detection.

## 2026-03-12 production alignment

The Groq browser-VAD path now stays as close as practical to the Epicenter
reference:

- `@ricky0123/vad-web` `0.0.24`
- `model: 'v5'`
- default v5 thresholds and frame timings
- `submitUserSpeechOnPause: true`
- pre-acquired `16 kHz` mono stream
- `onSpeechEnd(audio)` is the only utterance-seal path
- `onVADMisfire()` resets state only; the app does not salvage or synthesize an utterance

The remaining debug hooks are observational only. They exist for the harness and
do not change MicVAD boundary decisions.
