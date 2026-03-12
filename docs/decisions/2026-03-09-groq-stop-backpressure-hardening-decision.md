<!--
Where: docs/decisions/2026-03-09-groq-stop-backpressure-hardening-decision.md
What: Decision note for the T440-05 stop and backpressure hardening pass.
Why: The Groq utterance-native path needs explicit rules for bounded upload drain,
     renderer-visible backpressure, and in-flight utterance stop behavior.
-->

# Decision: Groq Stop Uses Pre-Ack Queue Relaxation And Bounded Commit Backlog

## Status

Accepted on March 9, 2026.

## Context

After the utterance-native adapter landed, review found several stop-path gaps:

- the Groq queue pump had been decoupled from downstream commit latency, but
  `user_stop` could still wedge if the renderer was blocked on queue capacity
  while main waited for the renderer stop acknowledgement
- downstream `onFinalSegment(...)` work could still hang `user_stop` forever if
  commit never resolved
- a completed-upload item could arrive in the narrow window where the emit pump
  had drained its queue but had not yet cleared its promise, orphaning the new
  completion until another emit happened later

The renderer also had no visible signal when Groq utterance delivery was blocked
behind upload backlog, and `stop()` only waited for `max_chunk` flushes instead
of any in-flight utterance send.

## Decision

For the Groq browser-VAD path:

1. main calls a Groq-only `prepareForRendererStop('user_stop')` hook before waiting for renderer ack
2. that prepare hook relaxes queue-capacity waiting for already in-flight renderer sends, without stopping the session yet
3. the adapter queue budget counts the full Groq backlog:
   active upload, pending uploads, completed uploads waiting to emit, and one in-flight emit
4. final-segment commits are still decoupled from upload start, but each commit is bounded by the same stop-budget timer and fails the session if it wedges
5. both the upload pump and emit pump self-restart if new work lands during their promise teardown window
6. renderer capture surfaces pause/resume activity when an utterance send stays blocked past a threshold
7. renderer `stop()` waits for any active utterance send before teardown

## Why This Is Acceptable

- It resolves the Groq-specific stop-ordering deadlock without changing the
  `whisper.cpp` renderer-stop handshake.
- It bounds both upload backlog and downstream commit backlog, so `user_stop`
  cannot hang forever on a wedged output consumer.
- It closes the emit-pump handoff race, so completed Groq utterances cannot get
  stranded silently.
- It turns queue pressure into an observable paused state instead of a silent stall.

## Trade-offs

- Pro: better stop correctness and better debugging signal under slow networks or slow output handling.
- Pro: bounded queue pressure now reflects the full backlog, not just upload backlog.
- Con: a permanently wedged downstream commit now fails the Groq streaming session instead of waiting indefinitely.
- Con: renderer-visible pause/resume is still inferred from blocked utterance delivery, not a dedicated main-process status channel.
- Con: structured logs are noisier in focused tests unless explicitly silenced.

## Follow-up

If backlog state needs richer UI treatment later, a future ticket can promote this
from inferred pause/resume activity into an explicit streaming runtime event.
