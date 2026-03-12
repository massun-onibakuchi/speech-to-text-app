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
