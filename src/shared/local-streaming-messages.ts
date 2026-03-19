// Where: Shared module (main + renderer).
// What: User-facing local streaming status and guardrail messages shared across app layers.
// Why: Ticket 7 enables raw local dictation only, so both main and renderer need one durable source
//      for the transformed-mode fail-fast guidance.

export const LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_MESSAGE =
  'Transformed local streaming is not available yet. Switch output mode to Transcript for now.'

export const LOCAL_STREAMING_TRANSFORMED_OUTPUT_BLOCKED_NEXT_STEP =
  'Open Settings > Output and switch to Transcript until transformed local streaming is enabled.'
