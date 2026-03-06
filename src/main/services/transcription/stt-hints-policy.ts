// Where: src/main/services/transcription/stt-hints-policy.ts
// What: Canonical constants for STT hint normalization and provider limits.
// Why: Keep provider-specific prompt/keyterm limits centralized and testable.

export const GROQ_PROMPT_MAX_TOKENS = 224
// Conservative fallback when no tokenizer is available; biases toward under-limit.
export const APPROX_CHARS_PER_TOKEN = 3
export const GROQ_PROMPT_MAX_CHARS = GROQ_PROMPT_MAX_TOKENS * APPROX_CHARS_PER_TOKEN

export const ELEVENLABS_KEYTERMS_MAX_ITEMS = 100
export const ELEVENLABS_KEYTERM_MAX_CHARS = 49
export const ELEVENLABS_KEYTERM_MAX_WORDS = 5
