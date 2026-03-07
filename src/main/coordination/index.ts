// src/main/coordination/index.ts
// Barrel export for coordination modules.

export type { OrderedOutputCoordinator } from './ordered-output-coordinator'
export { GLOBAL_OUTPUT_ORDER_SCOPE, SerialOutputCoordinator } from './ordered-output-coordinator'
export type { ClipboardStatePolicy } from './clipboard-state-policy'
export { PermissiveClipboardPolicy, StreamingPasteClipboardPolicy } from './clipboard-state-policy'
