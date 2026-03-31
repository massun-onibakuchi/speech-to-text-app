// Where: Main-process local-LLM config.
// What:  Central runtime tunables for local cleanup integration.
// Why:   Keep timeout and similar operational knobs out of orchestration code.

export const LOCAL_CLEANUP_TIMEOUT_MS = 15_000
