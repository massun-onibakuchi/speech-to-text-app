<!--
Where: docs/decisions/2026-03-09-groq-stop-backpressure-hardening-decision.md
What: Decision note for the T440-05 stop and backpressure hardening pass.
Why: The Groq utterance-native path needs explicit rules for bounded upload drain,
     renderer-visible backpressure, and in-flight utterance stop behavior.
-->

# Decision: Groq Stop Budget Applies To Upload Drain, Not Downstream Commit

## Status

Accepted on March 9, 2026.

## Context

After the utterance-native adapter landed, review found that the Groq queue pump
was still awaiting `onFinalSegment(...)` before starting the next upload. That
incorrectly coupled upload progress and stop timeout behavior to downstream
transform/output latency.

The renderer also had no visible signal when Groq utterance delivery was blocked
behind upload backlog, and `stop()` only waited for `max_chunk` flushes instead
of any in-flight utterance send.

## Decision

For the Groq browser-VAD path:

1. the adapter serializes uploads, not downstream segment commit
2. already-uploaded utterances continue committing even if the upload stop budget expires
3. the upload queue is bounded and blocks new utterances when capacity is full
4. renderer capture surfaces pause/resume activity when an utterance send stays blocked past a threshold
5. renderer `stop()` waits for any active utterance send before teardown

## Why This Is Acceptable

- It restores the intended “upload serial, output independent” behavior.
- It prevents slow transform/output work from consuming the Groq upload stop budget.
- It turns queue pressure into an observable paused state instead of a silent stall.
- It keeps the shared session-state contract unchanged in the final hardening ticket.

## Trade-offs

- Pro: better stop correctness and better debugging signal under slow networks.
- Pro: bounded queue pressure now produces deterministic backpressure.
- Con: renderer-visible pause/resume is inferred from blocked utterance delivery, not a dedicated main-process status channel.
- Con: structured logs are noisier in focused tests unless explicitly silenced.

## Follow-up

If backlog state needs richer UI treatment later, a future ticket can promote this
from inferred pause/resume activity into an explicit streaming runtime event.
