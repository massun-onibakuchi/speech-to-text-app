// src/main/coordination/clipboard-state-policy.ts
// Interface for clipboard state management policy.
// Determines whether/when clipboard can be safely read or written during output.
// Stub for forward compatibility; concrete implementation in Phase 2B.
// The permissive policy allows all operations unconditionally.

export interface ClipboardStatePolicy {
  /** Whether clipboard write is currently safe (not mid-paste). */
  canWrite(): boolean
  /** Whether clipboard read is currently safe (content is stable). */
  canRead(): boolean
  /** Notify that a clipboard write is about to happen. */
  willWrite(): void
  /** Notify that a clipboard write completed. */
  didWrite(): void
}

/** No-op policy that permits all clipboard operations. */
export class PermissiveClipboardPolicy implements ClipboardStatePolicy {
  canWrite(): boolean {
    return true
  }
  canRead(): boolean {
    return true
  }
  willWrite(): void {
    /* no-op */
  }
  didWrite(): void {
    /* no-op */
  }
}
