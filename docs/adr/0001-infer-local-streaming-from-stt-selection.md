---
title: Infer local streaming from STT provider selection
description: Route local streaming from the selected STT provider and model instead of introducing a separate processing mode.
date: 2026-03-18
status: accepted
tags:
  - architecture
  - streaming
  - stt
  - local
---

<!--
Where: docs/adr/0001-infer-local-streaming-from-stt-selection.md
What: Durable decision record for how the app activates the local streaming lane.
Why: Prevent duplicate routing state and keep the settings model aligned with the approved product behavior.
-->

# Context

The app already has an STT provider/model selection flow in Settings.

The local streaming feature adds a new local provider with different runtime behavior:

- transcription runs locally instead of through the existing batch HTTP path
- output semantics are locked to paste-at-cursor
- the feature is supported only on Apple Silicon macOS
- runtime installation and prepare/startup become part of local session startup

An earlier draft of the spec introduced a separate `processing.mode` setting with an additional `streaming.enabled` flag. That created duplicate routing state on top of the existing STT provider/model selection.

# Decision

The app will infer local streaming behavior from the selected STT provider and model.

Specifically:

- selecting `transcription.provider=local_whisperlivekit` routes recording commands to the local streaming lane
- selecting any cloud STT provider routes recording commands to the existing batch capture/transcription lane
- the app will not expose a separate `processing.mode` control for this feature
- the app will not persist a second enablement boolean for local streaming

# Alternatives considered

## Separate processing mode setting

This was rejected because it introduces redundant state and invalid combinations:

- cloud provider plus streaming mode
- local provider plus batch mode
- mode plus extra enablement boolean drifting out of sync

That pushes routing correctness into validation and migration logic instead of making the valid state obvious in the schema.

## Hide routing entirely behind runtime heuristics

This was rejected because the app should not silently reinterpret cloud providers as local, or local providers as cloud, based on partial settings or machine capabilities.

# Consequences

Positive:

- one settings choice owns routing
- fewer invalid states are representable
- the existing Settings flow remains intact
- the implementation can remove legacy processing-mode scaffolding instead of preserving backward compatibility

Negative:

- local-specific behavior is now tied directly to provider identity
- future support for multiple local streaming providers will still require careful provider/model contract design
- unsupported platforms must gate local provider visibility correctly in the UI and runtime
