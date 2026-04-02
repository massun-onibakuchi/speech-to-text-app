// Where: Main-process local-LLM config.
// What:  Central runtime tunables for local-LLM integration.
// Why:   Keep timeout and similar operational knobs out of orchestration code.

export const LOCAL_LLM_DISCOVERY_TIMEOUT_MS = 5_000
export const LOCAL_CLEANUP_TIMEOUT_MS = 15_000
export const LOCAL_LLM_TRANSFORMATION_TIMEOUT_MS = 15_000
