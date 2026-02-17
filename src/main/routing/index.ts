// src/main/routing/index.ts
// Barrel export for the routing module.

export { ModeRouter } from './mode-router'
export type { ProcessingMode } from './processing-mode'
export type { ProcessingModeSource } from './processing-mode-source'
export { LegacyProcessingModeSource } from './processing-mode-source'
export type { ExecutionContext, QueueLane } from './execution-context'
export type {
  CaptureRequestSnapshot,
  TransformationProfileSnapshot
} from './capture-request-snapshot'
export { createCaptureRequestSnapshot } from './capture-request-snapshot'
export type {
  TransformationRequestSnapshot,
  TransformationTextSource
} from './transformation-request-snapshot'
export { createTransformationRequestSnapshot } from './transformation-request-snapshot'
