<!--
Where: docs/decisions/2026-03-09-groq-utterance-message-port-ipc-decision.md
What: Decision note for the Groq utterance IPC transport introduced in T440-03.
Why: The Groq renderer capture path now ships WAV utterances to main, and this
     records why the implementation uses one-shot message ports instead of the
     existing invoke-based IPC or a long-lived background port.
-->

# Decision: Groq Utterance IPC Uses One-Shot Message Ports

## Status

Accepted on March 9, 2026.

## Context

Ticket `T440-03` requires a dedicated Groq utterance transport that does not depend on
the old invoke-based structured-clone path for large audio payloads.

Electron `ipcRenderer.invoke()` is request/response friendly, but it does not give us
a transfer-aware `ArrayBuffer` handoff for the WAV payload.

Electron `ipcRenderer.postMessage()` can transfer `MessagePort`s to main. A `MessagePort`
message can then transfer the utterance `ArrayBuffer`.

## Decision

The preload bridge creates a fresh `MessageChannel` per Groq utterance send:

1. transfer one port to main with `ipcRenderer.postMessage(...)`
2. send the utterance payload over the paired renderer port with `[chunk.wavBytes]`
3. wait for an acknowledgement or error reply from main
4. close the ports after the one-shot exchange completes

## Why This Is Acceptable

- It satisfies the transfer-aware handoff requirement for `wavBytes`.
- It keeps the public renderer API promise-based.
- It avoids introducing a long-lived background port lifecycle in the same ticket.
- It preserves the existing owner-window enforcement in main before the chunk reaches the controller.

## Trade-offs

- Pro: small surface area and explicit request/ack semantics.
- Pro: easy to fail one utterance cleanly without poisoning later sends.
- Con: more per-send setup than a long-lived port.
- Con: more IPC plumbing than a simple `invoke()` handler.

## Follow-up

If Groq utterance throughput later makes one-shot ports too expensive, a future ticket can
upgrade this to a long-lived port while preserving the same shared utterance contract.
