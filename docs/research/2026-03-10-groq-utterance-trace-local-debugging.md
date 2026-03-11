<!--
Where: docs/research/2026-03-10-groq-utterance-trace-local-debugging.md
What: Local usage note for the bounded Groq utterance handoff trace.
Why: Keep issue-440 repro debugging repeatable without reopening broad logging.
-->

# Groq Utterance Trace: Local Debugging Note

## What It Logs

When enabled, the app emits a single bounded event named
`streaming.groq_utterance_trace` on both renderer and main for Groq browser-VAD
utterance handoff.

Fixed field budget:

- `sessionId`
- `utteranceIndex`
- `reason`
- `wavBytesByteLength`
- `endedAtEpochMs`
- `result`

The trace never logs raw audio bytes or transcript text.

## How To Enable It Locally

Open the renderer DevTools console and run:

```js
localStorage.setItem('speech-to-text.groq-utterance-trace', '1')
location.reload()
```

To disable it again:

```js
localStorage.removeItem('speech-to-text.groq-utterance-trace')
location.reload()
```

## Result Values

- `sealed`: renderer created an utterance payload and is about to send it
- `sent`: renderer received a successful acknowledgement
- `fatal`: renderer send/handoff failed and capture is entering fatal cleanup
- `accepted`: main accepted the utterance and handed it to the session controller
- `rejected`: main rejected the utterance before or during ingress

## Typical Repro Read

- `sealed` without `accepted`: the payload did not make it through IPC/main ingress
- `accepted` without `sent`: the reply path back to renderer failed
- `rejected`: inspect the rejection message adjacent to the trace entry
- repeated `sealed` with no later progress: renderer is producing utterances but
  the handoff is blocked or failing

## Main-Process Upload Debug Events

The app now mirrors bounded main-process Groq upload milestones into the
renderer DevTools console as structured logs with `scope: "main"`. This path is
always on for streaming sessions and is the fastest way to see what happened
after `streaming.groq_vad.utterance_ready`.

Expected event flow for one healthy utterance:

- `streaming.groq_upload.accepted`
- `streaming.groq_upload.begin`
- `streaming.groq_upload.completed`
- `streaming.groq_upload.final_segment`

Failure events:

- `streaming.groq_upload.request_timed_out`
- `streaming.groq_upload.empty_transcript`
- `streaming.groq_upload.failed`
- `streaming.groq_upload.commit_failed`

How to read them:

- `utterance_ready` with no later `streaming.groq_upload.accepted`: renderer sent
  the chunk, but main ingress is not confirming receipt
- `accepted` with no `begin`: queueing or session ownership is stuck before the
  upload starts
- `begin` with `request_timed_out` or `failed`: Groq/network path failed after
  main accepted the utterance
- `completed` with `empty_transcript`: Groq replied, but the response produced no
  usable committed text
- `final_segment`: the transcript was committed and any later problem is
  downstream of transcription
