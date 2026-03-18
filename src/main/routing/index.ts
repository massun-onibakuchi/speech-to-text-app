// src/main/routing/index.ts
// Barrel export for the routing module.

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
