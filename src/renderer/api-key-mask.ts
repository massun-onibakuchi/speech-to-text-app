/*
Where: src/renderer/api-key-mask.ts
What: Shared fixed redaction string for masked API key input rendering.
Why: Issue #297 requires a constant-length mask so saved key length cannot be inferred from UI.
*/

export const FIXED_API_KEY_MASK = '*'.repeat(50)
