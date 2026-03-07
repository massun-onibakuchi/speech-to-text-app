# Where: docs/decisions/2026-03-07-streaming-ui-preserves-batch-output-settings.md
# What: Decision record for PR-8 streaming settings UX and output semantics.
# Why: Streaming raw dictation must be shippable now without overwriting the user's
#      established batch raw/transformed output preferences.

## Decision

When `processing.mode=streaming`, the renderer will show effective streaming output semantics as:

- raw dictation only
- paste at cursor forced on
- copy-to-clipboard forced off

The renderer will not overwrite `settings.output.*` to enforce that behavior. Those batch output
preferences remain persisted exactly as configured so the user can switch back to `processing.mode=default`
without rebuilding their existing batch workflow.

## Rationale

- The approved mid-term goal is raw dictation streaming only.
- Current batch raw dictation and transformed text must remain intact.
- Persistently rewriting batch output settings during a temporary mode switch would create hidden data loss
  in the user-visible settings model.
- The streaming runtime already owns its own effective output behavior through the streaming commit substrate.

## Consequences

- The Output settings section becomes read-only while streaming mode is active.
- The UI explicitly states that batch output settings are preserved for Default mode.
- Streaming output failures must surface through streaming error events rather than through the batch history path.

## Rejected Alternative

Persistently rewriting `settings.output` to match streaming paste-only behavior.

- Pros: fewer UI distinctions between effective and persisted behavior.
- Cons: would silently destroy batch-mode preferences and violate the requirement to keep existing features unchanged.
